"use client";

import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SendIcon from "@mui/icons-material/Send";
import ReplayIcon from "@mui/icons-material/Replay";

/**
 * What we heard, before it is asked.
 *
 * Speech recognition mishears names and technical terms constantly, and a wrong
 * question fetches the wrong passage. So nothing is ever asked on the student's
 * behalf: the transcript lands here, they fix it if it is wrong, and only then
 * does it go to the book. The lecture stays paused while they do.
 */

type Props = {
  transcript: string | null;
  onSend: (question: string) => Promise<void> | void;
  onRetry: () => Promise<void> | void;
  onCancel: () => Promise<void> | void;
};

export default function TranscriptReview({ transcript, onSend, onRetry, onCancel }: Props) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<"send" | "retry" | "cancel" | null>(null);

  useEffect(() => {
    setText(transcript ?? "");
    setPending(null);
  }, [transcript]);

  if (transcript === null) return null;

  return (
    <Card variant="outlined" aria-busy={pending !== null}>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="overline" color="text.secondary">
            {text ? "We heard this — edit it if we got it wrong" : "Type your question"}
          </Typography>

          <TextField
            fullWidth
            multiline
            minRows={2}
            autoFocus
            disabled={pending !== null}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter starts a new line.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (text.trim() && pending === null) {
                  setPending("send");
                  Promise.resolve(onSend(text.trim())).catch(() => setPending(null));
                }
              }
            }}
            label="Your question"
            helperText={
              text
                ? "The lecture is paused. Press Enter to ask, or discard it and carry on."
                : "Voice recognition did not finish. The lecture stays paused while you type."
            }
          />

          <Grid container spacing={2}>
            <Grid>
              <Button
                variant="contained"
                startIcon={<SendIcon />}
                disabled={!text.trim() || pending !== null}
                onClick={() => {
                  setPending("send");
                  Promise.resolve(onSend(text.trim())).catch(() => setPending(null));
                }}
              >
                {pending === "send" ? "Sending…" : "Ask the lecturer"}
              </Button>
            </Grid>
            <Grid>
              <Button
                variant="outlined"
                startIcon={<ReplayIcon />}
                disabled={pending !== null}
                onClick={() => {
                  setPending("retry");
                  Promise.resolve(onRetry()).catch(() => setPending(null));
                }}
              >
                {pending === "retry" ? "Restarting…" : "Try microphone again"}
              </Button>
            </Grid>
            <Grid>
              <Button
                variant="outlined"
                color="secondary"
                disabled={pending !== null}
                onClick={() => {
                  setPending("cancel");
                  Promise.resolve(onCancel()).catch(() => setPending(null));
                }}
              >
                {pending === "cancel" ? "Discarding…" : "Discard"}
              </Button>
            </Grid>
          </Grid>
        </Stack>
      </CardContent>
    </Card>
  );
}
