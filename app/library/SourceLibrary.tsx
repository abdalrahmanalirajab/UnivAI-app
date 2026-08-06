"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import { formatDateTime, formatRelative, useVirtualClock } from "@/lib/time";

type Document = {
  id: number;
  filename: string;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  generation_status?: string | null;
  generation_progress?: string | null;
  generation_error?: string | null;
};

export type CurriculumReadiness = {
  ready: boolean;
  processing: boolean;
  failed: boolean;
  message: string;
};

function signature(documents: Document[]): string {
  return [...documents]
    .sort((a, b) => a.id - b.id)
    .map((d) =>
      [
        d.id,
        d.status,
        d.error ?? "",
        d.updated_at,
        d.generation_status ?? "",
        d.generation_progress ?? "",
        d.generation_error ?? "",
      ].join("|"),
    )
    .join("\n");
}

const STATUS_LABEL: Record<string, string> = {
  ready: "ready",
  failed: "failed",
  uploading: "uploading",
  pending: "pending",
};

function courseStatus(doc: Document): {
  color: "success" | "error" | "warning" | "default";
  label: string;
  detail: string | null;
  processing: boolean;
} {
  if (doc.status === "failed") {
    return { color: "error", label: "Indexing failed", detail: doc.error, processing: false };
  }
  if (doc.status !== "ready") {
    return {
      color: doc.status === "uploading" ? "warning" : "default",
      label: doc.status === "uploading" ? "Indexing book" : STATUS_LABEL[doc.status] ?? doc.status,
      detail: doc.status === "uploading" ? "Reading and embedding the PDF…" : null,
      processing: true,
    };
  }
  if (doc.generation_status === "failed") {
    return {
      color: "error",
      label: "Course generation failed",
      detail: doc.generation_error ?? null,
      processing: false,
    };
  }
  if (doc.generation_status === "ready") {
    return {
      color: "success",
      label: "Course ready",
      detail: doc.generation_progress ?? null,
      processing: false,
    };
  }
  // Older API fixtures only carried the document status. Keep those consumers
  // compatible; the live endpoint always returns this field (including null).
  if (doc.generation_status === undefined) {
    return { color: "success", label: "Course ready", detail: null, processing: false };
  }
  return {
    color: "warning",
    label: doc.generation_status === "ingesting" ? "Indexing book" : "Generating course",
    detail: doc.generation_progress ?? "Preparing course generation…",
    processing: true,
  };
}

function curriculumReadiness(documents: Document[]): CurriculumReadiness {
  if (documents.length === 0) {
    return { ready: false, processing: false, failed: false, message: "Upload a PDF to begin." };
  }
  const failed = documents.find((doc) => doc.status === "failed" || doc.generation_status === "failed");
  if (failed) {
    const status = courseStatus(failed);
    return {
      ready: false,
      processing: false,
      failed: true,
      message: `${failed.filename}: ${status.detail ?? status.label}`,
    };
  }
  const unfinished = documents.find((doc) => courseStatus(doc).processing);
  if (unfinished) {
    const status = courseStatus(unfinished);
    return {
      ready: false,
      processing: true,
      failed: false,
      message: `${unfinished.filename}: ${status.detail ?? status.label}`,
    };
  }
  return {
    ready: true,
    processing: false,
    failed: false,
    message: "Every book has finished generating. Your curriculum is ready to build.",
  };
}

type Props = {
  collectionId: number;
  reloadKey?: number;
  onReadinessChange?: (readiness: CurriculumReadiness) => void;
};

