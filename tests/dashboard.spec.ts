import path from "node:path";
import { expect, test } from "@playwright/test";
import { gotoDashboard, reseedTestDatabase, fetchVoicemails } from "./helpers";

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

  test("uploads audio, increments inbox KPI, auto-selects new voicemail, and shows details", async ({ page, request }) => {
    await gotoDashboard(page);

    const before = await fetchVoicemails(request);
    const beforeCount = before.length;

    await page.getByPlaceholder("e.g. 021 555 000").fill("021 555 321");
    await page.locator('input[type="file"]').setInputFiles(mockAudioPath);

    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeVisible();
    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeHidden();

    const after = await fetchVoicemails(request);
    expect(after.length).toBe(beforeCount + 1);

    const created = after.find((v) => v.phone === "021 555 321");
    expect(created).toBeTruthy();

    await expect(page.getByRole("heading", { name: "Voicemail details" })).toBeVisible();
    await expect(page.getByText("021 555 321").first()).toBeVisible();
    await expect(page.getByText(/Transcript snapshot/i).first()).toBeVisible();

    const playButton = page.getByRole("button", { name: /Play audio/i });
    await expect(playButton).toBeVisible();
    await expect(playButton).toBeEnabled();

    await expect(page.getByText("First voicemail from this number in the current inbox window.")).toBeVisible();
  });

  test("uploads audio and keeps processing time under 12 seconds", async ({ page, request }) => {
    await gotoDashboard(page);

    const before = await fetchVoicemails(request);
    const beforeCount = before.length;

    await page.getByPlaceholder("e.g. 021 555 000").fill("021 555 321");

    const startTime = Date.now();
    await page.locator('input[type="file"]').setInputFiles(mockAudioPath);

    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeVisible();
    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeHidden();

    const durationMs = Date.now() - startTime;
    expect(durationMs).toBeLessThan(12000);

    const after = await fetchVoicemails(request);
    expect(after.length).toBe(beforeCount + 1);

    const created = after.find((v) => v.phone === "021 555 321");
    expect(created).toBeTruthy();

    await expect(page.getByRole("heading", { name: "Voicemail details" })).toBeVisible();
    await expect(page.getByText(/Transcript snapshot/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Play audio/i })).toBeVisible();
  });

  test("supports keyboard navigation for primary dashboard controls", async ({ page }) => {
    await gotoDashboard(page);

    await expect(page.getByRole("heading", { name: "Morning Voicemail Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Voicemail inbox" })).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByPlaceholder("e.g. 021 555 000")).toBeFocused();

    await page.keyboard.press("Tab");
    // await expect(page.locator("select")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /Record voicemail/i })).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /Upload audio/i })).toBeFocused();

    await expect(page.getByRole("button", { name: /Record voicemail/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Upload audio/i })).toBeVisible();
  });

  test("shows a clear error when Gemini upload fails", async ({ page }) => {
    await page.route("**/api/transcriptions/gemini-upload*", (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unable to transcribe audio right now" }),
      });
    });

    await gotoDashboard(page);

    await page.getByPlaceholder("e.g. 021 555 000").fill("021 555 321");
    await page.locator('input[type="file"]').setInputFiles(mockAudioPath);

    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeVisible();
    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeHidden();

    await expect(page.getByText("Unable to transcribe audio right now")).toBeVisible();
    await expect(page.getByRole("button", { name: /Upload audio/i })).toBeVisible();
    await expect(page.getByPlaceholder("e.g. 021 555 000")).toHaveValue("021 555 321");
  });

  test("shows a clear error when Gemini upload is interrupted by network failure", async ({ page }) => {
    await page.route("**/api/transcriptions/gemini-upload*", (route) => {
      route.abort();
    });

    await gotoDashboard(page);

    await page.getByPlaceholder("e.g. 021 555 000").fill("021 555 321");
    await page.locator('input[type="file"]').setInputFiles(mockAudioPath);

    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeVisible();
    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeHidden();

    await expect(
      page.getByText(/Failed to fetch|Unable to transcribe and save voicemail|Failed to upload and transcribe audio|NetworkError/i),
    ).toBeVisible();

    await expect(page.getByRole("button", { name: /Upload audio/i })).toBeVisible();
    await expect(page.getByPlaceholder("e.g. 021 555 000")).toHaveValue("021 555 321");
  });
});

