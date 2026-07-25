import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { pool } from "./db";
import { env } from "./env";
import { sendEmail } from "./email";
import { ac, roles } from "./auth-ac";
import { auditHook } from "./auth-audit";
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
    // A fresh account can't sign in until it verifies its email (contract §6.1/6.2).
    requireEmailVerification: true,
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

  user: {
    additionalFields: {
      // Collected at registration, shown/edited on the profile — NOT verified.
      phone: { type: "string", required: true, input: true },
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
              ...(isOwner ? { role: "super_admin" } : {}),
            },
          };
        },
      },
    },
  },

  // guardHook (before): reject duplicate-email sign-ups and protect the
  // super_admin role. auditHook (after): log privileged admin actions.
  hooks: {
    before: guardHook,
    after: auditHook,
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
