import { type Page } from '@playwright/test';
import { ADMIN_SCORING } from '../helpers/selectors';

export class AdminScoringPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/admin/scoring');
  }

  async approveTeam(teamId: string) {
    await this.page.click(ADMIN_SCORING.approveButton(teamId));
  }

  async rejectTeam(teamId: string, reason: string) {
    await this.page.click(ADMIN_SCORING.rejectButton(teamId));
    await this.page.fill(ADMIN_SCORING.rejectInput(teamId), reason);
    await this.page.click(ADMIN_SCORING.rejectConfirmButton(teamId));
  }

  async getSubmissionStatus(teamId: string): Promise<string> {
    return this.page.locator(ADMIN_SCORING.submissionStatus(teamId)).innerText();
  }
}
