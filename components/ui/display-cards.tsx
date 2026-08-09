"use client";

import type { ReactNode } from "react";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { motion, useReducedMotion } from "motion/react";

export type DisplayCardItem = {
  title: string;
  detail: string;
  status: string;
  icon: ReactNode;
};

export default function DisplayCards({ items }: { items: DisplayCardItem[] }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="display-cards" aria-label="UnivAI course flow preview">
      {items.slice(0, 3).map((item, index) => (
        <motion.div
          key={item.title}
          className={`display-card-layer display-card-layer-${index + 1}`}
          initial={reduceMotion ? false : { opacity: 0, y: 30, rotate: 0 }}
          animate={{ opacity: 1, y: 0, rotate: index === 0 ? -5 : index === 2 ? 5 : 0 }}
          whileHover={reduceMotion ? undefined : { scale: 1.025, rotate: 0, zIndex: 5 }}
          transition={{ delay: reduceMotion ? 0 : 0.18 + index * 0.14, duration: 0.5 }}
        >
          <Paper className="display-card" elevation={0}>
            <Stack direction="row" spacing={2} className="align-center">
              <Avatar variant="rounded" className="display-card-icon">
                {item.icon}
              </Avatar>
              <Stack spacing={0.25} className="display-card-copy">
                <Typography variant="subtitle1">{item.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.detail}
                </Typography>
              </Stack>
              <Chip size="small" color="success" label={item.status} />
            </Stack>
          </Paper>
        </motion.div>
      ))}
    </div>
  );
}
