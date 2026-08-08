import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
import { pool } from "./db";
import { env } from "./env";
import { sendEmail } from "./email";
import { ac, roles } from "./auth-ac";
import { recordAudit } from "./auth-audit";
import { sendBanNotification } from "./auth-notify";
import { guardHook } from "./auth-guards";

/**
 * Better Auth — the whole auth backend. See docs/auth-plan.md (Phase 1) and
 * docs/auth-contract.md for the shapes Dev B builds against.
 *
 * Reuses the app's existing pg Pool (lib/db.ts) — no second connection, no ORM.
 * `role` and `banned/banReason/banExpires` come from the admin plugin; `phone`
 * and `studentId` are our additional fields. `studentId` and the super_admin
 * bootstrap are assigned server-side in the create hook, never from the client.
 */
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: pool,

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
      await sendEmail({
        to: user.email,
        subject: "Reset your UnivAI password",
        text: `Someone asked to reset the password for your UnivAI account.\n\nReset it here (link expires soon):\n${url}\n\nIf this wasn't you, you can safely ignore this email.`,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your UnivAI email",
        text: `Welcome to UnivAI.\n\nConfirm your email to activate your account:\n${url}\n\nIf you didn't create an account, you can ignore this email.`,
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
      studentId: { type: "string", required: false, input: false },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailVerification: async ({
        user,
        newEmail,
        url,
      }: {
        user: { email: string };
        newEmail: string;
        url: string;
      }) => {
        await sendEmail({
          to: newEmail,
          subject: "Confirm your new UnivAI email",
          text: `Confirm this address as the new email for your UnivAI account (${user.email}):\n${url}`,
        });
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        // Assign studentId + bootstrap the super_admin here so neither can ever
        // arrive from the client. defaultRole ("student") from the admin plugin
        // applies unless we override for the configured owner email.
        before: async (user) => {
          const seq = await pool.query<{ n: string }>(
            "SELECT nextval('student_id_seq') AS n"
          );
          const serial = String(seq.rows[0].n).padStart(6, "0");
          const studentId = `S-${new Date().getFullYear()}-${serial}`;

          const isOwner =
            !!env.SUPER_ADMIN_EMAIL &&
            user.email.toLowerCase() === env.SUPER_ADMIN_EMAIL;

          return {
            data: {
              ...user,
              studentId,
              // user.phone is NOT NULL in the schema and Google sends no phone
              // number, so a social sign-up would otherwise fail on insert.
              // Empty means "not given yet"; /profile is where it gets filled.
              phone: (user as { phone?: string }).phone ?? "",
              ...(isOwner ? { role: "super_admin" } : {}),
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
