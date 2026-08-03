"use client";

import { useRef, useState } from "react";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Input from "@mui/material/Input";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type UploadStatus = "idle" | "pending" | "uploading" | "success" | "failed";

type UploadEntry = {
  id: number;
  file: File;
  status: UploadStatus;
  error?: string;
};

type Props = {
  collectionId: number;
  onDocumentsChange: () => void;
};

const STATUS_COLOR: Record<UploadStatus, "default" | "warning" | "success" | "error"> = {
  idle: "default",
  pending: "default",
  uploading: "warning",
  success: "success",
  failed: "error",
};

const STATUS_LABEL: Record<UploadStatus, string> = {
  idle: "Idle",
  pending: "Pending",
  uploading: "Uploading…",
  success: "Uploaded",
  failed: "Failed",
};

const MAX_CONCURRENT = 2;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MultiBookUploader({ collectionId, onDocumentsChange }: Props) {
  void collectionId;
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);
  const queueRef = useRef<UploadEntry[]>([]);
  const activeRef = useRef(0);

  function pump() {
    while (activeRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const entry = queueRef.current.shift()!;
      activeRef.current += 1;
      void runUpload(entry).finally(() => {
        activeRef.current -= 1;
        pump();
      });
    }
  }

  async function runUpload(entry: UploadEntry) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id ? { ...e, status: "uploading" as const, error: undefined } : e,
      ),
    );
    try {
      const body = new FormData();
      body.append("file", entry.file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? data?.detail ?? "Upload failed.");
      }
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: "success" as const } : e)),
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

  function enqueue(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const fresh: UploadEntry[] = Array.from(files).map((file) => ({
      id: ++idCounter.current,
      file,
      status: "pending" as const,
    }));
    setEntries((prev) => [...prev, ...fresh]);
    queueRef.current.push(...fresh);
    pump();
  }

  function retry(entry: UploadEntry) {
    if (entry.status !== "failed") return;
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id ? { ...e, status: "pending" as const, error: undefined } : e,
      ),
    );
    queueRef.current.push(entry);
    pump();
  }

  return (
    <Card
      variant="outlined"
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        enqueue(event.dataTransfer.files);
      }}
    >
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="subtitle1">Upload PDFs</Typography>

          <Stack direction="row" spacing={2}>
            <Button variant="contained" component="label">
              Choose PDFs
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
                  enqueue((event.target as HTMLInputElement).files)
                }
              />
            </Button>
            <Typography variant="body2" color={dragging ? "primary" : "text.secondary"}>
              {dragging ? "Drop the PDFs to add them" : "…or drag and drop PDFs here"}
            </Typography>
          </Stack>

          {entries.length > 0 ? (
            <Stack spacing={1}>
              {entries.map((entry) => (
                <Stack key={entry.id} direction="row" spacing={2}>
                  <Typography variant="body2" noWrap>
                    {entry.file.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatBytes(entry.file.size)}
                  </Typography>
                  <Chip
                    size="small"
                    color={STATUS_COLOR[entry.status]}
                    label={STATUS_LABEL[entry.status]}
                  />
                  {entry.status === "uploading" ? <LinearProgress /> : null}
                  {entry.status === "failed" && entry.error ? (
                    <Typography variant="caption" color="error">
                      {entry.error}
                    </Typography>
                  ) : null}
                  <Button
                    size="small"
                    disabled={entry.status !== "failed"}
                    onClick={() => retry(entry)}
                  >
                    Retry
                  </Button>
                </Stack>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
