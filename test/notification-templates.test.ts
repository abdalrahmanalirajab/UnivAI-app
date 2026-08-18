import { describe, expect, it } from "vitest";

import { renderNotification } from "@/lib/notification-templates";

describe("notification templates", () => {
  it("renders important events as bounded plain text", () => {
    const result = renderNotification({
      type: "course.ready",
      courseTitle: "Data\nIntensive\u0000Applications",
    });

    expect(result.category).toBe("course");
    expect(result.subject).toBe("Data Intensive Applications is ready");
    expect(result.text).toContain("Your course “Data Intensive Applications” is ready.");
    expect(result.text).not.toContain("\u0000");
  });

  it("shows an assessment score without exposing answer data", () => {
    const result = renderNotification({
      type: "assessment.result",
      assessmentTitle: "Final exam",
      score: 18,
      maxScore: 24,
      passed: true,
    });

    expect(result.subject).toContain("18/24");
    expect(result.text).toContain("Status: passed");
    expect(result.text).not.toMatch(/correct answer|answer key/i);
  });

  it("rejects invalid dates and scores before they reach the outbox", () => {
    expect(() =>
      renderNotification({
        type: "lecture.reminder",
        lectureTitle: "Week 2",
        startsAt: "not-a-date",
      }),
    ).toThrow("valid date");
    expect(() =>
      renderNotification({
        type: "assessment.result",
        assessmentTitle: "Quiz",
        score: -1,
        maxScore: 4,
        passed: false,
      }),
    ).toThrow("non-negative");
  });

  it("formats lecture reminder times explicitly in UTC", () => {
    const result = renderNotification({
      type: "lecture.reminder",
      lectureTitle: "Week 2",
      startsAt: "2026-08-10T15:30:00.000Z",
    });
    expect(result.text).toContain("Aug 10, 2026");
    expect(result.text).toContain("UTC");
  });

  it("encourages the learner and states the seven-day retake schedule", () => {
    const result = renderNotification({
      type: "final.retake_scheduled",
      availableAt: "2026-08-17T15:30:00.000Z",
    });

    expect(result.category).toBe("assessment");
    expect(result.subject).toContain("retake is scheduled");
    expect(result.text).toContain("Aug 17, 2026");
    expect(result.text).toContain("seven days");
    expect(result.text).toContain("study hard");
  });

  it("explains a declined retake and the resulting official grade", () => {
    const result = renderNotification({
      type: "final.retake_declined",
      reason: "The supplied reason did not establish a qualifying disruption.",
    });

    expect(result.category).toBe("assessment");
    expect(result.subject).toContain("declined");
    expect(result.text).toContain("qualifying disruption");
    expect(result.text).toContain("official grade");
    expect(result.text).toContain("Absent");
  });

  it("marks security and billing notifications as required categories", () => {
    expect(renderNotification({ type: "security.sessions_revoked" }).category).toBe("security");
    expect(
      renderNotification({ type: "billing.payment_failed", planName: "Supporter" }).category,
    ).toBe("billing");
  });

  it("renders privacy outcomes as required account notifications", () => {
    const result = renderNotification({
      type: "privacy.request_resolved",
      requestLabel: "personal-data access",
      status: "completed",
      outcome: "Your verified data export is ready.",
    });

    expect(result.category).toBe("security");
    expect(result.subject).toContain("request is complete");
    expect(result.text).toContain("Your verified data export is ready.");
    expect(result.text).toContain("/settings#privacy");
  });
});
