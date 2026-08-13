export const AI_OUTPUT_TARGET_TYPES = [
  "raise_hand_answer",
  "lecture",
  "section",
  "curriculum",
] as const;

export type AiOutputTargetType = (typeof AI_OUTPUT_TARGET_TYPES)[number];

export type AiOutputTarget = {
  targetType: AiOutputTargetType;
  targetId: string;
  targetVersion: string;
  traceId: string;
};

export const AI_OUTPUT_REPORT_REASONS = [
  "incorrect",
  "unsupported_or_uncited",
  "irrelevant",
  "unsafe_or_inappropriate",
  "copyright_or_privacy",
  "technical_issue",
] as const;

export type AiOutputReportReason = (typeof AI_OUTPUT_REPORT_REASONS)[number];

export const AI_OUTPUT_REPORT_REASON_LABELS: Record<AiOutputReportReason, string> = {
  incorrect: "Incorrect or misleading",
  unsupported_or_uncited: "Unsupported or missing sources",
  irrelevant: "Irrelevant or unhelpful",
  unsafe_or_inappropriate: "Unsafe or inappropriate",
  copyright_or_privacy: "Copyright or privacy concern",
  technical_issue: "Broken or incomplete output",
};

export const AI_OUTPUT_REPORT_STATUSES = [
  "pending",
  "reviewing",
  "resolved",
  "dismissed",
] as const;

export type AiOutputReportStatus = (typeof AI_OUTPUT_REPORT_STATUSES)[number];

export function lectureFeedbackTarget(
  artifactId: string,
  artifactVersion: string,
): AiOutputTarget {
  return {
    targetType: "lecture",
    targetId: artifactId,
    targetVersion: artifactVersion,
    traceId: `lecture:${artifactId}:${artifactVersion}`,
  };
}

export function sectionFeedbackTarget(
  sectionPackId: string,
  payloadHash: string,
): AiOutputTarget {
  return {
    targetType: "section",
    targetId: sectionPackId,
    targetVersion: payloadHash,
    traceId: `section:${sectionPackId}:${payloadHash}`,
  };
}

export function curriculumFeedbackTarget(
  programmeId: number | string,
  planVersion: number | string,
): AiOutputTarget {
  const targetId = String(programmeId);
  const targetVersion = String(planVersion);
  return {
    targetType: "curriculum",
    targetId,
    targetVersion,
    traceId: `curriculum:${targetId}:${targetVersion}`,
  };
}

export function raiseHandFeedbackTarget(
  qaId: number | string,
  traceId: string,
): AiOutputTarget {
  return {
    targetType: "raise_hand_answer",
    targetId: String(qaId),
    targetVersion: "1",
    traceId,
  };
}
