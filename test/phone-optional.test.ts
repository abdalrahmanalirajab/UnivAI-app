/**
 * A phone number is optional, and "not given" has exactly one representation.
 *
 * Forms hand back "" for an untouched field and Google supplies nothing at all.
 * Both mean the same thing, and the column stores it as NULL, so the two must
 * not both reach the database — otherwise `phone IS NULL` stops being the whole
 * question.
 */
import { describe, expect, it } from "vitest";

import { normalizePhone, validatePhone } from "@/lib/validators";

describe("validatePhone", () => {
  it("accepts an absent number", () => {
    expect(validatePhone("")).toBeNull();
    expect(validatePhone("   ")).toBeNull();
  });

  it("still checks a number that was given", () => {
    expect(validatePhone("+201234567890")).toBeNull();
    expect(validatePhone("01234567890")).not.toBeNull();
    expect(validatePhone("+20")).not.toBeNull();
    expect(validatePhone("+20abc123456")).not.toBeNull();
  });
});

describe("normalizePhone", () => {
  it.each([
    ["empty string", ""],
    ["whitespace", "   "],
    ["null", null],
    ["undefined", undefined],
  ])("turns %s into null", (_label, value) => {
    expect(normalizePhone(value)).toBeNull();
  });

  it("keeps a real number, trimmed", () => {
    expect(normalizePhone("+201234567890")).toBe("+201234567890");
    expect(normalizePhone("  +201234567890  ")).toBe("+201234567890");
  });
});
