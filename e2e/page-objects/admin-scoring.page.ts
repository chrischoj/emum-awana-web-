import { type Page } from '@playwright/test';
import { ADMIN_SCORING, ADMIN_ROOM_SCORING } from '../helpers/selectors';

export class AdminScoringPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/admin/scoring');
  }

  // ── Team-level (legacy) ──

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

  // ── Room-level ──

  async approveRoom(roomId: string) {
    await this.page.click(ADMIN_ROOM_SCORING.roomApproveButton(roomId));
  }

  async rejectRoom(roomId: string, reason: string) {
    await this.page.click(ADMIN_ROOM_SCORING.roomRejectButton(roomId));
    await this.page.fill(ADMIN_ROOM_SCORING.roomRejectInput(roomId), reason);
    await this.page.click(ADMIN_ROOM_SCORING.roomRejectConfirmButton(roomId));
  }

  async getRoomSubmissionStatus(roomId: string): Promise<string> {
    return this.page.locator(ADMIN_ROOM_SCORING.roomStatus(roomId)).innerText();
  }

  async isRoomCardVisible(roomId: string): Promise<boolean> {
    return this.page.locator(ADMIN_ROOM_SCORING.roomCard(roomId)).isVisible({ timeout: 5000 });
  }
}
