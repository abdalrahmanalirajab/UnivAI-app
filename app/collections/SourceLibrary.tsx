"use client";

import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import { formatDateTime, formatRelative } from "@/lib/time";

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
  documents: Document[];
  now: Date | null;
  onRemove: (documentId: number) => void;
};

export default function SourceLibrary({ documents, now, onRemove }: Props) {
  if (documents.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No sources yet. Upload PDFs below.
      </Typography>
    );
  }

  return (
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
                <Stack direction="row" spacing={1} alignItems="center">
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
                  onClick={() => onRemove(doc.id)}
                  aria-label="Remove source"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
