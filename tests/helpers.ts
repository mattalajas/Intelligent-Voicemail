import { expect, type APIRequestContext, type Page } from "@playwright/test";

const apiBaseUrl = "http://127.0.0.1:3001";

export async function reseedTestDatabase(request: APIRequestContext) {
  const response = await request.post(`${apiBaseUrl}/api/test/reseed`);
  expect(response.ok()).toBeTruthy();
}

export async function fetchVoicemails(request: APIRequestContext) {
  const response = await request.get(`${apiBaseUrl}/api/voicemails`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export async function gotoDashboard(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Morning Voicemail Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Voicemail inbox" })).toBeVisible();
}

export { apiBaseUrl };
