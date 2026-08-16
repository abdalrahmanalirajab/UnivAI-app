import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLectureMaterialAccess: vi.fn(),
  readScript: vi.fn(),
  readSlides: vi.fn(),
  requireLearningAction: vi.fn(),
}));

vi.mock("@/lib/lecture-materials", () => ({
  getLectureMaterialAccess: mocks.getLectureMaterialAccess,
}));

vi.mock("@/lib/lectures", () => ({
  readScript: mocks.readScript,
  readSlides: mocks.readSlides,
}));

vi.mock("@/lib/session", () => ({
  requireLearningAction: mocks.requireLearningAction,
}));

vi.mock("@/app/components/OutputFeedback", () => ({
  default: () => null,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));

import LectureArchivePage from "@/app/lecture/[id]/archive/page";

function functionPropPaths(node: ReactNode, path = "root"): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => functionPropPaths(child, `${path}[${index}]`));
  }
  if (!isValidElement(node)) return [];

  const props = node.props as Record<string, unknown>;
  const paths: string[] = [];
  for (const [name, value] of Object.entries(props)) {
    if (name === "children") {
      Children.forEach(value as ReactNode, (child) => {
        paths.push(...functionPropPaths(child, `${path}.children`));
      });
    } else if (typeof value === "function") {
      paths.push(`${path}.${name}`);
    } else if (isValidElement(value) || Array.isArray(value)) {
      paths.push(...functionPropPaths(value as ReactNode, `${path}.${name}`));
    }
  }
  return paths;
}

describe("lecture archive server/client boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireLearningAction.mockResolvedValue({
      registrationNumber: "S-2026-000001",
    });
    mocks.getLectureMaterialAccess.mockResolvedValue({
      lectureId: "2f7392f0-8038-45dc-92a1-edf78c04b940",
      artifactId: null,
      artifactVersion: null,
      week: 2,
      title: "Reliable archive review",
      startsAt: new Date("2026-08-04T10:00:00.000Z"),
      endsAt: new Date("2026-08-04T11:00:00.000Z"),
      available: true,
      mode: "archive",
      blockedReason: null,
    });
    mocks.readSlides.mockResolvedValue(null);
    mocks.readScript.mockResolvedValue(null);
  });

  it("does not pass Link or any other function as a prop from the Server Component", async () => {
    const tree = await LectureArchivePage({
      params: Promise.resolve({ id: "2f7392f0-8038-45dc-92a1-edf78c04b940" }),
    });

    expect(functionPropPaths(tree)).toEqual([]);
  });
});
