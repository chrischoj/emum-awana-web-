import { chromium, type FullConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const accounts = [
  { name: 'admin', email: process.env.TEST_ADMIN_EMAIL!, password: process.env.TEST_ADMIN_PASSWORD! },
  { name: 'teacher1', email: process.env.TEST_TEACHER1_EMAIL!, password: process.env.TEST_TEACHER1_PASSWORD! },
  { name: 'teacher2', email: process.env.TEST_TEACHER2_EMAIL!, password: process.env.TEST_TEACHER2_PASSWORD! },
  { name: 'teacher3', email: process.env.TEST_TEACHER3_EMAIL!, password: process.env.TEST_TEACHER3_PASSWORD! },
];

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || process.env.BASE_URL || 'http://localhost:4173';

  for (const account of accounts) {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${baseURL}/login`);
    await page.fill('#email', account.email);
    await page.fill('#password', account.password);
    await page.click('button[type="submit"]');

    // 로그인 후 리다이렉트 대기
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });

    const storagePath = path.resolve(__dirname, `.auth/${account.name}.json`);
    await context.storageState({ path: storagePath });

    await browser.close();
    console.log(`[global-setup] ${account.name} 인증 상태 저장 완료: ${storagePath}`);
  }
}

export default globalSetup;
