import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UI_LOCALE_COOKIE } from "@/lib/legal";
import { normalizeUiLocale } from "@/lib/legal-documents";

function withLocaleCookie(response: NextResponse, locale: "en" | "ar") {
  response.cookies.set(UI_LOCALE_COOKIE, locale, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}

export async function GET() {
  const user = await getSessionUser();
  const storedLocale = (await cookies()).get(UI_LOCALE_COOKIE)?.value;
  const locale = normalizeUiLocale(user?.uiLocale ?? storedLocale);
  return withLocaleCookie(NextResponse.json({ locale }), locale);
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Choose a supported language." }, { status: 400 });
  }
  const rawLocale = (body as Record<string, unknown>).locale;
  if (rawLocale !== "en" && rawLocale !== "ar") {
    return NextResponse.json({ error: "locale must be en or ar." }, { status: 400 });
  }
  const locale = normalizeUiLocale(rawLocale);
  const user = await getSessionUser();
  if (user) {
    await query(
      `UPDATE "user" SET "uiLocale" = $2, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $1::uuid`,
      [user.id, locale],
    );
  }
  return withLocaleCookie(NextResponse.json({ locale, savedToAccount: Boolean(user) }), locale);
}
