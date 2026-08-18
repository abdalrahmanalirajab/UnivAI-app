import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { pool } from "./db";
import { env } from "./env";
import { sendMonitoredEmail } from "./monitored-email";
import { ac, roles } from "./auth-ac";
import { recordAudit } from "./auth-audit";
import { sendBanNotification } from "./auth-notify";
import { queueAuthSecurityNotification } from "./auth-security-notifications";
import { guardHook, validatedUserName } from "./auth-guards";
import { normalizePhone } from "./validators";
import {
  CURRENT_EULA_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  normalizeUiLocale,
} from "./legal-documents";
import {
  recordLegalAcceptances,
  validSignupAttestation,
  verifyLegalSignupToken,
} from "./legal";

/**
 * Better Auth — the whole auth backend. See docs/auth-plan.md (Phase 1) and
 * docs/auth-contract.md for the shapes Dev B builds against.
 *
 * Reuses the app's existing pg Pool (lib/db.ts) — no second connection, no ORM.
 * `role` and `banned/banReason/banExpires` come from the admin plugin; `phone`
 * and `registrationNumber` are our additional fields. `registrationNumber` and the super_admin
 * bootstrap are assigned server-side in the create hook, never from the client.
 */
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: pool,
  // Keep abuse protection active in local demos as well as production.
  // Better Auth applies stricter built-in rules to sensitive sign-in paths;
  // authenticated product actions also use the admin-managed per-user limits.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
  },
  advanced: {
    database: {
      // Generate in the app so UUIDs work both before and after migration 014.
      generateId: () => randomUUID(),
    },
  },

  // Browsers send an Origin header and Better Auth rejects any origin it does
  // not trust (baseURL is trusted by default). Local dev may run on :3000 or
  // :3100, so trust both there; production trusts only BETTER_AUTH_URL.
  trustedOrigins:
    process.env.NODE_ENV === "production"
      ? [env.BETTER_AUTH_URL]
      : ["http://localhost:3000", "http://localhost:3100"],

  emailAndPassword: {
    enabled: true,
    // New students keep their session while onboarding. Sensitive learning
    // actions still require emailVerified through the application guards.
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      await sendMonitoredEmail({
        userId: user.id,
        category: "security",
        eventType: "auth.password_reset",
        to: user.email,
        subject: "Reset your UnivAI password",
        text: `Someone asked to reset the password for your UnivAI account.\n\nReset it here (link expires soon):\n${url}\n\nIf this wasn't you, you can safely ignore this email.`,
        terminalPreview: true,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMonitoredEmail({
        userId: user.id,
        category: "security",
        eventType: "auth.email_verification",
        to: user.email,
        subject: "Verify your UnivAI email",
        text: `Welcome to UnivAI.\n\nConfirm your email to activate your account:\n${url}\n\nIf you didn't create an account, you can ignore this email.`,
        terminalPreview: true,
      });
    },
  },

  // Google sign-in, registered only when credentials exist so the app still
  // boots (and the E2E stack still runs) without them.
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        socialProviders: {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        },
      }
    : {}),

  account: {
    accountLinking: {
      // A learner who registered with email and password and later presses
      // "Continue with Google" is the same person: Google asserts the address
      // and has verified it, so the provider is linked to the existing account
      // instead of failing on the duplicate email. Only providers listed here
      // are trusted to make that claim.
      enabled: true,
      trustedProviders: ["google"],
    },
  },

  user: {
    additionalFields: {
      // Collected at registration, shown/edited on the profile — NOT verified.
      //
      // Not `required` at the schema level: Google supplies no phone number, and
      // a required additional field makes social sign-up impossible. The email
      // sign-up path still demands it — the register form validates it and
      // guardHook rejects a /sign-up/email without one — while a Google sign-up
      // starts with an empty phone the learner fills in on /profile.
      phone: { type: "string", required: false, input: true },
      // The RAG / LiveKit namespace key. Server-generated; client can't set it.
      registrationNumber: { type: "string", required: false, input: false },
      // This preference localizes application chrome only. Generated learning
      // and assessment content stays in its authored language.
      uiLocale: { type: "string", required: false, input: true, defaultValue: "en" },
      // Signup assertions and current-version evidence. The create hook
      // overwrites versions/timestamps server-side and also writes immutable
      // events to legal_acceptances.
      eulaAccepted: { type: "boolean", required: false, input: true, returned: false },
      eulaVersion: { type: "string", required: false, input: true, returned: false },
      eulaAcceptedAt: { type: "date", required: false, input: false },
      privacyNoticeAcknowledged: {
        type: "boolean",
        required: false,
        input: true,
        returned: false,
      },
      privacyNoticeVersion: {
        type: "string",
        required: false,
        input: true,
        returned: false,
      },
      privacyNoticeAcknowledgedAt: { type: "date", required: false, input: false },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailVerification: async ({
        user,
        newEmail,
        url,
      }: {
        user: { id: string; email: string };
        newEmail: string;
        url: string;
      }) => {
        await sendMonitoredEmail({
          userId: user.id,
          category: "security",
          eventType: "auth.email_change_verification",
          to: newEmail,
          subject: "Confirm your new UnivAI email",
          text: `Confirm this address as the new email for your UnivAI account (${user.email}):\n${url}`,
          terminalPreview: true,
        });
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        // Assign registrationNumber + bootstrap the super_admin here so neither can ever
        // arrive from the client. defaultRole ("student") from the admin plugin
        // applies unless we override for the configured owner email.
        before: async (user, context) => {
          const directAttestation = validSignupAttestation(user);
          const oauthAttestation = verifyLegalSignupToken(
            context?.headers instanceof Headers ? context.headers : null,
          );
          // Provisioning an account is not acceptance by the end user. Such an
          // account stays unaccepted until the learner accepts at a covered
          // action (uploads always enforce the current EULA independently).
          const adminProvisioning = context?.path?.startsWith("/admin/create-user") ?? false;
          const attestation = directAttestation
            ? { uiLocale: normalizeUiLocale(user.uiLocale) }
            : oauthAttestation;
          if (!attestation && !adminProvisioning) {
            throw new APIError("UNPROCESSABLE_ENTITY", {
              code: "LEGAL_ACCEPTANCE_REQUIRED",
              message:
                "Accept the current EULA and acknowledge the current Privacy Notice before creating an account.",
            });
          }

          const seq = await pool.query<{ n: string }>(
            "SELECT nextval('student_id_seq') AS n"
          );
          const serial = String(seq.rows[0].n).padStart(6, "0");
          const registrationNumber = `S-${new Date().getFullYear()}-${serial}`;

          const isOwner =
            !!env.SUPER_ADMIN_EMAIL &&
            user.email.toLowerCase() === env.SUPER_ADMIN_EMAIL;

          return {
            data: {
              ...user,
              name: validatedUserName(user.name),
              registrationNumber,
              // NULL means "not given". Google sends no phone number, and the
              // register form no longer insists on one, so a blank arrives here
              // as "" and is normalised — one absent value, one representation.
              phone: normalizePhone((user as { phone?: string | null }).phone),
              uiLocale: normalizeUiLocale(attestation?.uiLocale ?? user.uiLocale),
              eulaAccepted: Boolean(attestation),
              eulaVersion: attestation ? CURRENT_EULA_VERSION : null,
              eulaAcceptedAt: attestation ? new Date() : null,
              privacyNoticeAcknowledged: Boolean(attestation),
              privacyNoticeVersion: attestation ? CURRENT_PRIVACY_NOTICE_VERSION : null,
              privacyNoticeAcknowledgedAt: attestation ? new Date() : null,
              ...(isOwner ? { role: "super_admin" } : {}),
            },
          };
        },
        after: async (user, context) => {
          if (user.eulaAccepted !== true || user.privacyNoticeAcknowledged !== true) return;
          await recordLegalAcceptances({
            userId: user.id,
            registrationNumber:
              typeof user.registrationNumber === "string" ? user.registrationNumber : null,
            locale: user.uiLocale,
            context: context?.path?.includes("callback") ? "oauth_signup" : "email_signup",
            documents: ["eula", "privacy_notice"],
            headers: context?.headers instanceof Headers ? context.headers : null,
            acceptedAt:
              user.eulaAcceptedAt instanceof Date ? user.eulaAcceptedAt : new Date(),
          });
        },
      },
      update: {
        // Covers profile edits and administrator writes. The HTTP guard gives
        // first-party forms a stable error, while this database boundary also
        // protects OAuth/plugin and future server-side write paths.
        before: async (user) => {
          if (user.name === undefined) return;
          return {
            data: {
              ...user,
              name: validatedUserName(user.name),
            },
          };
        },
      },
    },
  },

  // guardHook (before): reject duplicate-email sign-ups/changes and protect the
  // super_admin role. after: audit-log privileged admin actions, then email a
  // banned user the reason. Only one before/after middleware is allowed, so the
  // after concerns are composed here (both no-op on unrelated paths).
  hooks: {
    before: guardHook,
    after: createAuthMiddleware(async (ctx) => {
      await recordAudit(ctx);
      await sendBanNotification(ctx);
      await queueAuthSecurityNotification(ctx);
    }),
  },

  plugins: [
    admin({
      ac,
      roles,
      defaultRole: "student",
      adminRoles: ["admin", "super_admin"],
    }),
  ],
});

export type Auth = typeof auth;
