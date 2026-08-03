"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import MultiBookUploader from "./MultiBookUploader";
import SourceLibrary from "./SourceLibrary";

type Collection = {
  id: number;
  name: string;
  created_at: string;
};

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const active = collections?.[0] ?? null;

  const loadCollections = useCallback(async () => {
    try {
      const res = await fetch("/api/collections", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load collections.");
      const data = await res.json();
      setCollections(data.collections);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load collections.");
    }
  }, []);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  async function createCollection() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create collection.");
      }
      setName("");
      await loadCollections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create collection.");
    } finally {
      setCreating(false);
    }
  }

  if (!collections) {
    return <CircularProgress />;
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Source Library</Typography>

      {error ? (
        <Alert severity="error">
          <AlertTitle>Error</AlertTitle>
          {error}
        </Alert>
      ) : null}

      {collections.length === 0 ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="subtitle1">Create your first collection</Typography>
              <Typography variant="body2" color="text.secondary">
                Keep related study materials together.
              </Typography>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Collection name"
                  size="small"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={creating}
                />
                <Button
                  variant="contained"
                  onClick={createCollection}
                  disabled={creating || !name.trim()}
                >
                  Create
                </Button>
                {creating ? <CircularProgress size={24} /> : null}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={3}>
          <Typography variant="subtitle1" color="text.secondary">
            Collection: {active?.name}
          </Typography>

          <Button variant="contained" component={Link} href={`/curriculum/${active!.id}`}>
            Build Curriculum
          </Button>

          <SourceLibrary
            key={active!.id}
            collectionId={active!.id}
            reloadKey={reloadKey}
          />

          <MultiBookUploader
            collectionId={active!.id}
            onDocumentsChange={() => setReloadKey((k) => k + 1)}
          />
        </Stack>
      )}
    </Stack>
  );
}
