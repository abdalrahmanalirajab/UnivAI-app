import { expect, test } from "@playwright/test";

test("learner inspects a source, sends feedback, and retries on mobile by keyboard", async ({
  page,
}) => {
  let feedbackBody: Record<string, unknown> | null = null;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/feedback", async (route) => {
    feedbackBody = JSON.parse((await route.request().postData()) ?? "{}");
    await route.fulfill({ status: 201, json: { feedback: { id: 10, ...feedbackBody } } });
  });
  await page.route("**/api/outputs/1/retry", async (route) => {
    await route.fulfill({
      status: 201,
      json: {
        output: {
          id: 2,
          source_qa_id: 1,
          output_version: "2",
          trace_id: "standalone-qa-1-v2",
          book_id: 4200,
          status: "generating",
          citations: [
            {
              documentId: 4200,
              bookTitle: "Project-authored Standalone Course",
              pages: [{ page: 2 }],
              excerpt: "Tenant filtering keeps each learner's records separate.",
            },
          ],
          created_at: "2026-08-02T00:00:00.000Z",
        },
      },
    });
  });

  await page.goto("/lecture/4211");
  await expect(page.getByText("Standalone lecture simulation", { exact: false })).toBeVisible();
  await expect(page.getByText("lecturing", { exact: true })).toBeVisible();

  const raiseHand = page.getByRole("button", { name: "Raise hand" });
  await raiseHand.focus();
  await raiseHand.press("Enter");
  const question = page.getByLabel("Scripted question");
  await expect(question).toBeVisible();
  await question.fill("What protects each learner's material?");
  const finish = page.getByRole("button", { name: "Finish speaking" });
  await finish.focus();
  await finish.press("Enter");
  const send = page.getByRole("button", { name: "Send question" });
  await send.focus();
  await send.press("Enter");

  await expect(page.getByText(/Tenant filtering keeps each learner's material separate/)).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();

  const citation = page.getByRole("button", { name: "Open source p. 2" });
  await citation.focus();
  await citation.press("Enter");
  const source = page.getByRole("dialog", { name: "Source" }).last();
  await expect(source.getByText("Project-authored Standalone Course")).toBeVisible();
  await expect(source.getByText("p. 2")).toBeVisible();
  await expect(
    source.getByText("Tenant filtering keeps each learner's records separate."),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  const thumbsUp = page.getByRole("button", { name: "Thumbs up" });
  await thumbsUp.focus();
  await thumbsUp.press("Enter");
  const sendFeedback = page.getByRole("button", { name: "Send feedback" });
  await sendFeedback.focus();
  await sendFeedback.press("Enter");
  await expect(page.getByText("Thanks — feedback sent.")).toBeVisible();
  expect(feedbackBody).toMatchObject({
    output_id: 1,
    output_version: "1",
    trace_id: "standalone-qa-1-v1",
    rating: "up",
  });

  const retry = page.getByRole("button", { name: "Retry" });
  await retry.focus();
  await retry.press("Enter");
  await expect(page.getByText("Retry started — the course is being regenerated.")).toBeVisible();
  await expect(page.getByText("Generating", { exact: true })).toBeVisible();

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);
});
