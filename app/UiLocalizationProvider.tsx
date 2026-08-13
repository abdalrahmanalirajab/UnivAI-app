"use client";

import { useEffect } from "react";
import { translateUiText } from "@/lib/ui-translations";

const ATTRIBUTES = [
  "alt",
  "aria-description",
  "aria-label",
  "aria-valuetext",
  "placeholder",
  "title",
] as const;

function isProtectedContent(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(
    element?.closest("[data-generated-content='true'], [data-no-ui-translate='true']"),
  );
}

function translateTextNode(node: Text, locale: "en" | "ar") {
  if (isProtectedContent(node)) return;
  const original = node.nodeValue ?? "";
  const trimmed = original.trim();
  if (!trimmed) return;
  const translated = translateUiText(trimmed, locale);
  if (translated === trimmed) return;
  const start = original.slice(0, original.indexOf(trimmed));
  const end = original.slice(original.indexOf(trimmed) + trimmed.length);
  node.nodeValue = `${start}${translated}${end}`;
}

function translateElement(element: Element, locale: "en" | "ar") {
  if (isProtectedContent(element)) return;
  for (const attribute of ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const translated = translateUiText(current, locale);
    if (translated !== current) element.setAttribute(attribute, translated);
  }
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) translateTextNode(child as Text, locale);
  }
}

function translateTree(root: ParentNode, locale: "en" | "ar") {
  if (root instanceof Element) translateElement(root, locale);
  root.querySelectorAll?.("*").forEach((element) => translateElement(element, locale));
}

/**
 * Localizes legacy hard-coded UI shell copy while the app moves toward keyed
 * catalogs route by route. Exact catalog matches ensure generated English
 * content is never machine-translated or changed.
 */
export default function UiLocalizationProvider({
  locale,
  children,
}: {
  locale: "en" | "ar";
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (locale !== "ar") return;
    translateTree(document.body, locale);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData" && record.target instanceof Text) {
          translateTextNode(record.target, locale);
          continue;
        }
        if (record.type === "attributes" && record.target instanceof Element) {
          translateElement(record.target, locale);
          continue;
        }
        for (const added of Array.from(record.addedNodes)) {
          if (added instanceof Element) translateTree(added, locale);
          else if (added instanceof Text) translateTextNode(added, locale);
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRIBUTES],
    });
    return () => observer.disconnect();
  }, [locale]);

  return children;
}
