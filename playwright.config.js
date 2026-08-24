const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  // Streamlit's cold script run -- loading ~78K rows, computing fleet status for 6 stands --
  // legitimately takes longer than Playwright's 5s assertion default. Bumped, not removed.
  expect: { timeout: 15_000 },
  fullyParallel: false, // one Streamlit dev server, don't hammer it with parallel sessions
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8501',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'streamlit run app/dashboard.py --server.headless true --server.port 8501',
    url: 'http://localhost:8501',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
