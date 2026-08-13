import { DAY_MS } from "./clock";

/**
 * Final-exam recovery and retake policy.
 *
 * Windows are half-open: access is allowed at `opensAt`, but not at
 * `closesAt`. That gives every boundary one unambiguous owner and prevents a
 * start and a finalization from both being valid at the same instant.
 */
export const FINAL_PRIMARY_WINDOW_MS = DAY_MS;
export const FINAL_RETAKE_REQUEST_WINDOW_MS = 14 * DAY_MS;
export const FINAL_RETAKE_DELAY_MS = 7 * DAY_MS;
export const FINAL_RETAKE_WINDOW_MS = DAY_MS;

export type FinalExamWindow = {
  opensAt: Date | null;
  closesAt: Date | null;
  retakeRequestDeadline: Date | null;
  primaryAvailable: boolean;
  retakeRequestAvailable: boolean;
  phase: "unscheduled" | "scheduled" | "primary-open" | "request-open" | "closed";
};

export function finalExamWindowAt(
  referenceTime: Date,
  lectureEndsAt: Date[],
): FinalExamWindow {
  const opensAt = lectureEndsAt.reduce<Date | null>(
    (latest, endsAt) => (!latest || endsAt > latest ? endsAt : latest),
    null,
  );
  if (!opensAt) {
    return {
      opensAt: null,
      closesAt: null,
      retakeRequestDeadline: null,
      primaryAvailable: false,
      retakeRequestAvailable: false,
      phase: "unscheduled",
    };
  }

  const closesAt = new Date(opensAt.getTime() + FINAL_PRIMARY_WINDOW_MS);
  const retakeRequestDeadline = new Date(
    closesAt.getTime() + FINAL_RETAKE_REQUEST_WINDOW_MS,
  );
  const timestamp = referenceTime.getTime();
  const primaryAvailable = timestamp >= opensAt.getTime() && timestamp < closesAt.getTime();
  const retakeRequestAvailable =
    timestamp >= closesAt.getTime() && timestamp < retakeRequestDeadline.getTime();

  return {
    opensAt,
    closesAt,
    retakeRequestDeadline,
    primaryAvailable,
    retakeRequestAvailable,
    phase:
      timestamp < opensAt.getTime()
        ? "scheduled"
        : primaryAvailable
          ? "primary-open"
          : retakeRequestAvailable
            ? "request-open"
            : "closed",
  };
}

export function retakeWindowForRequest(requestedAt: Date): {
  availableAt: Date;
  closesAt: Date;
} {
  const availableAt = new Date(requestedAt.getTime() + FINAL_RETAKE_DELAY_MS);
  return {
    availableAt,
    closesAt: new Date(availableAt.getTime() + FINAL_RETAKE_WINDOW_MS),
  };
}

export function isWithinWindow(referenceTime: Date, opensAt: Date, closesAt: Date): boolean {
  const timestamp = referenceTime.getTime();
  return timestamp >= opensAt.getTime() && timestamp < closesAt.getTime();
}
