import Link from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { UiLocale } from "@/lib/legal-documents";

type Section = Readonly<{ title: string; body: string }>;

export default function LegalDocument({
  locale,
  eyebrow,
  title,
  summary,
  version,
  sections,
  notice,
}: {
  locale: UiLocale;
  eyebrow: string;
  title: string;
  summary: string;
  version: string;
  sections: readonly Section[];
  notice: string;
}) {
  return (
    <Stack spacing={3} lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <Stack spacing={1} component="header">
        <Typography variant="overline" color="primary">
          {eyebrow}
        </Typography>
        <Typography variant="h2" component="h1">
          {title}
        </Typography>
        <Typography color="text.secondary">{summary}</Typography>
        <Typography variant="body2" color="text.secondary">
          {locale === "ar" ? `الإصدار: ${version}` : `Version: ${version}`}
        </Typography>
      </Stack>

      <Alert severity="info">{notice}</Alert>

      {sections.map((section) => (
        <Paper
          component="section"
          variant="outlined"
          key={section.title}
          className="legal-document-section"
        >
          <Typography variant="h5" component="h2" gutterBottom>
            {section.title}
          </Typography>
          <Typography>{section.body}</Typography>
        </Paper>
      ))}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button component={Link} href="/legal" variant="outlined">
          {locale === "ar" ? "مركز الخصوصية والشؤون القانونية" : "Privacy and Legal center"}
        </Button>
        <Button component={Link} href="/profile" variant="contained">
          {locale === "ar" ? "إعدادات الحساب" : "Account settings"}
        </Button>
      </Stack>
    </Stack>
  );
}
