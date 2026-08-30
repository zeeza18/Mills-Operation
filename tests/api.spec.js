/**
 * Direct backend tests, no browser involved. Hits app/api.py's FastAPI
 * routes straight (via Playwright's request fixture) to check the actual
 * contract the frontend relies on, independent of anything the UI does with
 * the response. playwright.config.js already starts uvicorn before this
 * runs, so no separate setup is needed here.
 */

const { test, expect } = require('@playwright/test');

const API = 'http://localhost:8000';

test.describe('Backend API, held out test data', () => {
  test('GET /api/meta returns the real evaluated model numbers', async ({ request }) => {
    const res = await request.get(`${API}/api/meta`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.failures_detected).toBe(body.failures_in_test_window);
    expect(typeof body.alert_threshold).toBe('number');
    expect(body.baseline_stats).toBeTruthy();
  });

  test('GET /api/fleet returns all 6 stands with sensor readings', async ({ request }) => {
    const res = await request.get(`${API}/api/fleet`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveLength(6);
    for (const stand of body) {
      expect(stand.standId).toMatch(/^STAND-0\d$/);
      expect(typeof stand.vibration_rms_mm_s).toBe('number');
      expect(typeof stand.isAlerting).toBe('boolean');
    }
  });

  test('GET /api/stands/{id}/timeseries returns downsampled points and alert bands', async ({ request }) => {
    const res = await request.get(`${API}/api/stands/STAND-01/timeseries`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.points.length).toBeGreaterThan(0);
    // downsample() targets 400 points via an integer stride, so the actual
    // count can land a little above the target, not a hard cap
    expect(body.points.length).toBeLessThanOrEqual(450);
    expect(Array.isArray(body.alertBands)).toBe(true);
  });

  test('GET /api/stands/{id}/summary returns ground truth failures for the test window', async ({ request }) => {
    const res = await request.get(`${API}/api/stands/STAND-01/summary`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.standId).toBe('STAND-01');
    expect(Array.isArray(body.groundTruthFailures)).toBe(true);
  });

  test('an unknown stand id returns 404, not a 500 or a silent empty result', async ({ request }) => {
    const res = await request.get(`${API}/api/stands/STAND-99/timeseries`);
    expect(res.status()).toBe(404);
  });
});

test.describe('Backend API, live data', () => {
  test('GET /api/live/fleet reflects the running live feed, not the static test set', async ({ request }) => {
    const res = await request.get(`${API}/api/live/fleet`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(6);
  });

  test('GET /api/live/data-bounds returns a real earliest selectable date', async ({ request }) => {
    const res = await request.get(`${API}/api/live/data-bounds`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.minDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('GET /api/live/stands/{id}/timeseries with no range returns the live buffer', async ({ request }) => {
    const res = await request.get(`${API}/api/live/stands/STAND-01/timeseries`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.points)).toBe(true);
  });

  test('GET /api/live/stands/{id}/timeseries with a range reaching into history pulls both sets', async ({ request }) => {
    // app/historical.py's get_scored() scores the full 45 day, 388K row
    // dataset through LocalOutlierFactor on its first call ever (its own
    // docstring says "well over a minute") and caches the result to disk
    // after that. CI always starts from a cold cache, data/synthetic/ is
    // gitignored, so this specific request is genuinely slow exactly once,
    // not a bug: confirmed locally at 81s cold versus milliseconds warm.
    test.setTimeout(180_000);
    const bounds = await (await request.get(`${API}/api/live/data-bounds`)).json();
    const res = await request.get(
      `${API}/api/live/stands/STAND-01/timeseries?start=${bounds.minDate}T00:00:00`,
      { timeout: 150_000 },
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.points.length).toBeGreaterThan(0);
  });

  test('GET /api/live/stands/{id}/summary has no ground truth list, live data has no answer key', async ({ request }) => {
    const res = await request.get(`${API}/api/live/stands/STAND-01/summary`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.groundTruthFailures).toEqual([]);
  });

  test('POST /api/live/ask answers a free text fleet question grounded in real data', async ({ request }) => {
    const res = await request.post(`${API}/api/live/ask`, {
      data: { messages: [{ role: 'user', content: 'Which stand has the highest bearing temperature?' }] },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.answer).toMatch(/STAND-/);
    expect(['live', 'fallback']).toContain(body.source);
  });

  test('POST /api/stands/{id}/explain and /api/live/stands/{id}/explain both return grounded text', async ({ request }) => {
    const held = await request.post(`${API}/api/stands/STAND-01/explain`);
    expect(held.ok()).toBeTruthy();
    const heldBody = await held.json();
    expect(heldBody.explanation.length).toBeGreaterThan(20);

    const live = await request.post(`${API}/api/live/stands/STAND-01/explain`);
    expect(live.ok()).toBeTruthy();
    const liveBody = await live.json();
    expect(liveBody.explanation.length).toBeGreaterThan(20);
  });
});

test.describe('Backend API, degradation simulator', () => {
  test.afterEach(async ({ request }) => {
    // the simulator's buffer and active run are module level state on the
    // backend, shared across every test in the whole suite, so leave it
    // clean for whatever runs next regardless of how this test finished
    await request.post(`${API}/api/simulator/reset`);
  });

  test('GET /api/simulator/state returns baseline values and the real alert threshold', async ({ request }) => {
    await request.post(`${API}/api/simulator/reset`);
    const res = await request.get(`${API}/api/simulator/state`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.values.vibration_rms_mm_s).toBeGreaterThan(0);
    expect(typeof body.alertThreshold).toBe('number');
  });

  test('POST /api/simulator/correlate moves every signal toward the same failure point', async ({ request }) => {
    const res = await request.post(`${API}/api/simulator/correlate`, {
      data: { signal: 'vibration_rms_mm_s', value: 9.5 },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.vibration_rms_mm_s).toBeCloseTo(9.5, 1);
    expect(body.bearing_temp_c).toBeGreaterThan(80); // baseline ~58, failure target 92
  });

  test('correlate rejects a signal name that is not one of the five real signals', async ({ request }) => {
    const res = await request.post(`${API}/api/simulator/correlate`, {
      data: { signal: 'not_a_real_signal', value: 1 },
    });
    expect(res.status()).toBe(400);
  });

  test('a full start, tick, tick cycle scores real minutes and reaches the failure target', async ({ request }) => {
    const state = await (await request.get(`${API}/api/simulator/state`)).json();
    await request.post(`${API}/api/simulator/degrade/start`, {
      data: { values: state.values, durationMinutes: 3 },
    });

    let last = null;
    for (let i = 0; i < 3; i++) {
      const res = await request.post(`${API}/api/simulator/degrade/tick`);
      expect(res.ok()).toBeTruthy();
      last = await res.json();
    }

    expect(last.done).toBe(true);
    expect(last.tick).toBe(3);
    expect(last.vibration_rms_mm_s).toBeGreaterThan(7); // converges on the 9.5 target
  });

  test('ticking with no active run returns 400, not a crash', async ({ request }) => {
    await request.post(`${API}/api/simulator/reset`);
    const res = await request.post(`${API}/api/simulator/degrade/tick`);
    expect(res.status()).toBe(400);
  });

  test('reset clears an in progress run back to normal baseline values', async ({ request }) => {
    const state = await (await request.get(`${API}/api/simulator/state`)).json();
    await request.post(`${API}/api/simulator/degrade/start`, {
      data: { values: state.values, durationMinutes: 5 },
    });
    await request.post(`${API}/api/simulator/degrade/tick`);

    const res = await request.post(`${API}/api/simulator/reset`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.values.vibration_rms_mm_s).toBeLessThan(5); // back near the ~2.2 baseline

    const tickAfterReset = await request.post(`${API}/api/simulator/degrade/tick`);
    expect(tickAfterReset.status()).toBe(400); // reset also clears the active run itself
  });
});
