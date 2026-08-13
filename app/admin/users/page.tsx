"use client";

import { useState, useEffect } from "react";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import CircularProgress from "@mui/material/CircularProgress";
import TableContainer from "@mui/material/TableContainer";
import TablePagination from "@mui/material/TablePagination";
import Typography from "@mui/material/Typography";
import { authClient } from "@/lib/auth-client";
import { copyFor } from "@/lib/errorMap";

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<"email" | "name">("email");
  const [users, setUsers] = useState<unknown[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [banTarget, setBanTarget] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");

  useEffect(() => {
    setActionError(null);
    const id = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await authClient.admin.listUsers({
        query: {
          limit: pageSize,
          offset: page * pageSize,
          searchValue: search || undefined,
          searchField,
        },
      });
      if (error) {
        setLoadError(copyFor(error).message);
        setUsers([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      setUsers(data?.users ?? []);
      setTotal(data?.total ?? 0);
      setLoadError(null);
      setLoading(false);
    }, 400);
    return () => clearTimeout(id);
  }, [search, searchField, page, pageSize]);

  useEffect(() => {
    setPage(0);
  }, [search, searchField]);

  const handleBan = async () => {
    if (banTarget === null) return;
    const targetIndex = users.findIndex(
      (candidate) => (candidate as Record<string, unknown>).id === banTarget,
    );
    if (targetIndex < 0) {
      setBanDialogOpen(false);
      setActionError("That user is no longer on this page. Search for them and try again.");
      return;
    }
    const newUsers = [...users];
    const target = newUsers[targetIndex] as Record<string, unknown>;
    target.banned = true;
    setUsers(newUsers);
    setBanDialogOpen(false);
    setActionError(null);
    const { error } = await authClient.admin.banUser({
      userId: banTarget,
      banReason: banReason || undefined,
    });
    if (error) {
      target.banned = false;
      setUsers([...newUsers]);
      setActionError(copyFor(error).message);
    }
  };

  const handleUnban = async (i: number) => {
    const newUsers = [...users];
    const target = newUsers[i] as Record<string, unknown>;
    target.banned = false;
    setUsers(newUsers);
    setActionError(null);
    const { error } = await authClient.admin.unbanUser({
      userId: (users[i] as Record<string, unknown>).id as string,
    });
    if (error) {
      target.banned = true;
      setUsers([...newUsers]);
      setActionError(copyFor(error).message);
    }
  };

  return (
    <>
      <TextField
        label="Search"
        name="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Select
        value={searchField}
        onChange={(e) => setSearchField(e.target.value as "email" | "name")}
      >
        <MenuItem value="email">email</MenuItem>
        <MenuItem value="name">name</MenuItem>
      </Select>
      {actionError && <Alert severity="error">{actionError}</Alert>}
      {loadError && <Alert severity="error">{loadError}</Alert>}
      <Typography variant="body2" color="text.secondary" aria-live="polite">
        {loading
          ? "Loading users…"
          : total === 0
            ? "No users found."
            : `Showing ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} of ${total} users`}
      </Typography>
      <TableContainer>
      <Table aria-label="User administration">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Created At</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={6} align="center">
                <CircularProgress size={28} aria-label="Loading users" />
              </TableCell>
            </TableRow>
          ) : null}
          {users.map((u, i) => {
            const user = u as {
              id?: string;
              name?: string;
              email?: string;
              role?: string;
              banned?: boolean;
              createdAt?: string | Date;
            };
            return (
              <TableRow key={user.id ?? i}>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>
                  <Chip
                    label={user.banned ? "Banned" : "Active"}
                    color={user.banned ? "error" : "success"}
                  />
                </TableCell>
                <TableCell>
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={2}>
                  {user.role === "super_admin" ? (
                    "super_admin"
                  ) : (
                  <Select
                    value={user.role ?? "student"}
                    onChange={async (e) => {
                      const newRole = e.target.value as "student" | "admin";
                      const prevRole = user.role;
                      const newUsers = [...users];
                      (newUsers[i] as Record<string, unknown>).role = newRole;
                      setUsers(newUsers);
                      setActionError(null);
                      const { error } = await authClient.admin.setRole({
                        userId: user.id ?? "",
                        role: newRole,
                      });
                      if (error) {
                        (newUsers[i] as Record<string, unknown>).role = prevRole;
                        setUsers([...newUsers]);
                        setActionError(copyFor(error).message);
                      }
                    }}
                  >
                    <MenuItem value="student">student</MenuItem>
                    <MenuItem value="admin">admin</MenuItem>
                  </Select>
                  )}
                  {user.role === "super_admin" || <Button
                    variant="outlined"
                    size="small"
                    color={user.banned ? "success" : "error"}
                    onClick={() => {
                      if (user.banned) {
                        handleUnban(i);
                      } else {
                        setBanTarget(user.id ?? null);
                        setBanReason("");
                        setBanDialogOpen(true);
                      }
                    }}
                  >
                    {user.banned ? "Unban" : "Ban"}
                  </Button>}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_event, nextPage) => setPage(nextPage)}
        rowsPerPage={pageSize}
        onRowsPerPageChange={(event) => {
          setPageSize(Number(event.target.value));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 20, 50, 100]}
        labelRowsPerPage="Users per page"
        showFirstButton
        showLastButton
      />
      <Dialog open={banDialogOpen} onClose={() => setBanDialogOpen(false)}>
        <DialogTitle>Ban user</DialogTitle>
        <DialogContent>
          <TextField
            label="Ban reason"
            name="banReason"
            fullWidth
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBanDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleBan}>Confirm</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
