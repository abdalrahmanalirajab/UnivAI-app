"use client";

import { useRef, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

export default function ContainerScrollShowcase({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ["start end", "end start"],
  });
  const rotateX = useTransform(scrollYProgress, [0.08, 0.42], [10, 0]);
  const scale = useTransform(scrollYProgress, [0.08, 0.42], [0.92, 1]);
  const y = useTransform(scrollYProgress, [0.08, 0.42], [70, 0]);

  return (
    <Box ref={container} className="scroll-showcase">
      <motion.div
        className="scroll-showcase-stage"
        style={reduceMotion ? undefined : { rotateX, scale, y }}
      >
        <Paper className="scroll-showcase-frame" elevation={0}>
          <div className="scroll-showcase-toolbar" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          {children}
        </Paper>
      </motion.div>
    </Box>
  );
}
