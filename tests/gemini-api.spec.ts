import path from "node:path";
import { expect, test } from "@playwright/test";
import { apiBaseUrl, reseedTestDatabase } from "./helpers";

const mockAudioPath = path.resolve("tests/fixtures/mock-audio.wav");

test.describe("Gemini analysis API", () => {
  test.beforeEach(async ({ request }) => {
    await reseedTestDatabase(request);
  });

  test("analyzes an uploaded voicemail and persists the routed inbox item", async ({ request }) => {
    const response = await request.post(
      `${apiBaseUrl}/api/transcriptions/gemini-upload?callerPhone=${encodeURIComponent("211 742 278")}&clinicId=1&displayName=mock-audio.wav`,
      {
        headers: {
          "Content-Type": "audio/wav",
          "X-File-Name": "mock-audio.wav",
        },
        data: Buffer.from("mock audio bytes"),
      },
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data.transcription).toMatchObject({
      transcript: expect.stringContaining("Nick Alajas"),
      summary: expect.stringContaining("same-day appointment"),
      reasonForCall: expect.stringContaining("same-day appointment"),
      recommendedNextSteps: "Book same-day review",
    });
    expect(data.item).toMatchObject({
      id: "211 742 278",
      patient: "Nick Alajas",
      queue: "Same-Day Appointments",
    });
  });

  test("retranscribes a saved voicemail recording", async ({ request }) => {
    const uploadResponse = await request.post(
      `${apiBaseUrl}/api/transcriptions/gemini-upload?callerPhone=${encodeURIComponent("021 174 227")}&clinicId=1&displayName=mock-audio.wav`,
      {
        headers: {
          "Content-Type": "audio/wav",
          "X-File-Name": "mock-audio.wav",
        },
        data: Buffer.from("mock audio bytes"),
      },
    );
    expect(uploadResponse.ok()).toBeTruthy();
    const uploaded = await uploadResponse.json();

    const retranscribeResponse = await request.post(
      `${apiBaseUrl}/api/voicemails/${encodeURIComponent(uploaded.voicemailId)}/retranscribe`,
      {
        data: {},
      },
    );

    expect(retranscribeResponse.ok()).toBeTruthy();
    const retranscribed = await retranscribeResponse.json();
    expect(retranscribed.transcription.transcript).toContain("Nick Alajas");
    expect(retranscribed.item).toMatchObject({
      id: "021 174 227",
      queue: "Same-Day Appointments",
    });
  });

  test("returns structured analysis for a file-path Gemini call", async ({ request }) => {
    const response = await request.post(`${apiBaseUrl}/api/transcriptions/gemini`, {
      data: {
        audioPath: mockAudioPath,
        clinicId: 1,
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.item).toMatchObject({
      transcript: expect.stringContaining("Nick Alajas"),
      summary: expect.stringContaining("same-day appointment"),
      recommendedNextSteps: "Book same-day review",
    });
    expect(data.item.intents[0]).toMatchObject({
      label: "Symptom concern",
    });
  });
});
