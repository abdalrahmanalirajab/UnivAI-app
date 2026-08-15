export const OPTIONAL_NOTIFICATION_CATEGORIES = [
  "course",
  "lecture",
  "assessment",
  "transcript",
] as const;

export const REQUIRED_NOTIFICATION_CATEGORIES = ["security", "billing", "admin"] as const;

export type OptionalNotificationCategory =
  (typeof OPTIONAL_NOTIFICATION_CATEGORIES)[number];
export type RequiredNotificationCategory =
  (typeof REQUIRED_NOTIFICATION_CATEGORIES)[number];
export type NotificationCategory =
  | OptionalNotificationCategory
  | RequiredNotificationCategory;

export const DEFAULT_NOTIFICATION_PREFERENCES: Record<
  OptionalNotificationCategory,
  boolean
> = {
  course: true,
  lecture: true,
  assessment: true,
  transcript: true,
};

export type NotificationEvent =
  | { type: "course.ready"; courseTitle: string }
  | { type: "course.failed"; courseTitle: string }
  | { type: "lecture.reminder"; lectureTitle: string; startsAt: string | Date }
  | {
      type: "assessment.result";
      assessmentTitle: string;
      score: number;
      maxScore: number;
      passed: boolean;
    }
  | { type: "final.retake_scheduled"; availableAt: string | Date }
  | { type: "final.retake_declined"; reason: string }
  | { type: "transcript.ready"; courseTitle: string; grade: string }
  | { type: "absence.clarification_required"; question: string }
  | {
      type: "absence.decision";
      outcome: "excused" | "access_only" | "unexcused";
      decisionReason: string;
    }
  | { type: "admin.action_required"; title: string; safeSummary: string }
  | { type: "security.password_changed" }
  | { type: "security.sessions_revoked" }
  | { type: "billing.subscription_activated"; planName: string }
  | { type: "billing.payment_failed"; planName: string }
  | { type: "billing.subscription_suspended"; planName: string }
  | { type: "billing.subscription_cancelled"; planName: string };

export type RenderedNotification = {
  category: NotificationCategory;
  eventType: NotificationEvent["type"];
  subject: string;
  text: string;
};
