"use client";

import { useEffect, useState } from "react";
import { useSession } from "./auth-client";

/**
 * Better Auth may restore its cached session before React hydrates. Holding the
 * session until the first client effect keeps the server and first browser
 * render identical, then reveals the authenticated UI without a hydration error.
 */
export function useHydratedSession() {
  const session = useSession();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  return {
    data: hydrated ? session.data : null,
    isPending: !hydrated || session.isPending,
  };
}
