import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user) redirect("/start");
  return children;
}
