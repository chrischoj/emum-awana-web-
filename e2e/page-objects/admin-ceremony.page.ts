import { type Page } from '@playwright/test';
import { ADMIN_CEREMONY } from '../helpers/selectors';

export class AdminCeremonyPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/admin/ceremony');
  }

  async aggregate() {
    await this.page.click(ADMIN_CEREMONY.aggregateButton);
  }

  async getTeamScore(teamId: string): Promise<string> {
    return this.page.locator(ADMIN_CEREMONY.teamScore(teamId)).innerText();
  }

  async startCeremony() {
    await this.page.click(ADMIN_CEREMONY.startButton);
  }
}
