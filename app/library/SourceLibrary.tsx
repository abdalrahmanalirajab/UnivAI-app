"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
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
};

const STATUS_COLOR: Record<string, "success" | "error" | "warning" | "default"> = {
  ready: "success",
  failed: "error",
  uploading: "warning",
  pending: "default",
};

const STATUS_LABEL: Record<string, string> = {
  ready: "ready",
  failed: "failed",
  uploading: "uploading",
  pending: "pending",
};

type Props = {
  collectionId: number;
  reloadKey?: number;
};

export default function SourceLibrary({ collectionId, reloadKey = 0 }: Props) {
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
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
    setDocuments(data.documents);
  }, [collectionId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

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
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>{doc.filename}</TableCell>
                  <TableCell>
                    {formatDateTime(doc.created_at)}
                    <Typography variant="caption" color="text.secondary" component="div">
                      {formatRelative(doc.created_at, now)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Chip
                        size="small"
                        color={STATUS_COLOR[doc.status] ?? "default"}
                        label={STATUS_LABEL[doc.status] ?? doc.status}
                      />
                      {doc.status === "failed" && doc.error ? (
                        <Typography variant="caption" color="error">
                          {doc.error}
                        </Typography>
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => void handleRemove(doc.id)}
                      disabled={removing === doc.id}
                      aria-label={`Remove source ${doc.filename}`}
                    >
                      {removing === doc.id ? (
                        <CircularProgress size={16} />
                      ) : (
                        <DeleteIcon fontSize="small" />
                      )}
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </Stack>
  );
}
