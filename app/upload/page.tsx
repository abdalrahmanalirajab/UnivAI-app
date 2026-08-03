"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { formatDateTime, formatRelative, useVirtualClock } from "@/lib/time";
import { useOnboarding } from "@/app/OnboardingProvider";

type Book = {
  id: number;
  filename: string;
  title: string | null;
  pages: number;
  status: string;
  error: string | null;
  progress: string | null;
  uploaded_at: string;
};

const STATUS_COLOR: Record<string, "success" | "error" | "warning" | "default"> = {
  ready: "success",
  failed: "error",
  ingesting: "warning",
  generating: "warning",
  pending: "default",
};

const STATUS_LABEL: Record<string, string> = {
  ready: "course ready",
  failed: "failed",
  ingesting: "indexing",
  generating: "generating course",
  pending: "pending",
};

export default function BooksPage() {
  const router = useRouter();
  const { refresh: refreshOnboarding } = useOnboarding();
  const [books, setBooks] = useState<Book[] | null>(null);
  const now = useVirtualClock();
  const [ragConfigured, setRagConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const completedRedirect = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/upload", { cache: "no-store" });
    const data = await res.json();
    setBooks(data.books ?? []);
    setRagConfigured(data.ragConfigured);
  }, []);

  const book = books?.[0] ?? null;
  const working = book?.status === "ingesting" || book?.status === "generating";

  useEffect(() => {
    load();
  }, [load]);

  // While the course is being generated, keep the progress line fresh.
  useEffect(() => {
    if (!working) return;
    const poll = setInterval(load, 3_000);
    return () => clearInterval(poll);
  }, [working, load]);

  useEffect(() => {
    if (book?.status !== "ready" || completedRedirect.current) return;
    completedRedirect.current = true;
    void refreshOnboarding().finally(() => {
      router.replace("/schedule");
      router.refresh();
    });
  }, [book?.status, refreshOnboarding, router]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not prepare this book.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (!books) return <CircularProgress />;

  const hasBook = books.length > 0;

  const chooseButton = (label: string, variant: "contained" | "outlined") => (
    <Button
      variant={variant}
      component="label"
      disabled={busy || working}
      color={variant === "outlined" ? "warning" : "primary"}
    >
      {label}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) upload(chosen);
        }}
      />
    </Button>
  );

  return (
    <Stack spacing={3}>
      <Typography variant="h4">{hasBook ? "Your book" : "Upload your book"}</Typography>

      {error ? (
        <Alert severity="error">
          <AlertTitle>Upload failed</AlertTitle>
          {error}
        </Alert>
      ) : null}

      {!ragConfigured ? (
        <Alert severity="info">
          Book preparation is not available right now.
        </Alert>
      ) : null}

      {hasBook ? (
        <Stack spacing={3}>
          <Card variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Book</TableCell>
                  <TableCell align="right">Pages</TableCell>
                  <TableCell>Uploaded</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {books.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.title ?? item.filename}</TableCell>
                    <TableCell align="right">{item.pages || "—"}</TableCell>
                    <TableCell>
                      {formatDateTime(item.uploaded_at)}
                      <Typography variant="caption" color="text.secondary" component="div">
                        {formatRelative(item.uploaded_at, now)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={STATUS_COLOR[item.status] ?? "default"}
                        label={STATUS_LABEL[item.status] ?? item.status}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {working ? (
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1}>
                  <Typography variant="subtitle1">Building your course</Typography>
                  <LinearProgress />
                  <Typography variant="body2" color="text.secondary">
                    {book?.progress ?? "Working…"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Each approved plan week gets its own slides, narration and quiz,
                    grounded in the selected sources. This takes a few minutes.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          {book?.status === "failed" ? (
            <Alert
              severity="error"
              action={chooseButton("Upload again", "outlined")}
            >
              <AlertTitle>Course generation failed</AlertTitle>
              {book.error ?? "Unknown error."}
            </Alert>
          ) : null}

          {book?.status === "ready" ? (
            <Alert
              severity="success"
              action={
                <Button component={Link} href="/schedule" size="small">
                  Go to schedule
                </Button>
              }
            >
              {book.progress ?? "Your semester is built from this book."}
            </Alert>
          ) : null}

          {!working ? (
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="subtitle1">Study a different book</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Replacing the book starts a new course and clears the current
                    schedule, progress, grades, and quizzes.
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    {chooseButton("Replace the book", "outlined")}
                    {busy ? <CircularProgress size={24} /> : null}
                  </Stack>
                  {busy ? (
                    <Stack spacing={1}>
                      <Typography variant="body2" color="text.secondary">
                        Preparing your new course…
                      </Typography>
                      <LinearProgress />
                    </Stack>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          ) : null}
        </Stack>
      ) : (
        <Stack spacing={3}>
          <Typography variant="body1" color="text.secondary">
            Choose one textbook to begin. We will prepare your course.
          </Typography>

          <Card variant="outlined">
            <CardContent>
              <Stack spacing={2}>
                {chooseButton("Choose PDF", "contained")}
                {busy ? (
                  <Stack spacing={1}>
                    <Typography variant="body2" color="text.secondary">
                      Preparing your book…
                    </Typography>
                    <LinearProgress />
                  </Stack>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      )}
    </Stack>
  );
}
