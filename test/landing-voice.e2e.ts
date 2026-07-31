import { expect, test } from "@playwright/test";

test("premade answer follows play, pause, seek, rewind, and replay", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const downloads: string[] = [];
  const audioRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/audio/")) {
      audioRequests.push(request.url());
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Ask the question" }).click();

  const player = page.locator(".synced-voice-player");
  await expect(player).toBeVisible();
  await expect(
    player.getByText(
      "Sure, the quadratic equation is based on finding the values that make a second-degree polynomial equal to zero.",
    ),
  ).toBeVisible();

  await player
    .getByRole("button", { name: "Play spoken answer", exact: true })
    .click();
  await expect(player.getByText("Speaking")).toBeVisible();
  await expect(player.locator(".synced-word-active")).toHaveCount(1);

  await page.waitForTimeout(750);
  await player
    .getByRole("button", { name: "Pause spoken answer", exact: true })
    .click();
  const pausedWord = await player.locator(".synced-word-active").textContent();
  const slider = player.getByRole("slider", { name: "Spoken answer position" });
  const pausedValue = Number(await slider.getAttribute("aria-valuenow"));

  await page.waitForTimeout(400);
  expect(await player.locator(".synced-word-active").textContent()).toBe(
    pausedWord,
  );
  expect(Number(await slider.getAttribute("aria-valuenow"))).toBeCloseTo(
    pausedValue,
    1,
  );

  await slider.press("End");
  const endValue = Number(await slider.getAttribute("aria-valuenow"));
  expect(endValue).toBeGreaterThan(6);

  await player
    .getByRole("button", { name: "Rewind spoken answer 5 seconds" })
    .click();
  const rewindValue = Number(await slider.getAttribute("aria-valuenow"));
  expect(rewindValue).toBeLessThan(
    endValue - 4.8,
  );

  await player
    .getByRole("button", { name: "Forward spoken answer 5 seconds" })
    .click();
  expect(Number(await slider.getAttribute("aria-valuenow"))).toBeGreaterThan(
    rewindValue + 4.8,
  );

  await player
    .getByRole("button", { name: "Replay spoken answer from the beginning" })
    .click();
  await expect(player.getByText("Speaking")).toBeVisible();
  await expect(player.locator(".synced-word-active")).toContainText("Sure,");

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(downloads).toEqual([]);
  expect(audioRequests).toEqual([]);
});

test("premade answer controls stay inside a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ask the question" }).click();
  await expect(page.locator(".synced-voice-player")).toBeVisible();

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);
});
