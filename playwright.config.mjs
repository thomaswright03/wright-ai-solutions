import { defineConfig, devices } from '@playwright/test';

// PORT lets two checkouts run the suite side by side (tests/serve.mjs reads it too).
const port = Number(process.env.PORT || 4173);

export default defineConfig({
  testDir: 'tests',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices['Desktop Chrome'],
    // Lets a sandbox with a preinstalled Chromium run the suite without a download.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning tests/serve.mjs',
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
});
