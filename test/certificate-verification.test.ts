import { describe, expect, it } from "vitest";

import { isCertificateId } from "@/lib/certificate-verification";

describe("public certificate verification IDs", () => {
  it.each([
    "cert_0123456789abcdef01234567",
    "cert_demo_990001",
  ])("accepts issued ID %s", (id) => {
    expect(isCertificateId(id)).toBe(true);
  });

  it.each(["", "cert_", "../certificate", "student-990001", "cert_<script>"])(
    "rejects invalid ID %s",
    (id) => {
      expect(isCertificateId(id)).toBe(false);
    },
  );
});
