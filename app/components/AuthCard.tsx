"use client";

import Container from "@mui/material/Container";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

export default function AuthCard({
  title,
  children,
  maxWidth = "xs",
}: {
  title: string;
  children: React.ReactNode;
  maxWidth?: "xs" | "sm" | "md";
}) {
  return (
    <Container maxWidth={maxWidth}>
      <Card elevation={3}>
        <CardContent>
          <Typography variant="h5" component="h1" gutterBottom>
            {title}
          </Typography>
          {children}
        </CardContent>
      </Card>
    </Container>
  );
}
