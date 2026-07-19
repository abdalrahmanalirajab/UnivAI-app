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
  onSend: (question: string) => void;
  onCancel: () => void;
};

export default function TranscriptReview({ transcript, onSend, onCancel }: Props) {
  const [text, setText] = useState("");

  useEffect(() => {
    setText(transcript ?? "");
  }, [transcript]);

  if (transcript === null) return null;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="overline" color="text.secondary">
            We heard this — edit it if we got it wrong
          </Typography>

          <TextField
            fullWidth
            multiline
            minRows={2}
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter starts a new line.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (text.trim()) onSend(text.trim());
              }
            }}
            label="Your question"
            helperText="The lecture is paused. Press Enter to ask, or discard it and carry on."
          />

          <Grid container spacing={2}>
            <Grid>
              <Button
                variant="contained"
                startIcon={<SendIcon />}
                disabled={!text.trim()}
                onClick={() => onSend(text.trim())}
              >
                Ask the lecturer
              </Button>
            </Grid>
            <Grid>
              <Button variant="outlined" color="secondary" onClick={onCancel}>
                Discard
              </Button>
            </Grid>
          </Grid>
        </Stack>
      </CardContent>
    </Card>
  );
}
