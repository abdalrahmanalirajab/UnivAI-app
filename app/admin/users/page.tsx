"use client";

import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

// TEMP fake data, replaced in next step
const fakeUsers = [
  {
    name: "Alice Johnson",
    email: "alice@example.com",
    role: "student",
    banned: false,
    createdAt: "2025-01-15T10:30:00Z",
  },
  {
    name: "Bob Smith",
    email: "bob@example.com",
    role: "admin",
    banned: true,
    createdAt: "2024-11-20T08:00:00Z",
  },
];

export default function AdminUsersPage() {
  return (
    <>
      <TextField label="Search" name="search" />
      <Select value="email">
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
          {fakeUsers.map((user, i) => (
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
          ))}
        </TableBody>
      </Table>
    </>
  );
}