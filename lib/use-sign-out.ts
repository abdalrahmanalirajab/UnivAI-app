"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "./auth-client";

/**
 * The app's sign-in route — the destination after sign-out. The repo's auth
 * pages live at /login (see app/login, proxy.ts PUBLIC_PATHS); better-auth's
 * /api/auth/sign-in/email is the wire endpoint, not a page route.
 */
export const SIGN_IN_PATH = "/login";

/**
 * The single shared sign-out action. Pages wire their sign-out triggers to
 * this hook instead of calling better-auth's signOut() directly; it owns the
 * exact order: clear the session first (reusing the existing client signOut),
 * then immediately replace-navigate to the sign-in page so the protected page
 * is dropped from history and no back button can resurface it.
 *
 * Uses `router.replace` — the same history-replacing navigation already used
 * in this repo (app/verify-email/page.tsx), never `push`.
 */
export function useSignOut() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState(false);

  const performSignOut = useCallback(async () => {
    setSigningOut(true);
    setError(false);
    try {
      const result = await signOut();
      if (result.error) throw new Error("SIGN_OUT_FAILED");
      router.replace(SIGN_IN_PATH);
    } catch {
      setError(true);
    } finally {
      setSigningOut(false);
    }
  }, [router]);

  return { performSignOut, signingOut, error };
}
