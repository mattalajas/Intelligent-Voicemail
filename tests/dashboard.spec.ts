import path from "node:path";
import { expect, test } from "@playwright/test";
import { gotoDashboard, reseedTestDatabase } from "./helpers";

const mockAudioPath = path.resolve("tests/fixtures/mock-audio.wav");

test.describe("frontend dashboard", () => {
  test.beforeEach(async ({ request }) => {
    await reseedTestDatabase(request);
  });

  test("loads the dashboard and shows voicemail details for a selected caller", async ({ page }) => {
    await gotoDashboard(page);

    await expect(page.getByText("Structured voicemail tasks")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Voicemail details" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mark Davis" })).toBeVisible();
    await expect(page.getByText(/Primary intent: Symptom concern/).first()).toBeVisible();
  });

  test("filters the inbox and archives a selected voicemail entry", async ({ page }) => {
    await gotoDashboard(page);

    await page.getByPlaceholder("Search patient, queue, location, or reason").fill("Mark Davis");
    await expect(page.getByRole("heading", { name: "Mark Davis" })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /Archive/ }).click();

    await expect(page.getByText("No items match the current filters.")).toBeVisible();
  });

  test("uploads audio and shows the new voicemail in the dashboard", async ({ page }) => {
    await gotoDashboard(page);

    await page.getByPlaceholder("e.g. 021 555 000").fill("211 742 278");
    await page.locator('input[type="file"]').setInputFiles(mockAudioPath);

    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeVisible();
    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeHidden();

    await expect(page.getByRole("heading", { name: "Nick Alajas" })).toBeVisible();
    await expect(page.getByText("211 742 278").first()).toBeVisible();
    await expect(page.getByText(/Queue reason: Same-Day Appointments/)).toBeVisible();
  });
});
