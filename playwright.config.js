const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  // The copilot test makes a real call to the Anthropic API, and local dev
  // machines under load add real variance on top of that. One retry absorbs
  // genuine environmental flakiness without masking an actual regression,
  // since a real bug fails consistently, not once out of several runs.
  retries: 2,
  reporter: [['list'], ['html', { open: 'never' }], ['./tests/pdf-reporter.js']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'uvicorn app.api:app --port 8000',
      url: 'http://localhost:8000/api/meta',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Testing the production build, not the dev server: Vite's dev server
      // cold-bundles heavy deps like recharts on first load, which took long
      // enough to blow past the test timeouts. A built + previewed app is
      // faster to serve and closer to what actually ships anyway.
      command: 'npm run build && npm run preview -- --port 5173 --strictPort',
      cwd: 'web',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
