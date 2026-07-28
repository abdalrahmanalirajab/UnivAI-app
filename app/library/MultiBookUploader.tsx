"use client";

import { useRef, useState } from "react";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Input from "@mui/material/Input";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type UploadEntry = {
  id: number;
  file: File;
  status: "uploading" | "done" | "failed";
  error?: string;
};

type Props = {
  collectionId: number;
  onDocumentsChange: () => void;
};

export default function MultiBookUploader({ collectionId, onDocumentsChange }: Props) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);

  const busy = entries.some((e) => e.status === "uploading");

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const fresh: UploadEntry[] = Array.from(files).map((file) => ({
      id: ++idCounter.current,
      file,
      status: "uploading" as const,
    }));
    setEntries((prev) => [...prev, ...fresh]);
    fresh.forEach((entry) => uploadOne(entry));
  }

  async function uploadOne(entry: UploadEntry) {
    try {
      const body = new FormData();
      body.append("file", entry.file);
      const res = await fetch(`/api/collections/${collectionId}/documents`, {
        method: "POST",
        body,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload failed.");
      }
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: "done" as const } : e)),
      );
      onDocumentsChange();
    } catch (err) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? {
                ...e,
                status: "failed" as const,
                error: err instanceof Error ? err.message : "Upload failed.",
              }
            : e,
        ),
      );
    }
  }

  function retry(entry: UploadEntry) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id ? { ...e, status: "uploading" as const, error: undefined } : e,
      ),
    );
    uploadOne(entry);
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="subtitle1">Upload PDFs</Typography>

          <Button variant="contained" component="label" disabled={busy}>
            {busy ? "Uploading…" : "Choose PDFs"}
            <Input
              inputRef={inputRef}
              type="file"
              hidden
              disableUnderline
              inputProps={{
                multiple: true,
                accept: "application/pdf,.pdf",
              }}
              onChange={(event) =>
                handleFiles((event.target as HTMLInputElement).files)
              }
            />
          </Button>

          {entries.length > 0 ? (
            <Stack spacing={1}>
              {entries.map((entry) => (
                <Stack
                  key={entry.id}
                  direction="row"
                  spacing={2}
                >
                  <Typography variant="body2" noWrap>
                    {entry.file.name}
                  </Typography>

                  {entry.status === "uploading" ? (
                    <Stack direction="row" spacing={1}>
                      <LinearProgress />
                      <Typography variant="caption" color="text.secondary">
                        Uploading…
                      </Typography>
                    </Stack>
                  ) : entry.status === "done" ? (
                    <Chip size="small" color="success" label="Uploaded" />
                  ) : (
                    <Stack direction="row" spacing={1}>
                      <Chip size="small" color="error" label="Failed" />
                      <Typography variant="caption" color="error">
                        {entry.error}
                      </Typography>
                      <Button size="small" onClick={() => retry(entry)}>
                        Retry
                      </Button>
                    </Stack>
                  )}
                </Stack>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
