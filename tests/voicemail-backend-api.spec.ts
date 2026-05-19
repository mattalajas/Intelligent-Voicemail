// spec: specs/manual-tests/voicemail-backend-api-report.md
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Voicemail Backend API Manual Report', () => {
  test('Backend API consolidation and routing verification', async ({ page, request }) => {
    // 1. Navigate to http://localhost:5173/ and load dashboard
    await page.goto('http://localhost:5173/');

    // 2. Capture network requests: wait for /api/voicemails
    const voicemailsResp = await page.waitForResponse(r => r.url().includes('/api/voicemails') && r.request().method() === 'GET');
    expect(voicemailsResp.status(), 'Expected /api/voicemails to return 200').toBe(200);
    const voicemails = await voicemailsResp.json();
    expect(voicemails, 'Voicemails response should not be null').toBeTruthy();
    expect(Array.isArray(voicemails.items), 'Voicemails items should be an array').toBeTruthy();
    expect(voicemails.items.length, 'Voicemails items should not be empty').toBeGreaterThan(0);

    // 3. Inspect /api/voicemails response body (sample fields)
    const first = voicemails.items[0];
    expect(first, 'First voicemail item should exist').toBeTruthy();
    expect(first).toHaveProperty('patient');
    expect(first).toHaveProperty('patientDateOfBirth');
    expect(first).toHaveProperty('patientClinic');
    expect(first).toHaveProperty('primaryGp');
    expect(Array.isArray(first.intents), 'Intents should be an array').toBeTruthy();
    expect(first).toHaveProperty('primaryIntentScore');
    expect(first).toHaveProperty('intentConfidence');
    expect(first).toHaveProperty('urgency');
    expect(Array.isArray(first.matchedUrgencyKeywords), 'Matched urgency keywords should be an array').toBeTruthy();
    expect(first).toHaveProperty('aiWorkflow');
    expect(Array.isArray(first.history), 'History should be an array').toBeTruthy();

    // 4. Open a voicemail detail (click the Mark Davis heading)
    const headingLocator = page.locator('role=heading[name="Mark Davis"]');
    await expect(headingLocator, 'Heading for Mark Davis should be visible').toBeVisible();
    await headingLocator.click();

    // 5. Verify detail view contains transcript/summary/next step from the fetched data
    await expect(page.getByText('VOICEMAIL SUMMARY', { exact: false }), 'Voicemail summary should be visible').toBeVisible();
    if (first.transcript && first.transcript.length) {
      const snippet = first.transcript.substring(0, 30);
      await expect(page.getByText(snippet, { exact: false }), `Transcript snippet "${snippet}" should be visible`).toBeVisible();
    }
    if (first.summary && first.summary.length) {
      const summarySnippet = first.summary.substring(0, 30);
      await expect(page.getByText(summarySnippet, { exact: false }), `Summary snippet "${summarySnippet}" should be visible`).toBeVisible();
    }

    await page.goto('http://localhost:5173/');
    // 6. Inspect /api/queues response body
    const queuesResp = await page.waitForResponse(r => r.url().includes('/api/queues') && r.request().method() === 'GET');
    expect(queuesResp.status(), 'Expected /api/queues to return 200').toBe(200);
    const queues = await queuesResp.json();
    expect(Array.isArray(queues.items), 'Queues items should be an array').toBeTruthy();
    expect(queues.items.length, 'Queues items should not be empty').toBeGreaterThan(0);
    expect(queues.items[0]).toHaveProperty('id');
    expect(queues.items[0]).toHaveProperty('name');
    expect(queues.items[0]).toHaveProperty('defaultOwnerLabel');

    // 7. Edge cases: missing audioUrl and missing transcript
    const hasNullAudio = voicemails.items.some(i => i.audioUrl === null);
    const hasMissingTranscript = voicemails.items.some(i => !i.transcript || i.transcript.length === 0);
    expect(hasNullAudio, 'Some voicemails should have null audioUrl').toBeTruthy();
    expect(hasMissingTranscript, 'Some voicemails should have missing transcript').toBeTruthy();

    // 8. Check favicon returns 404 (non-blocking)
    const fav = await request.get('http://localhost:5173/favicon.ico');
    expect(fav.status(), 'Favicon should return 404').toBe(404);
  });
});
