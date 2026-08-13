import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { query } from "./db";
import { env } from "./env";
import {
  CURRENT_EULA_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  canonicalLegalText,
  normalizeUiLocale,
  type LegalDocumentType,
  type UiLocale,
} from "./legal-documents";

export const LEGAL_SIGNUP_COOKIE = "univai-legal-signup";
export const UI_LOCALE_COOKIE = "univai-ui-locale";

export type LegalContext = "email_signup" | "oauth_signup" | "upload" | "settings";

export type LegalSignupAttestation = {
  eulaAccepted: true;
  eulaVersion: typeof CURRENT_EULA_VERSION;
  privacyNoticeAcknowledged: true;
  privacyNoticeVersion: typeof CURRENT_PRIVACY_NOTICE_VERSION;
  uiLocale: UiLocale;
  issuedAt: number;
};

export function legalDocumentHash(type: LegalDocumentType, locale: UiLocale = "en"): string {
  return createHash("sha256").update(canonicalLegalText(type, locale), "utf8").digest("hex");
}

export function validSignupAttestation(value: Record<string, unknown>): boolean {
  return (
    value.eulaAccepted === true &&
    value.eulaVersion === CURRENT_EULA_VERSION &&
    value.privacyNoticeAcknowledged === true &&
    value.privacyNoticeVersion === CURRENT_PRIVACY_NOTICE_VERSION &&
    (value.uiLocale === "en" || value.uiLocale === "ar")
  );
}

export function validUploadAttestation(form: FormData): boolean {
  return (
    form.get("eulaAccepted") === "true" &&
    form.get("eulaVersion") === CURRENT_EULA_VERSION
  );
}

function signature(value: string): Buffer {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required to sign legal acceptance evidence.");
  }
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(value).digest();
}

export function createLegalSignupToken(locale: UiLocale): string {
  const payload: LegalSignupAttestation = {
    eulaAccepted: true,
    eulaVersion: CURRENT_EULA_VERSION,
    privacyNoticeAcknowledged: true,
    privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
    uiLocale: locale,
    issuedAt: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded).toString("base64url")}`;
}

function cookieValue(headers: Headers | undefined | null, name: string): string | null {
  const raw = headers?.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function verifyLegalSignupToken(
  headers: Headers | undefined | null,
): LegalSignupAttestation | null {
  const token = cookieValue(headers, LEGAL_SIGNUP_COOKIE);
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, supplied] = parts;
  if (!encoded || !supplied) return null;
  let suppliedBytes: Buffer;
  try {
    suppliedBytes = Buffer.from(supplied, "base64url");
  } catch {
    return null;
  }
  const expected = signature(encoded);
  if (suppliedBytes.length !== expected.length || !timingSafeEqual(suppliedBytes, expected)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (!validSignupAttestation(parsed)) return null;
    if (typeof parsed.issuedAt !== "number" || Date.now() - parsed.issuedAt > 15 * 60_000) {
      return null;
    }
    return parsed as LegalSignupAttestation;
  } catch {
    return null;
  }
}

function requestEvidence(headers: Headers | undefined | null) {
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwarded || headers?.get("x-real-ip") || null,
    userAgent: headers?.get("user-agent")?.slice(0, 1000) || null,
  };
}

export async function recordLegalAcceptances(input: {
  userId: string;
  registrationNumber: string | null | undefined;
  locale: unknown;
  context: LegalContext;
  documents: LegalDocumentType[];
  headers?: Headers | null;
  acceptedAt?: Date;
}): Promise<void> {
  const evidence = requestEvidence(input.headers);
  const acceptedAt = input.acceptedAt ?? new Date();
  const locale = normalizeUiLocale(input.locale);
  if (input.documents.length === 0) return;
  const rows = input.documents.map((documentType) => {
    const version =
      documentType === "eula" ? CURRENT_EULA_VERSION : CURRENT_PRIVACY_NOTICE_VERSION;
    return [
      input.userId,
      input.registrationNumber ?? null,
      documentType,
      version,
      legalDocumentHash(documentType, locale),
      input.context,
      locale,
      acceptedAt,
      evidence.ipAddress,
      evidence.userAgent,
    ];
  });
  const parameters = rows.flat();
  const placeholders = rows.map((_, rowIndex) => {
    const first = rowIndex * 10;
    return `($${first + 1}::uuid, $${first + 2}, $${first + 3}, $${first + 4}, $${first + 5}, $${first + 6}, $${first + 7}, $${first + 8}, $${first + 9}, $${first + 10})`;
  });
  // One statement keeps the EULA and Privacy Notice evidence atomic: a
  // successful signup cannot leave only half of the acceptance pair recorded.
  await query(
    `INSERT INTO legal_acceptances
       (user_id, registration_number, document_type, document_version,
        document_hash, context, locale, accepted_at, ip_address, user_agent)
     VALUES ${placeholders.join(", ")}`,
    parameters,
  );
}

export async function recordUploadEulaAcceptance(input: {
  userId: string;
  registrationNumber: string;
  locale: unknown;
  headers: Headers;
}): Promise<void> {
  const acceptedAt = new Date();
  const locale = normalizeUiLocale(input.locale);
  const evidence = requestEvidence(input.headers);
  // The profile marker and immutable acceptance event commit as a single SQL
  // statement, avoiding a misleading accepted flag if evidence insertion fails.
  await query(
    `WITH accepted_user AS (
       UPDATE "user"
        SET "eulaAccepted" = TRUE,
            "eulaVersion" = $2,
            "eulaAcceptedAt" = $3,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $1::uuid
        RETURNING "id"
     )
     INSERT INTO legal_acceptances
       (user_id, registration_number, document_type, document_version,
        document_hash, context, locale, accepted_at, ip_address, user_agent)
     SELECT "id", $4, 'eula', $2, $5, 'upload', $6, $3, $7, $8
       FROM accepted_user`,
    [
      input.userId,
      CURRENT_EULA_VERSION,
      acceptedAt,
      input.registrationNumber,
      legalDocumentHash("eula", locale),
      locale,
      evidence.ipAddress,
      evidence.userAgent,
    ],
  );
}
