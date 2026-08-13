import { NextResponse } from "next/server";
import {
  CURRENT_EULA_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  normalizeUiLocale,
} from "@/lib/legal-documents";
import {
  LEGAL_SIGNUP_COOKIE,
  UI_LOCALE_COOKIE,
  createLegalSignupToken,
  validSignupAttestation,
} from "@/lib/legal";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A legal acceptance object is required." }, { status: 400 });
  }
  const values = body as Record<string, unknown>;
  if (!validSignupAttestation(values)) {
    return NextResponse.json(
      {
        error: "Accept the current EULA and acknowledge the current Privacy Notice before continuing.",
        code: "LEGAL_ACCEPTANCE_REQUIRED",
        versions: {
          eula: CURRENT_EULA_VERSION,
          privacyNotice: CURRENT_PRIVACY_NOTICE_VERSION,
        },
      },
      { status: 422 },
    );
  }

  const locale = normalizeUiLocale(values.uiLocale);
  const response = NextResponse.json({ accepted: true, locale });
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(LEGAL_SIGNUP_COOKIE, createLegalSignupToken(locale), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 15 * 60,
  });
  response.cookies.set(UI_LOCALE_COOKIE, locale, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}
