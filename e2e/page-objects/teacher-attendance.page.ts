import { type Page } from '@playwright/test';
import { TEACHER_ATTENDANCE } from '../helpers/selectors';

export class TeacherAttendancePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/teacher/attendance');
  }

  async selectTeam(teamName: string) {
    await this.page.click(TEACHER_ATTENDANCE.teamTab(teamName));
  }

  async tapStatus(memberId: string) {
    await this.page.click(TEACHER_ATTENDANCE.statusButton(memberId));
  }

  async getStatus(memberId: string): Promise<string> {
    return this.page.locator(TEACHER_ATTENDANCE.memberRow(memberId)).innerText();
  }

  async bulkPresent() {
    await this.page.click(TEACHER_ATTENDANCE.bulkPresentButton);
  }

  async filterBy(status: string) {
    await this.page.click(TEACHER_ATTENDANCE.filterButton(status));
  }
}
