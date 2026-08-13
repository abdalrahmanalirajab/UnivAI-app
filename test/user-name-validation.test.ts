import { describe, expect, it } from "vitest";

import {
  hasOnlyNameLetters,
  normalizeName,
  validateName,
} from "@/lib/validators";

describe("Unicode account names", () => {
  it.each([
    "Mohamed Hany",
    "محمد هاني",
    "李 明",
    "अनन्या शर्मा",
    "Jose\u0301 Alvarez",
    "ＭＯＨＡＭＥＤ",
  ])("accepts alphabetic names from multiple scripts: %s", (name) => {
    expect(hasOnlyNameLetters(name)).toBe(true);
    expect(validateName(name)).toBeNull();
  });

  it.each([
    "Learner2",
    "007",
    "Anne-Marie",
    "O'Connor",
    "Student_One",
    "Name!",
    "محمد١",
    "Sara🙂",
    "Ⓐ",
    "A\uFE0F",
    "A\u20E3",
  ])("rejects numbers, punctuation, symbols and emoji: %s", (name) => {
    expect(hasOnlyNameLetters(name)).toBe(false);
    expect(validateName(name)).toMatch(/letters from any language/i);
  });

  it("stores trimmed NFC text with one ordinary space between words", () => {
    expect(normalizeName("  Jose\u0301\tAlvarez  ")).toBe("José Alvarez");
  });
});
