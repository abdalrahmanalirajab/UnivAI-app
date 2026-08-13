import type { Metadata } from "next";
import LegalDocument from "../LegalDocument";
import {
  CURRENT_EULA_VERSION,
  EULA_SECTIONS,
  normalizeUiLocale,
} from "@/lib/legal-documents";
import { cookies } from "next/headers";
import { UI_LOCALE_COOKIE } from "@/lib/legal";

export const metadata: Metadata = { title: "EULA and Content Use Agreement" };

export default async function EulaPage({
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
      eyebrow={locale === "ar" ? "الشؤون القانونية" : "Legal"}
      title={
        locale === "ar"
          ? "اتفاقية ترخيص المستخدم النهائي واستخدام المحتوى"
          : "End User License and Content Use Agreement"
      }
      summary={
        locale === "ar"
          ? "توضح هذه الاتفاقية مسؤوليتك عن الكتب والمواد التي تختار استخدامها على UnivAI."
          : "This agreement explains your responsibility for books and other material you choose to use with UnivAI."
      }
      version={CURRENT_EULA_VERSION}
      sections={EULA_SECTIONS[locale]}
      notice={
        locale === "ar"
          ? "لا تمنحك UnivAI أي حقوق قانونية في المواد التي ترفعها. يجب أن تملك الحقوق أو الإذن أو أساسًا قانونيًا صالحًا لاستخدام كل مادة."
          : "UnivAI does not give you legal rights in material you upload. You must own the rights, have permission, or have another valid legal basis for every use."
      }
    />
  );
}
