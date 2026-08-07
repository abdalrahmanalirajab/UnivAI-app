"use client";

import { useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type UploadStatus = "idle" | "pending" | "uploading" | "success" | "failed" | "offline";

type UploadEntry = {
  id: number;
  file: File;
  status: UploadStatus;
  error?: string;
  documentId?: number;
  collectionId?: number;
  bookId?: number;
};

type Props = {
  collectionId?: number;
  onDocumentsChange: () => void;
};

const STATUS_COLOR: Record<UploadStatus, "default" | "warning" | "success" | "error" | "info"> = {
  idle: "default",
  pending: "default",
  uploading: "warning",
  success: "success",
  failed: "error",
  offline: "info",
};

const STATUS_LABEL: Record<UploadStatus, string> = {
  idle: "Idle",
  pending: "Selected",
  uploading: "Uploading…",
  success: "Uploaded",
  failed: "Failed",
  offline: "You're offline",
};

// The Agent owns one ordered lane per learner. Keep this client honest too:
// books from one account run in order while other accounts run independently.
const MAX_CONCURRENT = 1;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MultiBookUploader({ collectionId, onDocumentsChange }: Props) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);
  const queueRef = useRef<UploadEntry[]>([]);
  const queuedIdsRef = useRef(new Set<number>());
  const activeIdsRef = useRef(new Set<number>());
  const activeRef = useRef(0);

  function pump() {
    while (activeRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const entry = queueRef.current.shift()!;
      queuedIdsRef.current.delete(entry.id);
      activeIdsRef.current.add(entry.id);
      activeRef.current += 1;
      void runUpload(entry).finally(() => {
        activeRef.current -= 1;
        activeIdsRef.current.delete(entry.id);
        pump();
      });
    }
  }

  /**
   * SHA-256 of the chosen file, computed here so the server can recognise a
   * book it has seen before.
   *
   * This is a HINT, never a credential. The server re-hashes the bytes it
   * actually received and uses its own answer for anything that grants access
   * — otherwise a client could name someone else's hash and be handed their
   * book. crypto.subtle needs a secure context, so this is null on plain HTTP
   * from a non-localhost origin; the server hashes regardless.
   */
  async function sha256Hex(file: File): Promise<string | null> {
    if (!globalThis.crypto?.subtle) return null;
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      return null;
    }
  }

  async function runUpload(entry: UploadEntry) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id ? { ...e, status: "uploading" as const, error: undefined } : e,
      ),
    );
    const body = new FormData();
    body.append("file", entry.file);
    const clientSha256 = await sha256Hex(entry.file);
    if (clientSha256) body.append("clientSha256", clientSha256);
    if (entry.documentId) body.append("documentId", String(entry.documentId));
    if (entry.bookId) body.append("bookId", String(entry.bookId));
    if (entry.collectionId ?? collectionId) {
      body.append("collectionId", String(entry.collectionId ?? collectionId));
    }
    let res: Response;
    try {
      res = await fetch("/api/upload", { method: "POST", body });
    } catch {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id ? { ...e, status: "offline" as const, error: undefined } : e,
        ),
      );
      return;
    }
    try {
      const data = await res.json().catch(() => null);
      if (Number.isInteger(data?.documentId)) entry.documentId = data.documentId;
      if (Number.isInteger(data?.collectionId)) entry.collectionId = data.collectionId;
      if (Number.isInteger(data?.bookId)) entry.bookId = data.bookId;
      if (!res.ok) {
        throw new Error(data?.error ?? data?.detail ?? "Upload failed.");
      }
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? {
                ...e,
                status: "success" as const,
                documentId: entry.documentId,
                collectionId: entry.collectionId,
                bookId: entry.bookId,
              }
            : e,
        ),
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
                documentId: entry.documentId,
                collectionId: entry.collectionId,
                bookId: entry.bookId,
              }
            : e,
        ),
      );
      if (entry.documentId) onDocumentsChange();
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
  }

  function startUploads() {
    const selected = entries.filter(
      (entry) =>
        entry.status === "pending" &&
        !queuedIdsRef.current.has(entry.id) &&
        !activeIdsRef.current.has(entry.id),
    );
    if (selected.length === 0) return;
    queueRef.current.push(...selected);
    selected.forEach((entry) => queuedIdsRef.current.add(entry.id));
    pump();
  }

  function removeSelected(entry: UploadEntry) {
    if (entry.status !== "pending" || queuedIdsRef.current.has(entry.id)) return;
    setEntries((prev) => prev.filter((candidate) => candidate.id !== entry.id));
  }

  function clearSelected() {
    setEntries((prev) =>
      prev.filter(
        (entry) => entry.status !== "pending" || queuedIdsRef.current.has(entry.id),
      ),
    );
  }

  function retry(entry: UploadEntry) {
    if (entry.status !== "failed" && entry.status !== "offline") return;
    if (queuedIdsRef.current.has(entry.id) || activeIdsRef.current.has(entry.id)) return;
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id ? { ...e, status: "pending" as const, error: undefined } : e,
      ),
    );
    queueRef.current.push(entry);
    queuedIdsRef.current.add(entry.id);
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
              <input
                ref={inputRef}
                type="file"
                hidden
                multiple
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  enqueue(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
            </Button>
            <Typography variant="body2" color={dragging ? "primary" : "text.secondary"}>
              {dragging ? "Drop the PDFs to add them" : "…or drag and drop PDFs here"}
            </Typography>
          </Stack>

          {entries.length > 0 ? (
            <Stack spacing={1}>
              {entries.some((entry) => entry.status === "pending") ? (
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" onClick={startUploads}>
                    Start upload
                  </Button>
                  <Button variant="outlined" onClick={clearSelected}>
                    Clear selected
                  </Button>
                </Stack>
              ) : null}
              {entries.some((entry) => entry.status === "offline") ? (
                <Alert severity="warning">
                  <AlertTitle>No connection</AlertTitle>
                  You appear to be offline. Queued uploads are waiting, and files that
                  could not reach the server are marked below — retry them when your
                  connection returns.
                </Alert>
              ) : null}
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
                  {entry.status === "pending" ? (
                    <Button size="small" onClick={() => removeSelected(entry)}>
                      Remove
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      disabled={entry.status !== "failed" && entry.status !== "offline"}
                      onClick={() => retry(entry)}
                    >
                      Retry
                    </Button>
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
