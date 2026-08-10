"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SpeedOutlined from "@mui/icons-material/SpeedOutlined";

type Policy = {
  scope: string;
  label: string;
  enabled: boolean;
  blocked: boolean;
  maxRequests: number;
  windowSeconds: number;
  requestCount: number;
  overridden: boolean;
};

export default function RateLimitManager({ registrationNumber }: { registrationNumber: string }) {
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(
      `/api/admin/rate-limits?sid=${encodeURIComponent(registrationNumber)}`,
      { cache: "no-store" },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? "Could not load rate limits.");
    setPolicies(body.policies ?? []);
  }, [registrationNumber]);

  useEffect(() => {
    setPolicies(null);
    setNotice(null);
    void load().catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Could not load rate limits.");
    });
  }, [load]);

  const change = (scope: string, update: Partial<Policy>) => {
    setPolicies((current) =>
      current?.map((policy) => policy.scope === scope ? { ...policy, ...update } : policy) ?? null,
    );
  };

  const save = async (policy: Policy) => {
    setBusy(policy.scope);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/rate-limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationNumber, ...policy }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not save the limit.");
      setPolicies(body?.policies ?? []);
      setNotice(`${policy.label} limit saved.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the limit.");
    } finally {
      setBusy(null);
    }
  };

  const reset = async (policy: Policy, restoreDefault: boolean) => {
    setBusy(policy.scope);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/rate-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationNumber,
          scope: policy.scope,
          action: restoreDefault ? "restore-default" : "reset-usage",
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not reset the limit.");
      setPolicies(body?.policies ?? []);
      setNotice(restoreDefault ? `${policy.label} restored to default.` : `${policy.label} usage reset.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reset the limit.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} className="align-center">
            <SpeedOutlined color="primary" />
            <Stack>
              <Typography variant="h5">Learner rate limits</Typography>
              <Typography variant="body2" color="text.secondary">
                Control expensive actions per learner. Admin routes are never limited.
              </Typography>
            </Stack>
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {notice ? <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}
          {!policies ? (
            <CircularProgress size={28} aria-label="Loading learner rate limits" />
          ) : (
            <TableContainer className="admin-table-scroll">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Area</TableCell>
                    <TableCell>Usage</TableCell>
                    <TableCell>Requests</TableCell>
                    <TableCell>Window (seconds)</TableCell>
                    <TableCell>Control</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {policies.map((policy) => (
                    <TableRow key={policy.scope}>
                      <TableCell>
                        <Typography variant="body2">{policy.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {policy.overridden ? "Custom" : "Default"}
                        </Typography>
                      </TableCell>
                      <TableCell>{policy.requestCount} used</TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          type="number"
                          value={policy.maxRequests}
                          disabled={busy === policy.scope}
                          onChange={(event) => change(policy.scope, {
                            maxRequests: Math.max(1, Math.min(10000, Number(event.target.value) || 1)),
                          })}
                          slotProps={{ htmlInput: { min: 1, max: 10000, "aria-label": `${policy.label} requests` } }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          type="number"
                          value={policy.windowSeconds}
                          disabled={busy === policy.scope}
                          onChange={(event) => change(policy.scope, {
                            windowSeconds: Math.max(1, Math.min(86400, Number(event.target.value) || 1)),
                          })}
                          slotProps={{ htmlInput: { min: 1, max: 86400, "aria-label": `${policy.label} window seconds` } }}
                        />
                      </TableCell>
                      <TableCell>
                        <Stack>
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={policy.enabled}
                                disabled={busy === policy.scope}
                                onChange={(event) => change(policy.scope, { enabled: event.target.checked })}
                              />
                            }
                            label="Limited"
                          />
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                color="error"
                                checked={policy.blocked}
                                disabled={busy === policy.scope}
                                onChange={(event) => change(policy.scope, { blocked: event.target.checked })}
                              />
                            }
                            label="Blocked"
                          />
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} className="justify-end">
                          <Button size="small" disabled={busy === policy.scope} onClick={() => void save(policy)}>
                            Save
                          </Button>
                          <Button size="small" disabled={busy === policy.scope} onClick={() => void reset(policy, false)}>
                            Reset usage
                          </Button>
                          <Button size="small" disabled={busy === policy.scope || !policy.overridden} onClick={() => void reset(policy, true)}>
                            Default
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
