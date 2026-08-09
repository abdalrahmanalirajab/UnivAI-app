"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { OnboardingState } from "@/lib/onboarding-flow";
import { useHydratedSession } from "@/lib/use-hydrated-session";

type OnboardingContextValue = {
  state: OnboardingState | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export default function OnboardingProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useHydratedSession();
  const userId = session?.user.id;
  const emailVerified = session?.user.emailVerified ?? false;
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setState(null);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/onboarding", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load onboarding state.");
      const data = (await response.json()) as OnboardingState;
      setState({
        emailVerified: data.emailVerified,
        hasPreparedSource: data.hasPreparedSource,
      });
    } catch {
      // A brief API outage must not throw an existing learner back into the
      // first-time upload flow. Keep the last confirmed journey state.
      setState((current) => current ?? { emailVerified, hasPreparedSource: false });
    } finally {
      setLoading(false);
    }
  }, [emailVerified, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ state, loading: isPending || loading, refresh }),
    [isPending, loading, refresh, state],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error("useOnboarding must be used inside OnboardingProvider.");
  return context;
}
