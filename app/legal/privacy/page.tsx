import type { Metadata } from "next";
import LegalDocument from "../LegalDocument";
import {
  CURRENT_PRIVACY_NOTICE_VERSION,
  PRIVACY_SECTIONS,
  normalizeUiLocale,
} from "@/lib/legal-documents";
import { cookies } from "next/headers";
import { UI_LOCALE_COOKIE } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Notice" };

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const requested = (await searchParams).lang;
  const locale = normalizeUiLocale(
    requested ?? (await cookies()).get(UI_LOCALE_COOKIE)?.value,
  );
  return (
    <LegalDocument
      locale={locale}
      eyebrow={locale === "ar" ? "الخصوصية" : "Privacy"}
      title={locale === "ar" ? "إشعار الخصوصية" : "Privacy Notice"}
      summary={
        locale === "ar"
          ? "يوضح هذا الإشعار البيانات التي تعالجها UnivAI وخياراتك وحقوقك المحتملة."
          : "This notice describes the data UnivAI processes and the choices and rights that may apply to you."
      }
      version={CURRENT_PRIVACY_NOTICE_VERSION}
      sections={PRIVACY_SECTIONS[locale]}
      notice={
        locale === "ar"
          ? "يمكنك تنزيل بياناتك أو تسجيل تفضيلات الخصوصية أو تقديم طلب من إعدادات الحساب. وقد يتطلب استكمال بعض الطلبات التحقق من الهوية."
          : "You can download your data, record privacy preferences, or submit a request from account settings. Some requests may require identity verification before completion."
      }
    />
  );
}
