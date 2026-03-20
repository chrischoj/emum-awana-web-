import { type Page } from '@playwright/test';
import { LOGIN } from '../helpers/selectors';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.fill(LOGIN.emailInput, email);
    await this.page.fill(LOGIN.passwordInput, password);
    await this.page.click(LOGIN.submitButton);
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
  }
}
