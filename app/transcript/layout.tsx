import { requireVerifiedUser } from "@/lib/session";

export default async function TranscriptLayout({ children }: { children: React.ReactNode }) {
  await requireVerifiedUser("/transcript");
  return children;
}
