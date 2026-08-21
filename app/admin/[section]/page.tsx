import { notFound } from "next/navigation";

import AdminPage from "../page";

const ADMIN_SECTIONS = new Set(["course", "records", "virtual-clock", "system"]);

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!ADMIN_SECTIONS.has(section)) notFound();
  return <AdminPage />;
}
