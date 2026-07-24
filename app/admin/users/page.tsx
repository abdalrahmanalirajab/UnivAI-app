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
import { authClient } from "@/lib/auth-client";

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<"email" | "name">("email");
  const [users, setUsers] = useState<unknown[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
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
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Created At</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((u, i) => {
            const user = u as {
              name?: string;
              email?: string;
              role?: string;
              banned?: boolean;
              createdAt?: string;
            };
            return (
              <TableRow key={i}>
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
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}