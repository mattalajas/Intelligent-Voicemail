import { expect, test } from "@playwright/test";
import { apiBaseUrl, reseedTestDatabase } from "./helpers";

test.describe("backend voicemail API", () => {
  test.beforeEach(async ({ request }) => {
    await reseedTestDatabase(request);
  });

  test("returns grouped voicemail inbox items", async ({ request }) => {
    const response = await request.get(`${apiBaseUrl}/api/voicemails`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(Array.isArray(data.items)).toBeTruthy();
    expect(data.items.length).toBeGreaterThan(0);

    const markDavis = data.items.find((item: { patient: string }) => item.patient === "Mark Davis");
    expect(markDavis).toBeTruthy();
    expect(markDavis).toMatchObject({
      patient: "Mark Davis",
      phone: "021 555 018",
    });
    expect(Array.isArray(markDavis.history)).toBeTruthy();
  });

  test("requires a note before moving a voicemail to in progress", async ({ request }) => {
    const response = await request.patch(`${apiBaseUrl}/api/voicemails/${encodeURIComponent("021 555 018")}`, {
      data: {
        status: "In Progress",
      },
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Progress note is required before moving a voicemail to in progress",
    });
  });

  test("archives a voicemail entry through the update endpoint", async ({ request }) => {
    const response = await request.patch(`${apiBaseUrl}/api/voicemails/${encodeURIComponent("021 555 018")}`, {
      data: {
        archive: true,
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.item).toMatchObject({
      id: "021 555 018",
      isArchived: true,
    });
  });
});
