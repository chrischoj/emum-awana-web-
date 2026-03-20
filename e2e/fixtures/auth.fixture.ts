import { test as base, type Page, type BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authDir = path.resolve(__dirname, '..', '.auth');

type AuthFixtures = {
  adminPage: Page;
  teacher1Page: Page;
  teacher2Page: Page;
  teacher3Page: Page;
  adminContext: BrowserContext;
  teacher1Context: BrowserContext;
  teacher2Context: BrowserContext;
  teacher3Context: BrowserContext;
};

export const test = base.extend<AuthFixtures>({
  adminContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(authDir, 'admin.json'),
    });
    await use(context);
    await context.close();
  },

  teacher1Context: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(authDir, 'teacher1.json'),
    });
    await use(context);
    await context.close();
  },

  teacher2Context: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(authDir, 'teacher2.json'),
    });
    await use(context);
    await context.close();
  },

  teacher3Context: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(authDir, 'teacher3.json'),
    });
    await use(context);
    await context.close();
  },

  adminPage: async ({ adminContext }, use) => {
    const page = await adminContext.newPage();
    await use(page);
  },

  teacher1Page: async ({ teacher1Context }, use) => {
    const page = await teacher1Context.newPage();
    await use(page);
  },

  teacher2Page: async ({ teacher2Context }, use) => {
    const page = await teacher2Context.newPage();
    await use(page);
  },

  teacher3Page: async ({ teacher3Context }, use) => {
    const page = await teacher3Context.newPage();
    await use(page);
  },
});

export { expect } from '@playwright/test';
