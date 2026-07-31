import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("App repository", () => {
  it.each([
    "app/layout.tsx",
    "app/upload/page.tsx",
    "app/dashboard/page.tsx",
    "app/api/upload/route.ts",
    "lib/db.ts",
  ])("contains %s", async (relativePath) => {
    await expect(access(path.join(root, relativePath))).resolves.toBeUndefined();
  });
});
