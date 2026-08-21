import { config } from "dotenv";
import path from "path";

/**
 * The single .env lives at the UnivAI campus root, one level above this repo.
 *
 * Do NOT read `process.env.FOO` directly for these: the bundler inlines that
 * expression at build time, when the root .env has not been loaded yet, so it
 * compiles down to `undefined`. Read the parsed values from here instead —
 * they are resolved at runtime.
 */
const mode = (process.env.UNIVAI_MODE ?? "integrated").trim().toLowerCase();
if (mode === "standalone" && process.env.NODE_ENV === "production") {
  throw new Error(
    "UNIVAI_MODE=standalone is development-only and cannot run with NODE_ENV=production."
  );
}
const envPath =
  mode === "standalone"
    ? path.resolve(process.cwd(), ".env.local")
    : process.env.UNIVAI_INTEGRATION_ROOT
      ? path.resolve(process.env.UNIVAI_INTEGRATION_ROOT, ".env")
      : path.resolve(process.cwd(), "..", ".env");
const integrationRoot =
  mode === "standalone"
    ? process.cwd()
    : process.env.UNIVAI_INTEGRATION_ROOT
      ? path.resolve(process.env.UNIVAI_INTEGRATION_ROOT)
      : path.resolve(process.cwd(), "..");
// processEnv: {} keeps the file out of process.env — we only ever read `parsed`.
// Loading it the default way copies every value into this long-lived server's
// environment, and lib/python spawns the Python side with that environment
// inherited. python-dotenv does not override a variable that is already set, so
// the values this process read at boot outlive any edit to .env: changing
// LLM_PRIMARY did nothing until the server was restarted, and course generation
// kept failing on the model named in the file hours earlier. Real environment
// variables still work — read() falls back to them.
const parsed = config({ path: envPath, quiet: true, processEnv: {} }).parsed ?? {};

function read(name: string, fallback = ""): string {
  return parsed[name] ?? process.env[name] ?? fallback;
}

const liveSessionTransport = (
  process.env.LIVE_SESSION_TRANSPORT ?? read("LIVE_SESSION_TRANSPORT", "livekit")
).trim().toLowerCase();
const configuredDemoMediaRoot = read("DEMO_MEDIA_ROOT", "demo-media");

export const env = {
  UNIVAI_MODE: read("UNIVAI_MODE", "integrated"),
  DATA_ROOT: read("UNIVAI_DATA_ROOT"),
  INTEGRATION_ROOT: read("UNIVAI_INTEGRATION_ROOT"),
  DATABASE_URL: read(
    "DATABASE_URL",
    mode === "standalone"
      ? "postgresql://univai:univai@127.0.0.1:5434/univai_app_standalone"
      : "postgresql://univai:univai@localhost:5433/univai"
  ),

  // The team's RAG service (UnivAI-Agent). This app only consumes it.
  RAG_MCP_URL: read("RAG_MCP_URL"),

  // The team's exam system (UnivAI-exam_system, port 3200) and its MongoDB.
  MONGODB_URI: read("MONGODB_URI", "mongodb://localhost:27018/univai_exams"),
  EXAM_SYSTEM_URL: read("EXAM_SYSTEM_URL", "http://localhost:3200"),
  // Shared secret the exam system uses to sign result callbacks (HMAC-SHA256
  // over the raw body, X-Exam-Signature header). Fail-closed: callbacks are
  // rejected while this is unset.
  EXAM_CALLBACK_SECRET: read("EXAM_CALLBACK_SECRET"),
  UNIVAI_AGENT_SECRET: read("UNIVAI_AGENT_SECRET"),
  STUDENT_NAME: read("STUDENT_NAME", "Student"),

  // Demo transport makes these empty even when the normal .env still contains
  // rollback credentials. No demo route can accidentally use them.
  LIVEKIT_URL: liveSessionTransport === "demo_media" ? "" : read("LIVEKIT_URL") || read("NEXT_PUBLIC_LIVEKIT_URL"),
  LIVEKIT_API_KEY: liveSessionTransport === "demo_media" ? "" : read("LIVEKIT_API_KEY"),
  LIVEKIT_API_SECRET: liveSessionTransport === "demo_media" ? "" : read("LIVEKIT_API_SECRET"),
  LIVE_SESSION_TRANSPORT: liveSessionTransport,
  DEMO_MEDIA_ROOT: path.resolve(integrationRoot, configuredDemoMediaRoot),
  LECTURES_ROOT: path.resolve(integrationRoot, "lectures"),

  // Auth (Better Auth). See docs/auth-plan.md + docs/auth-contract.md.
  BETTER_AUTH_SECRET: read("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: read("BETTER_AUTH_URL", "http://localhost:3100"),
  // The single account auto-promoted to super_admin on signup.
  SUPER_ADMIN_EMAIL: read("SUPER_ADMIN_EMAIL").trim().toLowerCase(),
  // Server-only allowlist for the final-demo developer command deck.
  DEVELOPER_EMAILS: read("DEVELOPER_EMAILS"),
  // Google sign-in. Both empty => the provider is not registered at all and the
  // UI hides the button, so the app runs unchanged without Google credentials.
  GOOGLE_CLIENT_ID: read("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: read("GOOGLE_CLIENT_SECRET"),
  // Empty RESEND_API_KEY => reset/verify links are logged to the console instead
  // of emailed (dev fallback); see lib/email.ts.
  RESEND_API_KEY: read("RESEND_API_KEY"),
  RESEND_WEBHOOK_SECRET: read("RESEND_WEBHOOK_SECRET"),
  EMAIL_FROM: read("EMAIL_FROM", "UnivAI <onboarding@resend.dev>"),
  NOTIFICATION_DISPATCH_SECRET: read("NOTIFICATION_DISPATCH_SECRET"),

  // PayPal Subscriptions. Sandbox is the safe default. Product/plan IDs are
  // created once with scripts/setup-paypal-plans.ts and are not secrets.
  PAYPAL_CLIENT_ID: read("PAYPAL_CLIENT_ID"),
  PAYPAL_CLIENT_SECRET: read("PAYPAL_CLIENT_SECRET") || read("PAYPAL_SECRET"),
  PAYPAL_API_BASE: read("PAYPAL_API_BASE", "https://api-m.sandbox.paypal.com"),
  PAYPAL_WEBHOOK_ID: read("PAYPAL_WEBHOOK_ID"),
  PAYPAL_WEBHOOK_URL: read("PAYPAL_WEBHOOK_URL"),
  PAYPAL_PRODUCT_ID: read("PAYPAL_PRODUCT_ID"),
  PAYPAL_SUPPORTER_PLAN_ID: read("PAYPAL_SUPPORTER_PLAN_ID"),
  PAYPAL_PATRON_PLAN_ID: read("PAYPAL_PATRON_PLAN_ID"),
  PAYPAL_FAKE_SUBSCRIPTION: read("PAYPAL_FAKE_SUBSCRIPTION"),
};
