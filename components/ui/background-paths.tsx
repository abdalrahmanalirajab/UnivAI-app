"use client";

// Adapted from Kokonut UI's MIT-licensed Background Paths component.
import { useEffect, useRef } from "react";

type BackgroundPath = {
  id: string;
  d: string;
  opacity: number;
  width: number;
};

function createPaths(position: 1 | -1): BackgroundPath[] {
  return Array.from({ length: 36 }, (_, index) => ({
    id: `background-path-${position}-${index}`,
    d: `M-${380 - index * 5 * position} -${189 + index * 6}C-${
      380 - index * 5 * position
    } -${189 + index * 6} -${312 - index * 5 * position} ${216 - index * 6} ${
      152 - index * 5 * position
    } ${343 - index * 6}C${616 - index * 5 * position} ${470 - index * 6} ${
      684 - index * 5 * position
    } ${875 - index * 6} ${684 - index * 5 * position} ${875 - index * 6}`,
    opacity: 0.08 + index * 0.012,
    width: 0.45 + index * 0.028,
  }));
}

const PRIMARY_PATHS = createPaths(1);
const SECONDARY_PATHS = createPaths(-1);
const TRAVELLER_INDICES = [5, 14, 23, 32] as const;
const TRAVELLER_DURATIONS = [16_000, 20_000, 24_000, 28_000] as const;
const VIEWBOX_WIDTH = 696;
const VIEWBOX_HEIGHT = 316;
const TARGET_FRAME_TIME = 1000 / 30;

function PathGroup({ paths, tone }: { paths: BackgroundPath[]; tone: string }) {
  return (
    <g className={`background-path-${tone}`}>
      {paths.map((path) => (
        <path
          key={path.id}
          d={path.d}
          stroke="currentColor"
          strokeWidth={path.width}
          strokeOpacity={path.opacity}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

function TravellingHighlights() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const drawingContext = canvasElement.getContext("2d", { alpha: true });
    if (!drawingContext) return;
    const canvas: HTMLCanvasElement = canvasElement;
    const context: CanvasRenderingContext2D = drawingContext;

    const primaryPaths = TRAVELLER_INDICES.map((index) => ({
      path: new Path2D(PRIMARY_PATHS[index].d),
      width: PRIMARY_PATHS[index].width + 0.5,
    }));
    const secondaryPaths = TRAVELLER_INDICES.map((index) => ({
      path: new Path2D(SECONDARY_PATHS[index].d),
      width: SECONDARY_PATHS[index].width + 0.5,
    }));

    let frameId: number | null = null;
    let lastFrameAt = 0;
    let visible = true;
    let reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cssWidth = 0;
    let cssHeight = 0;
    let renderScale = 1;
    let primaryColor = "#818cf8";
    let secondaryColor = "#2dd4bf";

    function readThemeColors() {
      const styles = getComputedStyle(document.documentElement);
      primaryColor = styles.getPropertyValue("--univai-palette-primary-main").trim() || primaryColor;
      secondaryColor =
        styles.getPropertyValue("--univai-palette-secondary-main").trim() || secondaryColor;
    }

    function prepareCanvas() {
      const bounds = canvas.getBoundingClientRect();
      cssWidth = bounds.width;
      cssHeight = bounds.height;
      renderScale = cssWidth >= 900 ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.25);
      canvas.width = Math.max(1, Math.round(cssWidth * renderScale));
      canvas.height = Math.max(1, Math.round(cssHeight * renderScale));
      readThemeColors();
    }

    function drawPaths(
      paths: Array<{ path: Path2D; width: number }>,
      color: string,
      now: number,
      phaseOffset: number,
    ) {
      context.strokeStyle = color;
      for (let index = 0; index < paths.length; index += 1) {
        const duration = TRAVELLER_DURATIONS[index];
        const progress = reduceMotion
          ? 0.28 + index * 0.12
          : ((now + phaseOffset + index * 2_900) % duration) / duration;
        const pulse = Math.sin(progress * Math.PI);
        context.globalAlpha = 0.16 + pulse * 0.56;
        context.lineWidth = paths[index].width;
        context.setLineDash([90, 210]);
        context.lineDashOffset = -progress * 300;
        context.stroke(paths[index].path);
      }
    }

    function draw(now: number) {
      if (!cssWidth || !cssHeight) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);

      const viewScale = Math.max(cssWidth / VIEWBOX_WIDTH, cssHeight / VIEWBOX_HEIGHT);
      const translateX = (cssWidth - VIEWBOX_WIDTH * viewScale) / 2;
      const translateY = (cssHeight - VIEWBOX_HEIGHT * viewScale) / 2;
      context.setTransform(
        renderScale * viewScale,
        0,
        0,
        renderScale * viewScale,
        renderScale * translateX,
        renderScale * translateY,
      );
      context.lineCap = "round";
      drawPaths(primaryPaths, primaryColor, now, 0);
      drawPaths(secondaryPaths, secondaryColor, now, 4_700);
      context.globalAlpha = 1;
      context.setLineDash([]);
    }

    function shouldAnimate() {
      return visible && !reduceMotion && !document.hidden;
    }

    function tick(now: number) {
      frameId = null;
      if (!shouldAnimate()) return;
      if (now - lastFrameAt >= TARGET_FRAME_TIME) {
        draw(now);
        lastFrameAt = now;
      }
      frameId = window.requestAnimationFrame(tick);
    }

    function syncAnimation() {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      if (shouldAnimate()) {
        frameId = window.requestAnimationFrame(tick);
      } else {
        draw(performance.now());
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      prepareCanvas();
      draw(performance.now());
    });
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        syncAnimation();
      },
      { rootMargin: "120px" },
    );
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reduceMotion = event.matches;
      syncAnimation();
    };
    const handleVisibility = () => syncAnimation();
    const themeObserver = new MutationObserver(() => {
      readThemeColors();
      draw(performance.now());
    });

    prepareCanvas();
    draw(performance.now());
    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);
    motionPreference.addEventListener("change", handleMotionPreference);
    document.addEventListener("visibilitychange", handleVisibility);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-mui-color-scheme"],
    });
    syncAnimation();

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      motionPreference.removeEventListener("change", handleMotionPreference);
      document.removeEventListener("visibilitychange", handleVisibility);
      themeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="background-path-motion-canvas" />;
}

export default function BackgroundPaths() {
  return (
    <div className="background-paths" aria-hidden="true">
      <svg
        className="background-path-svg background-path-base-layer"
        viewBox="0 0 696 316"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <PathGroup paths={PRIMARY_PATHS} tone="primary" />
        <PathGroup paths={SECONDARY_PATHS} tone="secondary" />
      </svg>
      <TravellingHighlights />
    </div>
  );
}
