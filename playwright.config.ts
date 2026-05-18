import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  workers: 4,
  fullyParallel: true,
  expect: {
    timeout: 5000
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: process.env.HEADLESS !== 'false',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        headless: process.env.HEADLESS !== 'false',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        headless: process.env.HEADLESS !== 'false',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
      },
    },
  ],
  reporter: [
    ['json', { outputFile: 'reports/results.json' }],
    ['list']
  ],
  use: {
    baseURL: 'file://' + process.cwd(),
    trace: 'on-first-retry',
    actionTimeout: 0,
    navigationTimeout: 30000,
  },
  outputDir: 'reports/test-results/',
});
