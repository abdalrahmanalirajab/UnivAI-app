import { env } from "./env";
import type { NotificationEvent, RenderedNotification } from "./notification-types";

function inline(value: string, fallback: string): string {
  const clean = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return clean || fallback;
}

function finiteScore(value: number, label: string): string {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be non-negative.`);
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function actionUrl(pathname: string): string {
  try {
    const url = new URL(pathname, env.BETTER_AUTH_URL);
    if (url.protocol !== "https:" && url.protocol !== "http:") return pathname;
    return url.toString();
  } catch {
    return pathname;
  }
}

function message(subject: string, detail: string, action: string, pathname: string): string {
  return `${detail}\n\n${action}:\n${actionUrl(pathname)}\n\n— UnivAI`;
}

export function renderNotification(event: NotificationEvent): RenderedNotification {
  switch (event.type) {
    case "course.ready": {
      const course = inline(event.courseTitle, "Your course");
      return {
        category: "course",
        eventType: event.type,
        subject: `${course} is ready`,
        text: message(
          `${course} is ready`,
          `Your course “${course}” is ready. You can now see its schedule and begin learning.`,
          "Open your course",
          "/dashboard",
        ),
      };
    }
    case "course.failed": {
      const course = inline(event.courseTitle, "Your course");
      return {
        category: "course",
        eventType: event.type,
        subject: `${course} needs your attention`,
        text: message(
          `${course} needs your attention`,
          `We could not finish preparing “${course}”. Your source is still safe; open UnivAI to retry or review it.`,
          "Review the course",
          "/library",
        ),
      };
    }
    case "lecture.reminder": {
      const lecture = inline(event.lectureTitle, "Your lecture");
      const startsAt = new Date(event.startsAt);
      if (Number.isNaN(startsAt.getTime())) throw new Error("startsAt must be a valid date.");
      const time = new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      }).format(startsAt);
      return {
        category: "lecture",
        eventType: event.type,
        subject: `Reminder: ${lecture}`,
        text: message(
          `Reminder: ${lecture}`,
          `“${lecture}” starts on ${time}.`,
          "View your schedule",
          "/schedule",
        ),
      };
    }
    case "assessment.result": {
      const assessment = inline(event.assessmentTitle, "Your assessment");
      const score = finiteScore(event.score, "score");
      const maxScore = finiteScore(event.maxScore, "maxScore");
      return {
        category: "assessment",
        eventType: event.type,
        subject: `${assessment} result: ${score}/${maxScore}`,
        text: message(
          `${assessment} result`,
          `Your result for “${assessment}” is ${score}/${maxScore}. Status: ${event.passed ? "passed" : "not passed"}.`,
          "View your results",
          "/transcript",
        ),
      };
    }
    case "transcript.ready": {
      const course = inline(event.courseTitle, "Your course");
      const grade = inline(event.grade, "available");
      return {
        category: "transcript",
        eventType: event.type,
        subject: `Your ${course} grade is ready`,
        text: message(
          `Your ${course} grade is ready`,
          `Your final course grade is ${grade}. Your transcript is now available.`,
          "Open your transcript",
          "/transcript",
        ),
      };
    }
    case "security.password_changed":
      return {
        category: "security",
        eventType: event.type,
        subject: "Your UnivAI password was changed",
        text: message(
          "Your UnivAI password was changed",
          "Your password was changed. If this was not you, reset it immediately and revoke your other sessions.",
          "Secure your account",
          "/profile",
        ),
      };
    case "security.sessions_revoked":
      return {
        category: "security",
        eventType: event.type,
        subject: "Your other UnivAI sessions were signed out",
        text: message(
          "Your other UnivAI sessions were signed out",
          "Your other signed-in sessions were revoked. If this was not you, change your password immediately.",
          "Review your account",
          "/profile",
        ),
      };
    case "billing.subscription_activated": {
      const plan = inline(event.planName, "paid");
      return {
        category: "billing",
        eventType: event.type,
        subject: `Your ${plan} plan is active`,
        text: message(
          `Your ${plan} plan is active`,
          `Your ${plan} subscription is active and its weekly coin allowance is available.`,
          "View your plan",
          "/subscribe",
        ),
      };
    }
    case "billing.payment_failed": {
      const plan = inline(event.planName, "paid");
      return {
        category: "billing",
        eventType: event.type,
        subject: `Payment issue with your ${plan} plan`,
        text: message(
          `Payment issue with your ${plan} plan`,
          `We could not renew your ${plan} subscription. Your learning content remains available.`,
          "Review your plan",
          "/subscribe",
        ),
      };
    }
    case "billing.subscription_suspended": {
      const plan = inline(event.planName, "paid");
      return {
        category: "billing",
        eventType: event.type,
        subject: `Your ${plan} plan is paused`,
        text: message(
          `Your ${plan} plan is paused`,
          `Your ${plan} subscription is paused. Your learning content remains available.`,
          "Review your plan",
          "/subscribe",
        ),
      };
    }
    case "billing.subscription_cancelled": {
      const plan = inline(event.planName, "paid");
      return {
        category: "billing",
        eventType: event.type,
        subject: `Your ${plan} plan was cancelled`,
        text: message(
          `Your ${plan} plan was cancelled`,
          `Your subscription was cancelled. Your courses and academic features remain available.`,
          "View your plan",
          "/subscribe",
        ),
      };
    }
  }
}
