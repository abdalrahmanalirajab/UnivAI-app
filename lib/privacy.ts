import "server-only";

import { query, queryOne } from "./db";

export const PRIVACY_REQUEST_TYPES = [
  "access",
  "deletion",
  "correction",
  "portability",
  "restriction",
  "objection",
  "sale_share_opt_out",
  "limit_sensitive_use",
] as const;

export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];
export type PrivacyRequestStatus =
  | "received"
  | "identity_check"
  | "in_progress"
  | "completed"
  | "declined"
  | "cancelled";

export type PrivacyRequest = {
  id: string;
  requestType: PrivacyRequestType;
  status: PrivacyRequestStatus;
  detail: string | null;
  submittedAt: string;
  dueAt: string;
  completedAt: string | null;
  adminNote: string | null;
};

export type PrivacyPreferences = {
  saleOrSharingOptOut: boolean;
  limitSensitiveDataUse: boolean;
  updatedAt: string | null;
};

type PrivacyRequestRow = {
  id: string;
  request_type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  detail: string | null;
  submitted_at: string;
  due_at: string;
  completed_at: string | null;
  admin_note: string | null;
};

function publicRequest(row: PrivacyRequestRow): PrivacyRequest {
  return {
    id: row.id,
    requestType: row.request_type,
    status: row.status,
    detail: row.detail,
    submittedAt: new Date(row.submitted_at).toISOString(),
    dueAt: new Date(row.due_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    adminNote: row.admin_note,
  };
}

export function validatePrivacyRequest(
  requestType: unknown,
  detail: unknown,
): string | null {
  if (
    typeof requestType !== "string" ||
    !PRIVACY_REQUEST_TYPES.includes(requestType as PrivacyRequestType)
  ) {
    return "Choose a supported privacy request type.";
  }
  if (detail !== null && detail !== undefined && typeof detail !== "string") {
    return "Request details must be text.";
  }
  if (typeof detail === "string" && detail.trim().length > 2000) {
    return "Request details must be at most 2,000 characters.";
  }
  if (typeof detail === "string" && detail.includes("\u0000")) {
    return "Request details contain an unsupported control character.";
  }
  if (
    (requestType === "correction" || requestType === "objection") &&
    (typeof detail !== "string" || detail.trim().length < 10)
  ) {
    return "Give enough detail for the administrator to understand this request (at least 10 characters).";
  }
  return null;
}

export async function listPrivacyRequests(userId: string): Promise<PrivacyRequest[]> {
  const rows = await query<PrivacyRequestRow>(
    `SELECT id::text, request_type, status, detail, submitted_at, due_at,
            completed_at, admin_note
       FROM privacy_requests
      WHERE user_id = $1::uuid
      ORDER BY submitted_at DESC
      LIMIT 100`,
    [userId],
  );
  return rows.map(publicRequest);
}

export async function createPrivacyRequest(input: {
  userId: string;
  registrationNumber: string;
  requestType: PrivacyRequestType;
  detail?: string | null;
}): Promise<{ request: PrivacyRequest; duplicate: boolean }> {
  const validation = validatePrivacyRequest(input.requestType, input.detail);
  if (validation) throw new Error(validation);

  const existing = await queryOne<PrivacyRequestRow>(
    `SELECT id::text, request_type, status, detail, submitted_at, due_at,
            completed_at, admin_note
       FROM privacy_requests
      WHERE user_id = $1::uuid AND request_type = $2
        AND status IN ('received', 'identity_check', 'in_progress')
      ORDER BY submitted_at DESC LIMIT 1`,
    [input.userId, input.requestType],
  );
  if (existing) {
    // Re-apply the durable preference on retries. If the original request was
    // inserted but the preference write failed, a duplicate retry repairs it.
    if (input.requestType === "sale_share_opt_out") {
      await setPrivacyPreferences(input.userId, { saleOrSharingOptOut: true });
    }
    if (input.requestType === "limit_sensitive_use") {
      await setPrivacyPreferences(input.userId, { limitSensitiveDataUse: true });
    }
    return { request: publicRequest(existing), duplicate: true };
  }

  const row = await queryOne<PrivacyRequestRow>(
    `INSERT INTO privacy_requests
       (user_id, registration_number, request_type, detail)
     VALUES ($1::uuid, $2, $3, $4)
     RETURNING id::text, request_type, status, detail, submitted_at, due_at,
               completed_at, admin_note`,
    [input.userId, input.registrationNumber, input.requestType, input.detail?.trim() || null],
  );
  if (!row) throw new Error("Could not create the privacy request.");

  if (input.requestType === "sale_share_opt_out") {
    await setPrivacyPreferences(input.userId, { saleOrSharingOptOut: true });
  }
  if (input.requestType === "limit_sensitive_use") {
    await setPrivacyPreferences(input.userId, { limitSensitiveDataUse: true });
  }
  return { request: publicRequest(row), duplicate: false };
}

export async function getPrivacyPreferences(userId: string): Promise<PrivacyPreferences> {
  const row = await queryOne<{
    sale_or_sharing_opt_out: boolean;
    limit_sensitive_data_use: boolean;
    updated_at: string;
  }>(
    `SELECT sale_or_sharing_opt_out, limit_sensitive_data_use, updated_at
       FROM privacy_preferences WHERE user_id = $1::uuid`,
    [userId],
  );
  return {
    saleOrSharingOptOut: row?.sale_or_sharing_opt_out ?? false,
    limitSensitiveDataUse: row?.limit_sensitive_data_use ?? false,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function setPrivacyPreferences(
  userId: string,
  change: Partial<Pick<PrivacyPreferences, "saleOrSharingOptOut" | "limitSensitiveDataUse">>,
): Promise<PrivacyPreferences> {
  const current = await getPrivacyPreferences(userId);
  const sale = change.saleOrSharingOptOut ?? current.saleOrSharingOptOut;
  const sensitive = change.limitSensitiveDataUse ?? current.limitSensitiveDataUse;
  const row = await queryOne<{
    sale_or_sharing_opt_out: boolean;
    limit_sensitive_data_use: boolean;
    updated_at: string;
  }>(
    `INSERT INTO privacy_preferences
       (user_id, sale_or_sharing_opt_out, limit_sensitive_data_use, updated_at)
     VALUES ($1::uuid, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       sale_or_sharing_opt_out = EXCLUDED.sale_or_sharing_opt_out,
       limit_sensitive_data_use = EXCLUDED.limit_sensitive_data_use,
       updated_at = CURRENT_TIMESTAMP
     RETURNING sale_or_sharing_opt_out, limit_sensitive_data_use, updated_at`,
    [userId, sale, sensitive],
  );
  return {
    saleOrSharingOptOut: row?.sale_or_sharing_opt_out ?? sale,
    limitSensitiveDataUse: row?.limit_sensitive_data_use ?? sensitive,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

async function optionalRows<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[],
): Promise<T[]> {
  try {
    return await query<T>(sql, params);
  } catch (error) {
    // Some installations upgrade app and service schemas independently. An
    // absent optional table should not block access to the rest of the user's
    // data, while every other database error remains visible.
    if ((error as { code?: string })?.code === "42P01") return [];
    throw error;
  }
}

export async function buildPersonalDataExport(input: {
  userId: string;
  registrationNumber: string;
}) {
  const [
    profile,
    accounts,
    sessions,
    legalAcceptances,
    privacyRequests,
    privacyPreferences,
    books,
    generationMilestones,
    collections,
    documents,
    programmes,
    lectures,
    lectureArtifacts,
    sectionPacks,
    attendance,
    grades,
    finalExamCases,
    questionsAndAnswers,
    outputVersions,
    legacyFeedback,
    outputReactions,
    outputReports,
    subscriptions,
    creditWallet,
    creditTransactions,
    notificationPreferences,
    notificationOutbox,
    notificationDeliveryLog,
    rateLimitPolicies,
    rateLimitUsage,
    transcripts,
    certificates,
    authAudit,
  ] = await Promise.all([
    optionalRows(
      `SELECT id::text, name, email, "emailVerified", image, "createdAt", "updatedAt",
              role, phone, "registrationNumber", "uiLocale", "eulaVersion",
              "eulaAcceptedAt", "privacyNoticeVersion", "privacyNoticeAcknowledgedAt"
         FROM "user" WHERE id = $1::uuid`,
      [input.userId],
    ),
    optionalRows(
      `SELECT "providerId", "accountId", scope, "createdAt", "updatedAt"
         FROM account WHERE "userId" = $1::uuid`,
      [input.userId],
    ),
    optionalRows(
      `SELECT "createdAt", "updatedAt", "expiresAt", "ipAddress", "userAgent"
         FROM session WHERE "userId" = $1::uuid ORDER BY "createdAt" DESC`,
      [input.userId],
    ),
    optionalRows(
      `SELECT document_type, document_version, document_hash, context, locale,
              accepted_at, ip_address, user_agent
         FROM legal_acceptances WHERE user_id = $1::uuid ORDER BY accepted_at DESC`,
      [input.userId],
    ),
    optionalRows(
      `SELECT id::text, request_type, status, detail, submitted_at, due_at,
              identity_verified_at, completed_at, admin_note, updated_at
         FROM privacy_requests WHERE user_id = $1::uuid ORDER BY submitted_at DESC`,
      [input.userId],
    ),
    optionalRows(
      `SELECT sale_or_sharing_opt_out, limit_sensitive_data_use, updated_at
         FROM privacy_preferences WHERE user_id = $1::uuid`,
      [input.userId],
    ),
    optionalRows(
      `SELECT id, filename, title, pages, status, error, uploaded_at, progress,
              generation_stage, generation_total_weeks, generation_ready_weeks,
              generation_audio_ready_weeks, semester_plan
         FROM books WHERE student_id = $1 ORDER BY id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, book_id, week, stage, status, attempt_count, progress, error,
              started_at, completed_at, updated_at
         FROM course_generation_milestones
        WHERE student_id = $1 ORDER BY book_id, week, stage, id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, name, created_at
         FROM collections WHERE student_id = $1 ORDER BY id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, collection_id, filename, status, error, created_at, updated_at
         FROM documents WHERE student_id = $1 ORDER BY id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, collection_id, name, status, plan_version, plan, approved_at,
              created_at, updated_at
         FROM programmes WHERE student_id = $1 ORDER BY id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, public_id::text, book_id, week, title, starts_at, status
         FROM lectures WHERE student_id = $1 ORDER BY week, id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT artifact_id::text, book_id, week, title, lecture_payload,
              script_payload, slides_payload, quiz_payload, created_at, updated_at
         FROM lecture_artifacts WHERE student_id = $1 ORDER BY week, artifact_id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT section_pack_id, schema_version, programme_id, course_id, week,
              lecture_id, approved_plan_id, approved_plan_version, prompt_id,
              prompt_version, pack_payload, created_at
         FROM section_packs WHERE tenant_id = $1 ORDER BY week, section_pack_id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, lecture_id, joined_at, status, late_minutes, completed_at,
              attended_seconds, is_connected, presence_last_seen_at,
              last_connected_at, last_disconnected_at, disconnect_count,
              last_sentence_index, total_sentences
         FROM attendance WHERE student_id = $1 ORDER BY lecture_id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, kind, week, score, max_score, feedback, taken_at, exam_id,
              flagged, report
         FROM grades WHERE student_id = $1 ORDER BY id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT curriculum_id, primary_opens_at, primary_closes_at, request_deadline,
              primary_exam_id, primary_submitted_at, primary_result,
              retake_requested_at, retake_reason, retake_available_at,
              retake_closes_at, retake_exam_id, retake_submitted_at, retake_result,
              declined_at, decline_reason, finalized_at, finalization_reason,
              official_exam_id, official_result, created_at, updated_at
         FROM final_exam_cases WHERE student_id = $1 ORDER BY created_at, curriculum_id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, lecture_id, question, answer, citations, model_used, asked_at,
              trace_id
         FROM qa_log WHERE student_id = $1 ORDER BY id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, source_qa_id, book_id, version, trace_id, status, created_at
         FROM output_versions WHERE student_id = $1 ORDER BY source_qa_id, version, id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, output_id, output_version, trace_id, rating, issue, note, created_at
         FROM output_feedback WHERE student_id = $1 ORDER BY id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, target_type, target_id, target_version, trace_id, rating, liked,
              created_at, updated_at
         FROM ai_output_reactions WHERE student_id = $1 ORDER BY id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, target_type, target_id, target_version, trace_id, reason, detail,
              status, reviewed_at, created_at, updated_at
         FROM ai_output_reports WHERE student_id = $1 ORDER BY id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT plan_code, pending_plan_code, status, provider,
              provider_subscription_id, provider_plan_id, subscribed_at,
              current_period_ends_at, cancelled_at, created_at, updated_at
         FROM user_subscriptions WHERE user_id = $1::uuid`,
      [input.userId],
    ),
    optionalRows(
      `SELECT balance, reserved_balance, weekly_grant_amount, next_grant_at, updated_at
         FROM credit_wallets WHERE user_id = $1::uuid`,
      [input.userId],
    ),
    optionalRows(
      `SELECT id::text, amount, balance_after, reason, reference_type,
              reference_id, metadata, created_at
         FROM credit_transactions WHERE user_id = $1::uuid ORDER BY created_at, id`,
      [input.userId],
    ),
    optionalRows(
      `SELECT category, email_enabled, updated_at
         FROM notification_preferences WHERE user_id = $1::uuid`,
      [input.userId],
    ),
    optionalRows(
      `SELECT id::text, category, event_type, subject, status, attempts,
              available_at, sent_at, created_at, updated_at
         FROM notification_email_outbox
        WHERE user_id = $1::uuid ORDER BY created_at, id`,
      [input.userId],
    ),
    optionalRows(
      `SELECT id::text, category, event_type, subject, status, attempts,
              sent_at, created_at, updated_at
         FROM notification_email_delivery_log
        WHERE user_id = $1::uuid ORDER BY created_at, id`,
      [input.userId],
    ),
    optionalRows(
      `SELECT scope, enabled, blocked, max_requests, window_seconds, updated_at
         FROM user_rate_limit_policies WHERE user_id = $1::uuid ORDER BY scope`,
      [input.userId],
    ),
    optionalRows(
      `SELECT scope, bucket_start, request_count, updated_at
         FROM user_rate_limit_usage
        WHERE user_id = $1::uuid ORDER BY bucket_start, scope`,
      [input.userId],
    ),
    optionalRows(
      `SELECT id, course_key, course_title, quiz_percentage,
              attendance_percentage, midterm_percentage, final_percentage,
              coursework_points, total_percentage, letter_grade, gpa, passed,
              completed_at, review_status, release_at, reviewed_at, review_note,
              created_at, updated_at
         FROM course_transcripts WHERE student_id = $1 ORDER BY completed_at, id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, transcript_id, template_key, filename, mime_type, issued_at
         FROM certificate_artifacts WHERE student_id = $1 ORDER BY issued_at, id`,
      [input.registrationNumber],
    ),
    optionalRows(
      `SELECT id, action,
              (actor_id = $1 OR actor_id = $2) AS was_actor,
              (target_id = $1 OR target_id = $2) AS was_target,
              created_at
         FROM auth_audit
        WHERE actor_id = $1 OR actor_id = $2 OR target_id = $1 OR target_id = $2
        ORDER BY created_at, id`,
      [input.userId, input.registrationNumber],
    ),
  ]);

  return {
    exportVersion: "univai-personal-data-v1",
    generatedAt: new Date().toISOString(),
    scopeNote:
      "This self-service Postgres snapshot excludes passwords, session tokens, provider access tokens, internal secrets, uploaded file bytes, internal administrator data, and data that belongs to other people. It does not itself retrieve data held by separately deployed exam, vector-search, live-audio, or file-storage services; request access or portability in the Privacy center when a cross-service search is needed.",
    account: profile[0] ?? null,
    linkedAccounts: accounts,
    sessions,
    legalAcceptances,
    privacyRequests,
    privacyPreferences: privacyPreferences[0] ?? null,
    learning: {
      books,
      generationMilestones,
      collections,
      documents,
      programmes,
      lectures,
      lectureArtifacts,
      sectionPacks,
      attendance,
      grades,
      finalExamCases,
      questionsAndAnswers,
      outputVersions,
      outputFeedback: {
        legacy: legacyFeedback,
        reactions: outputReactions,
        reports: outputReports,
      },
    },
    subscription: subscriptions,
    credits: { wallet: creditWallet[0] ?? null, transactions: creditTransactions },
    notifications: {
      preferences: notificationPreferences,
      outbox: notificationOutbox,
      deliveryLog: notificationDeliveryLog,
    },
    rateLimits: { policies: rateLimitPolicies, usage: rateLimitUsage },
    academicRecords: { transcripts, certificates },
    securityActivity: authAudit,
  };
}