test.describe("frontend dashboard - details panel", () => {
  test.beforeEach(async ({ request }) => {
    await reseedTestDatabase(request);
  });

  test("selects a voicemail and shows transcript snapshot with audio playback", async ({ page }) => {
    await gotoDashboard(page);

    await page.getByRole("button", { name: /Mark Davis/i }).first().click();

    await expect(page.getByRole("heading", { name: "Voicemail details" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mark Davis" })).toBeVisible();
    await expect(page.getByText(/Transcript snapshot/i).first()).toBeVisible();

    const playButton = page.getByRole("button", { name: /Play audio/i });
    await expect(playButton).toBeVisible();
    // await expect(playButton).toBeEnabled();
  });

  test("show KPI increase after update", async ({ page, request }) => {
    await gotoDashboard(page);

    const before = await fetchVoicemails(request);
    const beforeCount = before.length;

    await page.getByPlaceholder("e.g. 021 555 000").fill("021 555 321");
    await page.locator('input[type="file"]').setInputFiles(mockAudioPath);

    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeVisible();
    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeHidden();

    const after = await fetchVoicemails(request);
    expect(after.length).toBe(beforeCount + 1);
  });

  test("selects a voicemail and shows accurate caller history", async ({ page }) => {
    await gotoDashboard(page);

    await page.getByRole("button", { name: /Mia Carter/i }).first().click();

    await expect(page.getByRole("heading", { name: "Voicemail details" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mia Carter" })).toBeVisible();
    await expect(page.getByText(/Caller history/i).first()).toBeVisible();
    await expect(page.getByText(/First voicemail from this number in the current inbox window\./i)).toBeVisible();

    await page.getByRole("button", { name: /Mark Davis/i }).first().click();

    await expect(page.getByRole("heading", { name: "Voicemail details" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mark Davis" })).toBeVisible();
    await expect(page.getByText(/Caller history/i).first()).toBeVisible();
    await expect(page.getByText(/2 calls from this number\./i)).toBeVisible();
  });
});

test.describe("frontend dashboard - recording", () => {
  test.beforeEach(async ({ request }) => {
    await reseedTestDatabase(request);
  });

  test("records audio via microphone, increments inbox, and shows details", async ({ page, request }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
        },
        configurable: true,
      });

      class FakeMediaRecorder {
        constructor(stream, options) {
          this.mimeType = options?.mimeType;
          this.state = 'inactive';
          this._listeners = {};
        }
        start() { this.state = 'recording'; }
        stop() {
          this.state = 'inactive';
          const blob = new Blob(['fake-audio-bytes'], { type: this.mimeType || 'audio/webm' });
          const event = { data: blob };
          (this._listeners['dataavailable'] || []).forEach((cb) => cb(event));
          (this._listeners['stop'] || []).forEach((cb) => cb());
        }
        addEventListener(name, cb) { this._listeners[name] = this._listeners[name] || []; this._listeners[name].push(cb); }
      }

      window.MediaRecorder = FakeMediaRecorder;
    });

    await gotoDashboard(page);

    const before = await fetchVoicemails(request);
    const beforeCount = before.length;

    await page.getByPlaceholder("e.g. 021 555 000").fill("021 555 321");
    await page.getByRole('button', { name: /Record voicemail/i }).click();
    await page.getByRole('button', { name: /Stop and save/i }).click();

    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeVisible();
    await expect(page.getByText("Transcribing with Gemini and saving to the voicemail dashboard...")).toBeHidden();

    const after = await fetchVoicemails(request);
    expect(after.length).toBe(beforeCount + 1);
    const created = after.find((v) => v.phone === "021 555 321");
    expect(created).toBeTruthy();

    await expect(page.getByText(/Transcript snapshot/i).first()).toBeVisible();
    const playButton = page.getByRole("button", { name: /Play audio/i });
    await expect(playButton).toBeVisible();
    await expect(playButton).toBeEnabled();
  });
});
