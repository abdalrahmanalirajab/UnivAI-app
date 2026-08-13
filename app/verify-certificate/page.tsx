"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";

export default function VerifyCertificatePage() {
  const router = useRouter();
  const [certificateId, setCertificateId] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = certificateId.trim();
    if (id) router.push(`/verify-certificate/${encodeURIComponent(id)}`);
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <WorkspacePremiumOutlined color="primary" fontSize="large" />
        <Typography variant="h4">Verify a certificate</Typography>
        <Typography color="text.secondary">
          Enter the certificate ID printed at the bottom of the UnivAI certificate.
        </Typography>
      </Stack>
      <Card variant="outlined">
        <CardContent>
          <Stack component="form" spacing={2} onSubmit={submit}>
            <TextField
              label="Certificate ID"
              value={certificateId}
              onChange={(event) => setCertificateId(event.target.value)}
              placeholder="cert_…"
              required
              slotProps={{
                htmlInput: { maxLength: 96, "data-no-ui-translate": "true", dir: "ltr" },
              }}
            />
            <Button type="submit" variant="contained">
              Verify certificate
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
