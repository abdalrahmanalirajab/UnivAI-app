"use client";

import { motion, useReducedMotion } from "motion/react";

const PATH_COUNT = 24;

function pathsFor(position: 1 | -1) {
  return Array.from({ length: PATH_COUNT }, (_, index) => ({
    id: `${position}-${index}`,
    d: `M-${380 - index * 5 * position} -${189 + index * 6}C-${
      380 - index * 5 * position
    } -${189 + index * 6} -${312 - index * 5 * position} ${216 - index * 6} ${
      152 - index * 5 * position
    } ${343 - index * 6}C${616 - index * 5 * position} ${470 - index * 6} ${
      684 - index * 5 * position
    } ${875 - index * 6} ${684 - index * 5 * position} ${875 - index * 6}`,
    width: 0.55 + index * 0.035,
    opacity: 0.08 + index * 0.018,
    duration: 22 + (index % 7) * 1.75,
  }));
}

const FORWARD_PATHS = pathsFor(1);
const BACKWARD_PATHS = pathsFor(-1);

export default function BackgroundPaths() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="background-paths" aria-hidden="true">
      <svg viewBox="0 0 696 316" fill="none" preserveAspectRatio="xMidYMid slice">
        {[...FORWARD_PATHS, ...BACKWARD_PATHS].map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={path.opacity}
            initial={reduceMotion ? false : { pathLength: 0.35, opacity: 0.25 }}
            animate={
              reduceMotion
                ? { pathLength: 1, opacity: path.opacity }
                : {
                    pathLength: 1,
                    pathOffset: [0, 1, 0],
                    opacity: [path.opacity * 0.55, path.opacity, path.opacity * 0.55],
                  }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    duration: path.duration,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "linear",
                  }
            }
          />
        ))}
      </svg>
    </div>
  );
}
