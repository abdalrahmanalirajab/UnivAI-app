import { sendEmail } from "./email";

/**
 * User-facing notifications for privileged admin actions. Called from the
 * composed `hooks.after` middleware in lib/auth.ts, after the action succeeded.
 *
 * Currently: when an admin bans a user (/admin/ban-user), email the banned
 * person the reason the admin submitted. The ban-user route returns the updated
 * user ({ user: { email, name, banReason, ... } }), so we read everything from
 * there — no extra lookup. Sending never throws: a failed email must not break
 * the ban it is announcing (the ban is already committed).
 */

type BanCtx = {
  path: string;
  body?: { userId?: string; banReason?: string };
  context: {
    returned?: {
      user?: {
        email?: string;
        name?: string;
        banReason?: string | null;
      };
    } | null;
  };
};

export async function sendBanNotification(ctx: unknown) {
  const c = ctx as BanCtx;
  if (c.path !== "/admin/ban-user") return;

  // A forbidden/failed ban throws before producing `returned.user`.
  const user = c.context.returned?.user;
  if (!user?.email) return;

  const reason =
    user.banReason || c.body?.banReason || "No reason was provided.";

  try {
    await sendEmail({
      to: user.email,
      subject: "Your UnivAI account has been suspended",
      text: `Hi ${user.name ?? "there"},

Your UnivAI account (${user.email}) has been suspended by an administrator.

Reason: ${reason}

You will not be able to sign in while the suspension is in effect. If you believe this is a mistake, please reply to this email to contact support.`,
    });
  } catch (err) {
    console.error("ban notification email failed:", err);
  }
}
