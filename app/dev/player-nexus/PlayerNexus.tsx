"use client";

import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import BadgeRounded from "@mui/icons-material/BadgeRounded";
import BoltRounded from "@mui/icons-material/BoltRounded";
import KeyRounded from "@mui/icons-material/KeyRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import SecurityRounded from "@mui/icons-material/SecurityRounded";
import StorageRounded from "@mui/icons-material/StorageRounded";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type SearchUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  banned: boolean | null;
  registrationNumber: string | null;
  createdAt: string;
  creditBalance: number | null;
};

type Snapshot = {
  user: SearchUser & {
    image: string | null;
    updatedAt: string;
    banReason: string | null;
    banExpires: string | null;
    phone: string | null;
    uiLocale: "en" | "ar";
    eulaAccepted: boolean;
    eulaVersion: string | null;
    eulaAcceptedAt: string | null;
    privacyNoticeAcknowledged: boolean;
    privacyNoticeVersion: string | null;
    privacyNoticeAcknowledgedAt: string | null;
  };
  accounts: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  wallet: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
  recentTransactions: Array<Record<string, unknown>>;
  recentReservations: Array<Record<string, unknown>>;
  recentAudit: Array<Record<string, unknown>>;
  footprint: Array<{ table: string; rows: number }>;
};

type TableRecords = {
  table: string;
  primaryKey: string[];
  editableColumns: string[];
  rows: Array<{ key: Record<string, unknown>; values: Record<string, unknown> }>;
  truncated: boolean;
};