export default function SourceLibrary({
  collectionId,
  reloadKey = 0,
  onReadinessChange,
}: Props) {
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);
  const documentsRef = useRef<Document[] | null>(null);
  const now = useVirtualClock();

  const load = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch(`/api/collections/${collectionId}/documents`, {
        cache: "no-store",
      });
    } catch {
      setOffline(true);
      setError(null);
      return;
    }
    setOffline(false);
    let data: { documents?: unknown; error?: string };
    try {
      data = await res.json();
    } catch {
      setError("The library service returned an invalid response. Please retry.");
      return;
    }
    if (!res.ok) {
      setError(data.error ?? `Could not load sources (${res.status}).`);
      return;
    }
    if (!Array.isArray(data.documents)) {
      setError("The library response is missing its documents.");
      return;
    }
    setError(null);
    setRemoveError(null);
    documentsRef.current = data.documents;
    setDocuments(data.documents);
  }, [collectionId]);

  useEffect(() => {
    if (documents !== null) onReadinessChange?.(curriculumReadiness(documents));
  }, [documents, onReadinessChange]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  useEffect(() => {
    const check = async () => {
      const current = documentsRef.current;
      if (current === null) return;
      let res: Response;
      try {
        res = await fetch(`/api/collections/${collectionId}/documents`, {
          cache: "no-store",
        });
      } catch {
        return;
      }
      let data: { documents?: unknown };
      try {
        data = await res.json();
      } catch {
        return;
      }
      if (!res.ok || !Array.isArray(data.documents)) return;
      setOffline(false);
      if (signature(data.documents) !== signature(current)) {
        documentsRef.current = data.documents;
        setDocuments(data.documents);
      }
    };
    const poll = setInterval(() => void check(), 5_000);
    return () => clearInterval(poll);
  }, [collectionId]);

  async function handleRemove(documentId: number) {
    setRemoveError(null);
    setRemoving(documentId);
    let res: Response;
    try {
      res = await fetch(
        `/api/collections/${collectionId}/documents?documentId=${documentId}`,
        { method: "DELETE" },
      );
    } catch {
      setRemoving(null);
      setOffline(true);
      return;
    }
    let data: { error?: string };
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      setRemoving(null);
      setRemoveError(data.error ?? `Could not remove this source (${res.status}).`);
      return;
    }
    await load();
    setRemoving(null);
  }

  async function handleRetry(doc: Document) {
    setRemoveError(null);
    setRetrying(doc.id);
    const body = new FormData();
    body.append("documentId", String(doc.id));
    body.append("collectionId", String(collectionId));
    let res: Response;
    try {
      res = await fetch("/api/upload", { method: "POST", body });
    } catch {
      setRetrying(null);
      setOffline(true);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setRetrying(null);
      setRemoveError(data?.error ?? `Could not retry this source (${res.status}).`);
      return;
    }
    await load();
    setRetrying(null);
  }

  const loading = documents === null && !error && !offline;

  return (
    <Stack spacing={2}>
      {offline ? (
        <Alert
          severity="warning"
          action={
            <Button variant="outlined" color="inherit" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          <AlertTitle>No connection</AlertTitle>
          You appear to be offline.{" "}
          {documents !== null ? "Showing your earlier list — " : ""}the source list will
          reload once the connection returns.
        </Alert>
      ) : null}

      {error ? (
        <Alert
          severity="error"
          action={
            <Button variant="outlined" color="inherit" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          <AlertTitle>Could not load sources</AlertTitle>
          {error}
        </Alert>
      ) : null}

      {removeError ? (
        <Alert severity="error">
          <AlertTitle>Could not remove source</AlertTitle>
          {removeError}
        </Alert>
      ) : null}

      {loading ? (
        <Stack direction="row" spacing={2}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Loading your sources…
          </Typography>
        </Stack>
      ) : null}

      {documents !== null && documents.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No sources yet. Upload PDFs below.
        </Typography>
      ) : null}

      {documents !== null && documents.length > 0 ? (
        <Card variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Source</TableCell>
                <TableCell>Uploaded</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {documents.map((doc) => {
                const status = courseStatus(doc);
                return (
                  <TableRow key={doc.id}>
                    <TableCell>{doc.filename}</TableCell>
                    <TableCell>
                      {formatDateTime(doc.created_at)}
                      <Typography variant="caption" color="text.secondary" component="div">
                        {formatRelative(doc.created_at, now)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={1}>
                        <Stack direction="row" spacing={1}>
                          <Chip
                            size="small"
                            color={status.color}
                            label={status.label}
                          />
                          {status.processing ? <CircularProgress size={16} /> : null}
                        </Stack>
                        {status.detail ? (
                          <Typography
                            variant="caption"
                            color={status.color === "error" ? "error" : "text.secondary"}
                          >
                            {status.detail}
                          </Typography>
                        ) : null}
                        {status.processing ? <LinearProgress /> : null}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1}>
                        {doc.status === "failed" ? (
                          <Button
                            size="small"
                            onClick={() => void handleRetry(doc)}
                            disabled={retrying === doc.id || removing === doc.id}
                          >
                            {retrying === doc.id ? "Retrying…" : "Retry"}
                          </Button>
                        ) : null}
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => void handleRemove(doc.id)}
                          disabled={removing === doc.id || retrying === doc.id}
                          aria-label={`Remove source ${doc.filename}`}
                        >
                          {removing === doc.id ? (
                            <CircularProgress size={16} />
                          ) : (
                            <DeleteIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </Stack>
  );
}
