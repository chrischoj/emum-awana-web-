import { type Page } from '@playwright/test';
import { TEACHER_GAME } from '../helpers/selectors';

export class TeacherGamePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/teacher/game');
  }

  async selectTeam(teamId: string) {
    await this.page.click(TEACHER_GAME.teamButton(teamId));
  }

  async setPoints(value: number) {
    await this.page.fill(TEACHER_GAME.pointsInput, '');
    await this.page.fill(TEACHER_GAME.pointsInput, String(value));
  }

  async selectPointPreset(value: number) {
    await this.page.click(TEACHER_GAME.pointPreset(value));
  }

  async setDescription(desc: string) {
    await this.page.fill(TEACHER_GAME.descriptionInput, desc);
  }

  async selectDescriptionPreset(desc: string) {
    await this.page.click(TEACHER_GAME.descriptionPreset(desc));
  }

  async submit() {
    await this.page.click(TEACHER_GAME.submitButton);
  }

  async getTeamTotal(teamId: string): Promise<string> {
    return this.page.locator(TEACHER_GAME.teamTotal(teamId)).innerText();
  }

  async isLocked(): Promise<boolean> {
    return this.page.locator(TEACHER_GAME.lockBanner).isVisible();
  }

  async incrementPoints() {
    await this.page.click(TEACHER_GAME.pointsPlus);
  }

  async decrementPoints() {
    await this.page.click(TEACHER_GAME.pointsMinus);
  }
}