type IdentityForm = {
  name: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  role: "student" | "admin" | "super_admin";
  banned: boolean;
  banReason: string;
  uiLocale: "en" | "ar";
};

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function dateTimeInput(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.valueOf())) return "";
  const local = new Date(date.valueOf() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initialIdentity(snapshot: Snapshot): IdentityForm {
  return {
    name: snapshot.user.name,
    email: snapshot.user.email,
    phone: snapshot.user.phone ?? "",
    emailVerified: snapshot.user.emailVerified,
    role: (snapshot.user.role ?? "student") as IdentityForm["role"],
    banned: Boolean(snapshot.user.banned),
    banReason: snapshot.user.banReason ?? "",
    uiLocale: snapshot.user.uiLocale,
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Developer request failed.");
  return body;
}

export default function PlayerNexus({ developerId }: { developerId: string }) {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [identity, setIdentity] = useState<IdentityForm | null>(null);
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [password, setPassword] = useState("");
  const [passwordHash, setPasswordHash] = useState("");
  const [hashConfirmation, setHashConfirmation] = useState("");
  const [balance, setBalance] = useState("0");
  const [weeklyGrantAmount, setWeeklyGrantAmount] = useState("100");
  const [nextGrantAt, setNextGrantAt] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [tableRecords, setTableRecords] = useState<TableRecords | null>(null);
  const [loadingTable, setLoadingTable] = useState(false);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(0);
  const [recordDraft, setRecordDraft] = useState("");
  const [recordConfirmation, setRecordConfirmation] = useState("");

  const loadSnapshot = useCallback(async (userId: string, reveal = false) => {
    setLoadingUser(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/dev/users/${encodeURIComponent(userId)}${reveal ? "?revealPasswordHash=1" : ""}`,
        {
          cache: "no-store",
          headers: reveal ? { "X-Dev-Confirm": "REVEAL PASSWORD HASH" } : undefined,
        }
      );
      const next = await readJson<Snapshot>(response);
      setSnapshot(next);
      setTableRecords(null);
      setIdentity(initialIdentity(next));
      setRegistrationNumber(next.user.registrationNumber ?? "");
      setBalance(String(next.wallet?.balance ?? 0));
      setWeeklyGrantAmount(String(next.wallet?.weekly_grant_amount ?? 100));
      setNextGrantAt(dateTimeInput(next.wallet?.next_grant_at));
      const credential = next.accounts.find((account) => account.providerId === "credential");
      setPasswordHash(typeof credential?.passwordHash === "string" ? credential.passwordHash : "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load user.");
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const response = await fetch(`/api/dev/users?search=${encodeURIComponent(search)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await readJson<{ users: SearchUser[] }>(response);
        setUsers(result.users);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "Could not search users.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  async function mutate(payload: Record<string, unknown>, message: string) {
    if (!snapshot) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/dev/users/${encodeURIComponent(snapshot.user.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const next = await readJson<Snapshot>(response);
      setSnapshot(next);
      setTableRecords(null);
      setIdentity(initialIdentity(next));
      setRegistrationNumber(next.user.registrationNumber ?? "");
      setBalance(String(next.wallet?.balance ?? 0));
      setWeeklyGrantAmount(String(next.wallet?.weekly_grant_amount ?? 100));
      setNextGrantAt(dateTimeInput(next.wallet?.next_grant_at));
      setPassword("");
      setPasswordHash("");
      setHashConfirmation("");
      setSuccess(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Developer operation failed.");
    } finally {
      setSaving(false);
    }
  }

  async function loadTable(table: string) {
    if (!snapshot) return;
    setLoadingTable(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/dev/users/${encodeURIComponent(snapshot.user.id)}/records?table=${encodeURIComponent(table)}`,
        { cache: "no-store" }
      );
      const result = await readJson<TableRecords>(response);
      setTableRecords(result);
      setSelectedRecordIndex(0);
      setRecordDraft(result.rows[0] ? json(result.rows[0].values) : "");
      setRecordConfirmation("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not inspect table.");
    } finally {
      setLoadingTable(false);
    }
  }

  function chooseRecord(index: number) {
    if (!tableRecords?.rows[index]) return;
    setSelectedRecordIndex(index);
    setRecordDraft(json(tableRecords.rows[index].values));
    setRecordConfirmation("");
  }

  async function saveRawRecord() {
    if (!snapshot || !tableRecords?.rows[selectedRecordIndex]) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const parsed = JSON.parse(recordDraft) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The record must be a JSON object.");
      const changes = Object.fromEntries(
        tableRecords.editableColumns
          .filter((column) => Object.prototype.hasOwnProperty.call(parsed, column))
          .map((column) => [column, parsed[column]])
      );
      const response = await fetch(`/api/dev/users/${encodeURIComponent(snapshot.user.id)}/records`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: tableRecords.table,
          key: tableRecords.rows[selectedRecordIndex].key,
          changes,
          confirmation: recordConfirmation,
        }),
      });
      const result = await readJson<TableRecords>(response);
      const nextIndex = Math.min(selectedRecordIndex, Math.max(0, result.rows.length - 1));
      setTableRecords(result);
      setSelectedRecordIndex(nextIndex);
      setRecordDraft(result.rows[nextIndex] ? json(result.rows[nextIndex].values) : "");
      setRecordConfirmation("");
      setSuccess(`${result.table} record saved directly and audited.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save raw record.");
    } finally {
      setSaving(false);
    }
  }

  if (!snapshot) {
    return (
      <Container maxWidth="md">
        <Stack spacing={3}>
          <Stack direction="row" spacing={1}>
            <Button component={Link} href="/dev" startIcon={<ArrowBackRounded />}>Command deck</Button>
            <Chip icon={<StorageRounded />} label="PLAYER NEXUS" color="secondary" variant="outlined" />
          </Stack>
          <Stack spacing={1}>
            <Typography component="h1" variant="h3">Choose a player</Typography>
            <Typography color="text.secondary">Search by name, email, or registration number. The latest accounts appear by default.</Typography>
          </Stack>
          <TextField
            fullWidth
            label="Find user"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            slotProps={{ input: { startAdornment: <SearchRounded color="action" /> } }}
          />
          {error ? <Alert severity="error">{error}</Alert> : null}
          {searching ? <CircularProgress aria-label="Searching users" /> : null}
          {!searching && users.length === 0 ? <Alert severity="info">No users found.</Alert> : null}
          <Stack spacing={1.5}>
            {users.map((user) => (
              <Card key={user.id} variant="outlined">
                <CardActionArea onClick={() => void loadSnapshot(user.id)}>
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Typography component="h2" variant="h6">{user.name}</Typography>
                        <Stack direction="row" spacing={1} useFlexGap>
                          <Chip size="small" label={user.role ?? "student"} color={user.role === "super_admin" ? "secondary" : "default"} />
                          <Chip size="small" label={user.banned ? "BANNED" : "ACTIVE"} color={user.banned ? "error" : "success"} />
                        </Stack>
                      </Stack>
                      <Typography variant="body2">{user.email}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {user.registrationNumber ?? "No registration number"} · {user.creditBalance ?? 0} credits
                      </Typography>
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
        </Stack>
      </Container>
    );
  }

  const credential = snapshot.accounts.find((account) => account.providerId === "credential");

  return (
    <Container maxWidth="lg">
      <Stack spacing={2.5}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button onClick={() => { setSnapshot(null); setTableRecords(null); setError(null); setSuccess(null); }} startIcon={<ArrowBackRounded />}>All players</Button>
          <Button disabled={loadingUser || saving} onClick={() => void loadSnapshot(snapshot.user.id)} startIcon={<RefreshRounded />}>Refresh database</Button>
        </Stack>

        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Typography component="h1" variant="h4">{snapshot.user.name}</Typography>
                <Stack direction="row" spacing={1} useFlexGap>
                  {snapshot.user.id === developerId ? <Chip label="YOU" color="secondary" /> : null}
                  <Chip label={snapshot.user.role ?? "student"} />
                  <Chip label={snapshot.user.banned ? "BANNED" : "ACTIVE"} color={snapshot.user.banned ? "error" : "success"} />
                </Stack>
              </Stack>
              <Typography>{snapshot.user.email}</Typography>
              <Typography color="text.secondary">{snapshot.user.registrationNumber ?? "No registration number"}</Typography>
              <Typography variant="caption" color="text.secondary">Database UUID: {snapshot.user.id}</Typography>
            </Stack>
          </CardContent>
        </Card>

        {loadingUser || saving ? <Alert icon={<CircularProgress size={20} />} severity="info">Applying database operation…</Alert> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        {success ? <Alert severity="success">{success}</Alert> : null}

        <Accordion defaultExpanded>
          <AccordionSummary><Stack direction="row" spacing={1}><BadgeRounded color="primary" /><Typography variant="h6">Identity Core</Typography></Stack></AccordionSummary>
          <AccordionDetails>
            {identity ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Name" value={identity.name} onChange={(event) => setIdentity({ ...identity, name: event.target.value })} /></Grid>
                <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Email" type="email" value={identity.email} onChange={(event) => setIdentity({ ...identity, email: event.target.value })} /></Grid>
                <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Phone" value={identity.phone} onChange={(event) => setIdentity({ ...identity, phone: event.target.value })} helperText="Optional E.164 format" /></Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <FormControl fullWidth><InputLabel>Role</InputLabel><Select label="Role" value={identity.role} onChange={(event) => setIdentity({ ...identity, role: event.target.value as IdentityForm["role"] })}><MenuItem value="student">student</MenuItem><MenuItem value="admin">admin</MenuItem><MenuItem value="super_admin">super_admin</MenuItem></Select></FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <FormControl fullWidth><InputLabel>UI locale</InputLabel><Select label="UI locale" value={identity.uiLocale} onChange={(event) => setIdentity({ ...identity, uiLocale: event.target.value as "en" | "ar" })}><MenuItem value="en">English</MenuItem><MenuItem value="ar">Arabic</MenuItem></Select></FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}><FormControlLabel control={<Checkbox checked={identity.emailVerified} onChange={(event) => setIdentity({ ...identity, emailVerified: event.target.checked })} />} label="Email verified" /></Grid>
                <Grid size={{ xs: 12, sm: 6 }}><FormControlLabel control={<Checkbox checked={identity.banned} onChange={(event) => setIdentity({ ...identity, banned: event.target.checked })} />} label="Account banned" /></Grid>
                {identity.banned ? <Grid size={{ xs: 12 }}><TextField fullWidth label="Ban reason" value={identity.banReason} onChange={(event) => setIdentity({ ...identity, banReason: event.target.value })} /></Grid> : null}
                <Grid size={{ xs: 12 }}><Button disabled={saving} variant="contained" onClick={() => void mutate({ action: "update_identity", ...identity }, "Identity saved and audited.")}>Save identity</Button></Grid>
                <Grid size={{ xs: 12 }}><Divider /></Grid>
                <Grid size={{ xs: 12, sm: 8 }}><TextField fullWidth label="Registration number" value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} helperText="Changing this migrates matching learner-owned rows across the database." /></Grid>
                <Grid size={{ xs: 12, sm: 4 }}><Button fullWidth disabled={saving || registrationNumber === snapshot.user.registrationNumber} color="warning" variant="outlined" onClick={() => void mutate({ action: "change_registration", registrationNumber }, "Registration number and linked records migrated.")}>Migrate registration</Button></Grid>
              </Grid>
            ) : null}
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary><Stack direction="row" spacing={1}><KeyRounded color="warning" /><Typography variant="h6">Credential Forge</Typography></Stack></AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <Alert severity="warning">Password changes revoke every session for this user. OAuth tokens are never displayed.</Alert>
              <Typography variant="body2">Credential account: {credential ? "present" : "not created"}</Typography>
              <Typography variant="body2" color="text.secondary">Hash fingerprint: {String(credential?.passwordHashFingerprint ?? "none")}</Typography>
              <TextField fullWidth type="password" label="Set a new password (recommended)" value={password} onChange={(event) => setPassword(event.target.value)} helperText="The server creates a Better Auth-compatible hash." />
              <Button disabled={saving || password.length < 8} variant="contained" color="warning" onClick={() => void mutate({ action: "set_password", password }, "Password securely replaced; sessions revoked.")}>Set password</Button>
              <Divider />
              <Button disabled={loadingUser} variant="outlined" onClick={() => void loadSnapshot(snapshot.user.id, true)}>Reveal stored password hash</Button>
              <TextField fullWidth multiline minRows={3} label="Raw password hash" value={passwordHash} onChange={(event) => setPasswordHash(event.target.value)} helperText="Advanced recovery only. An invalid hash can make password sign-in impossible." />
              <TextField fullWidth label={'Type "REPLACE HASH"'} value={hashConfirmation} onChange={(event) => setHashConfirmation(event.target.value)} />
              <Button disabled={saving || !passwordHash || hashConfirmation !== "REPLACE HASH"} variant="outlined" color="error" onClick={() => void mutate({ action: "replace_password_hash", passwordHash, confirmation: hashConfirmation }, "Raw hash replaced and sessions revoked.")}>Replace raw hash</Button>
            </Stack>
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary><Stack direction="row" spacing={1}><BoltRounded color="secondary" /><Typography variant="h6">Credit Loadout</Typography></Stack></AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth type="number" label="Balance" value={balance} onChange={(event) => setBalance(event.target.value)} /></Grid>
              <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth type="number" label="Weekly grant" value={weeklyGrantAmount} onChange={(event) => setWeeklyGrantAmount(event.target.value)} /></Grid>
              <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth type="datetime-local" label="Next grant" value={nextGrantAt} onChange={(event) => setNextGrantAt(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
              <Grid size={{ xs: 12 }}><TextField fullWidth label="Adjustment note" value={creditNote} onChange={(event) => setCreditNote(event.target.value)} /></Grid>
              <Grid size={{ xs: 12 }}><Typography variant="body2" color="text.secondary">Reserved balance: {String(snapshot.wallet?.reserved_balance ?? 0)}</Typography></Grid>
              <Grid size={{ xs: 12 }}><Button disabled={saving || !nextGrantAt} variant="contained" color="secondary" onClick={() => void mutate({ action: "set_credits", balance: Number(balance), weeklyGrantAmount: Number(weeklyGrantAmount), nextGrantAt, note: creditNote }, "Credit wallet updated with a ledger entry.")}>Save loadout</Button></Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary><Stack direction="row" spacing={1}><SecurityRounded color="error" /><Typography variant="h6">Sessions & Access</Typography></Stack></AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <Typography>{snapshot.sessions.length} recent active session{snapshot.sessions.length === 1 ? "" : "s"}</Typography>
              <TextField fullWidth multiline minRows={4} label="Session records (tokens redacted)" value={json(snapshot.sessions)} slotProps={{ input: { readOnly: true } }} />
              <Button disabled={saving || snapshot.sessions.length === 0} color="error" variant="outlined" onClick={() => void mutate({ action: "revoke_sessions" }, "All sessions revoked.")}>Revoke all sessions</Button>
            </Stack>
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary><Stack direction="row" spacing={1}><StorageRounded color="action" /><Typography variant="h6">Database Vision</Typography></Stack></AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <Typography color="text.secondary">Every table below contains rows linked to this user UUID or registration number. Tap one to view its direct values.</Typography>
              <Grid container spacing={1}>
                {snapshot.footprint.map((entry) => (
                  <Grid key={entry.table} size={{ xs: 12, sm: "auto" }}>
                    <Chip
                      clickable
                      color={tableRecords?.table === entry.table ? "secondary" : "default"}
                      label={`${entry.table}: ${entry.rows}`}
                      onClick={() => void loadTable(entry.table)}
                      variant="outlined"
                    />
                  </Grid>
                ))}
              </Grid>
              {loadingTable ? <CircularProgress size={24} aria-label="Loading table records" /> : null}
              {tableRecords ? (
                <>
                  {tableRecords.truncated ? <Alert severity="info">Showing the first 50 matching rows.</Alert> : null}
                  {tableRecords.rows.length > 0 ? (
                    <FormControl fullWidth>
                      <InputLabel>Record</InputLabel>
                      <Select label="Record" value={selectedRecordIndex} onChange={(event) => chooseRecord(Number(event.target.value))}>
                        {tableRecords.rows.map((row, index) => (
                          <MenuItem key={json(row.key)} value={index}>{index + 1}: {json(row.key)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : <Alert severity="info">No matching rows.</Alert>}
                  {tableRecords.rows.length > 0 ? (
                    <TextField
                      fullWidth
                      multiline
                      minRows={12}
                      label={`Direct record: ${tableRecords.table}`}
                      value={recordDraft}
                      onChange={(event) => setRecordDraft(event.target.value)}
                      helperText={tableRecords.primaryKey.length === 0
                        ? "Read-only: this table has no stable primary key."
                        : `Editable columns: ${tableRecords.editableColumns.join(", ") || "none"}`}
                      slotProps={{ input: { readOnly: tableRecords.primaryKey.length === 0 } }}
                    />
                  ) : null}
                  {tableRecords.primaryKey.length > 0 && tableRecords.editableColumns.length > 0 ? (
                    <>
                      <Alert severity="warning">Raw edits are written directly to PostgreSQL. Ownership keys, primary keys, generated values, binary data, passwords, and tokens are protected here.</Alert>
                      <TextField fullWidth label={'Type "SAVE RECORD"'} value={recordConfirmation} onChange={(event) => setRecordConfirmation(event.target.value)} />
                      <Button disabled={saving || recordConfirmation !== "SAVE RECORD"} color="error" variant="outlined" onClick={() => void saveRawRecord()}>Save raw database record</Button>
                    </>
                  ) : null}
                </>
              ) : null}
              <TextField fullWidth multiline minRows={14} label="Human-readable database snapshot" value={json({ user: snapshot.user, accounts: snapshot.accounts, wallet: snapshot.wallet, subscription: snapshot.subscription, recentTransactions: snapshot.recentTransactions, recentReservations: snapshot.recentReservations, recentAudit: snapshot.recentAudit })} slotProps={{ input: { readOnly: true } }} />
            </Stack>
          </AccordionDetails>
        </Accordion>
      </Stack>
    </Container>
  );
}
