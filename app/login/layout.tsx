import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  // A cookie can remain after another device revokes its database session.
  // Only a verified server session may send someone away from the login page.
  const user = await getSessionUser();
  if (user) redirect("/start");
  return children;
}
