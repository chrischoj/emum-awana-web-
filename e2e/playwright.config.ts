import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // 테스트 간 DB 간섭 방지, 내부에서 멀티 컨텍스트로 동시성 시뮬레이션
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },

  globalSetup: path.resolve(__dirname, './global-setup.ts'),
  globalTeardown: path.resolve(__dirname, './global-teardown.ts'),

  projects: [
    // 동시성 테스트 (Chromium)
    {
      name: 'concurrent-chromium',
      testMatch: /concurrent-(?!stress).*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    // 전체 흐름 테스트
    {
      name: 'full-flow',
      testMatch: /submission-approval-flow|awards-aggregation|badge-request-flow|concurrent-stress/,
      use: { ...devices['Desktop Chrome'] },
    },
    // 기본 Chromium
    {
      name: 'chromium',
      testMatch: /realtime-sync\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    // WebKit (Safari)
    {
      name: 'webkit',
      testMatch: /cross-browser-consistency\.spec\.ts$/,
      use: { ...devices['Desktop Safari'] },
    },
    // 모바일 Chrome (Pixel 5)
    {
      name: 'mobile-chrome',
      testMatch: /cross-browser-consistency\.spec\.ts$/,
      use: { ...devices['Pixel 5'] },
    },
    // 모바일 Safari (iPhone 13)
    {
      name: 'mobile-safari',
      testMatch: /cross-browser-consistency\.spec\.ts$/,
      use: { ...devices['iPhone 13'] },
    },
  ],

  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    cwd: path.resolve(__dirname, '..'),
  },
});
