export type RuntimeMode = "standalone" | "integrated";

export function runtimeMode(): RuntimeMode {
  const raw = (process.env.UNIVAI_MODE ?? "integrated").trim().toLowerCase();
  if (raw !== "standalone" && raw !== "integrated") {
    throw new Error("UNIVAI_MODE must be standalone or integrated");
  }
  if (raw === "standalone" && process.env.NODE_ENV === "production") {
    throw new Error("Standalone App adapters are disabled in production");
  }
  return raw;
}

export function isStandalone(): boolean {
  return runtimeMode() === "standalone";
}

export const STANDALONE_SID = "S-2026-000042";
export const STANDALONE_USER = {
  email: "learner@univai.local",
  password: "LearnLocal123!",
  name: "Standalone Learner",
  phone: "+201000000042",
};

export const SCENARIOS = [
  "happy",
  "empty",
  "generation",
  "generation-error",
  "upstream-error",
  "exam-pending",
  "exam-complete",
] as const;
export type StandaloneScenario = (typeof SCENARIOS)[number];

export function normalizeScenario(value: string | null | undefined): StandaloneScenario {
  return SCENARIOS.includes(value as StandaloneScenario)
    ? (value as StandaloneScenario)
    : "happy";
}
