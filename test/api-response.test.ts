import { describe, expect, it } from "vitest";
import { readJsonApiResponse } from "@/lib/api-response";

describe("readJsonApiResponse", () => {
  it("returns a valid JSON response", async () => {
    const response = Response.json({ token: "signed" });
    await expect(readJsonApiResponse(response, "Try again.")).resolves.toEqual({ token: "signed" });
  });

  it("hides an HTML framework error page", async () => {
    const response = new Response("<!DOCTYPE html><title>Internal Server Error</title>", {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    await expect(readJsonApiResponse(response, "The lecture service is restarting. Try again."))
      .rejects.toThrow("The lecture service is restarting. Try again.");
  });

  it("hides malformed JSON", async () => {
    const response = new Response("{", {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
    await expect(readJsonApiResponse(response, "Try again.")).rejects.toThrow("Try again.");
  });
});
