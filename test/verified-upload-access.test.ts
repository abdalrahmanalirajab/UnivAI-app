import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  formData: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
  runPython: vi.fn(),
  spawnGeneration: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  addDocument: vi.fn(),
  claimDocumentUpload: vi.fn(),
  getDocument: vi.fn(),
  getOrCreateCollection: vi.fn(),
  getOwnedCollection: vi.fn(),
  updateDocumentStatus: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireUserApi: vi.fn(),
  requireVerifiedUserApi: mocks.gate,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query, queryOne: mocks.queryOne }));
vi.mock("@/lib/clock", () => ({ now: vi.fn() }));
vi.mock("@/lib/python", () => ({
  REPO_ROOT: "/tmp/univai-verification-test",
  runPython: mocks.runPython,
  parseJsonLine: vi.fn(),
}));
vi.mock("@/lib/generation", () => ({
  spawnGeneration: mocks.spawnGeneration,
}));
vi.mock("@/lib/collections", () => ({
  addDocument: mocks.addDocument,
  claimDocumentUpload: mocks.claimDocumentUpload,
  documentStorageKey: vi.fn(),
  getDocument: mocks.getDocument,
  getOrCreateCollection: mocks.getOrCreateCollection,
  getOwnedCollection: mocks.getOwnedCollection,
  updateDocumentStatus: mocks.updateDocumentStatus,
}));
vi.mock("@/lib/env", () => ({ env: { RAG_MCP_URL: "http://rag.test" } }));
vi.mock("@/lib/runtime", () => ({ isStandalone: () => false }));
vi.mock("fs", () => {
  const promises = {
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
    readFile: mocks.readFile,
  };
  return { promises, default: { promises } };
});

import { POST } from "@/app/api/upload/route";

function request(): NextRequest {
  return { formData: mocks.formData } as unknown as NextRequest;
}

function expectNoUploadSideEffects() {
  for (const effect of [
    mocks.formData,
    mocks.query,
    mocks.queryOne,
    mocks.runPython,
    mocks.spawnGeneration,
    mocks.mkdir,
    mocks.writeFile,
    mocks.readFile,
    mocks.addDocument,
    mocks.claimDocumentUpload,
    mocks.getDocument,
    mocks.getOrCreateCollection,
    mocks.getOwnedCollection,
    mocks.updateDocumentStatus,
  ]) {
    expect(effect).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/upload verified-session boundary", () => {
  it("keeps anonymous uploads at 401 without parsing or side effects", async () => {
    mocks.gate.mockResolvedValue(
      Response.json({ error: "Not authenticated." }, { status: 401 }),
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    expectNoUploadSideEffects();
  });

  it("rejects unverified uploads with the stable code and zero side effects", async () => {
    mocks.gate.mockResolvedValue(
      Response.json(
        {
          error: "Verify your email to use this feature.",
          code: "EMAIL_VERIFICATION_REQUIRED",
        },
        { status: 403 },
      ),
    );

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Verify your email to use this feature.",
      code: "EMAIL_VERIFICATION_REQUIRED",
    });
    expectNoUploadSideEffects();
  });

  it("lets a verified learner continue into normal upload validation", async () => {
    mocks.gate.mockResolvedValue({
      registrationNumber: "S-2026-000022",
      emailVerified: true,
    });
    mocks.formData.mockResolvedValue({ get: () => null });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No file uploaded." });
    expect(mocks.formData).toHaveBeenCalledOnce();
  });
});
