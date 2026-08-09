const JOURNEY_PATHS = [
  "M 24 620 C 140 610 238 508 360 500 C 480 493 528 388 660 380 C 795 370 840 255 965 236 C 1075 220 1140 128 1236 92",
  "M 24 620 C 145 622 252 575 382 556 C 500 540 565 430 704 420 C 850 410 930 330 1042 260 C 1130 205 1175 142 1236 92",
  "M 24 620 C 122 592 236 460 350 430 C 454 402 510 324 642 320 C 770 316 838 220 970 196 C 1080 176 1150 115 1236 92",
  "M 24 620 C 120 650 218 548 330 534 C 410 524 378 442 492 444 C 605 446 612 356 742 350 C 870 344 900 232 1020 232 C 1110 232 1175 128 1236 92",
  "M 24 620 C 140 600 220 520 350 508 C 464 497 446 580 572 540 C 680 506 680 395 790 392 C 906 390 900 300 1018 272 C 1120 248 1150 138 1236 92",
  "M 24 620 C 152 632 246 540 366 530 C 476 522 535 460 626 468 C 736 478 760 330 884 322 C 1010 314 1070 188 1236 92",
  "M 24 620 C 126 604 204 486 326 470 C 438 456 472 366 590 350 C 716 334 734 418 852 354 C 974 288 1030 150 1236 92",
  "M 24 620 C 132 638 210 566 318 552 C 438 536 510 490 620 424 C 718 366 798 302 910 286 C 1050 266 1092 142 1236 92",
] as const;

const WAYPOINTS = [
  { cx: 24, cy: 620, kind: "origin" },
  { cx: 360, cy: 500, kind: "step" },
  { cx: 660, cy: 380, kind: "step" },
  { cx: 965, cy: 236, kind: "step" },
  { cx: 1236, cy: 92, kind: "horizon" },
] as const;

export default function BackgroundPaths() {
  return (
    <div className="background-paths" aria-hidden="true">
      <svg
        className="background-path-layer"
        viewBox="0 0 1260 700"
        fill="none"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="journey-line-gradient" x1="24" y1="620" x2="1236" y2="92">
            <stop stopColor="var(--univai-palette-primary-main)" />
            <stop offset="0.55" stopColor="var(--univai-palette-secondary-main)" />
            <stop offset="1" stopColor="var(--univai-palette-primary-main)" />
          </linearGradient>
          <linearGradient id="journey-light-gradient" x1="24" y1="620" x2="1236" y2="92">
            <stop stopColor="var(--univai-palette-secondary-main)" />
            <stop offset="0.5" stopColor="var(--univai-palette-primary-main)" />
            <stop offset="1" stopColor="var(--univai-palette-secondary-main)" />
          </linearGradient>
        </defs>

        <g className="journey-field">
          <g className="journey-base-lines">
            {JOURNEY_PATHS.map((path, index) => (
              <path
                key={`base-${index}`}
                className={`journey-base-path journey-base-path-${index + 1}`}
                d={path}
                pathLength={1}
                stroke="url(#journey-line-gradient)"
                strokeLinecap="round"
                strokeDasharray="0.12 0.025"
              />
            ))}
          </g>

          <g className="journey-travellers">
            {JOURNEY_PATHS.map((path, index) => (
              <path
                key={`traveller-${index}`}
                className={`journey-pulse journey-pulse-${index + 1}`}
                d={path}
                pathLength={1}
                stroke="url(#journey-light-gradient)"
                strokeLinecap="round"
                strokeDasharray="0.055 0.945"
              />
            ))}
          </g>

          <g className="journey-waypoints">
            {WAYPOINTS.map((point) => (
              <g key={`${point.cx}-${point.cy}`} className={`journey-waypoint journey-${point.kind}`}>
                <circle cx={point.cx} cy={point.cy} r={point.kind === "step" ? 8 : 11} className="journey-node-ring" />
                <circle cx={point.cx} cy={point.cy} r={point.kind === "step" ? 2.8 : 3.8} className="journey-node-core" />
              </g>
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
