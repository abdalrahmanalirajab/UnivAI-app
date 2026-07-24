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
import { authClient } from "@/lib/auth-client";
import { copyFor } from "@/lib/errorMap";

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<"email" | "name">("email");
  const [users, setUsers] = useState<unknown[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setActionError(null);
    const id = setTimeout(async () => {
      setLoading(true);
      const { data } = await authClient.admin.listUsers({
        query: {
          limit: 20,
          offset: 0,
          searchValue: search || undefined,
          searchField,
        },
      });
      setUsers(data?.users ?? []);
      setTotal(data?.total ?? 0);
      setLoading(false);
    }, 400);
    return () => clearTimeout(id);
  }, [search, searchField]);

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
      <Table>
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
          {users.map((u, i) => {
            const user = u as {
              id?: string;
              name?: string;
              email?: string;
              role?: string;
              banned?: boolean;
              createdAt?: string;
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
                <TableCell>{user.createdAt}</TableCell>
                <TableCell>
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}