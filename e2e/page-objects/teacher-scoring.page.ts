import { type Page } from '@playwright/test';
import { TEACHER_SCORING, BADGE_REQUEST } from '../helpers/selectors';

export class TeacherScoringPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/teacher/scoring');
  }

  async selectTeam(teamName: string) {
    await this.page.click(TEACHER_SCORING.teamTab(teamName));
  }

  async tapAttendance(memberId: string) {
    await this.page.click(TEACHER_SCORING.attendanceButton(memberId));
  }

  async toggleHandbook(memberId: string) {
    await this.page.click(TEACHER_SCORING.handbookButton(memberId));
  }

  async toggleUniform(memberId: string) {
    await this.page.click(TEACHER_SCORING.uniformButton(memberId));
  }

  async openRecitation(memberId: string) {
    await this.page.click(TEACHER_SCORING.recitationButton(memberId));
  }

  async incrementRecitation(memberId: string) {
    await this.page.click(TEACHER_SCORING.recitationPlus(memberId));
  }

  async decrementRecitation(memberId: string) {
    await this.page.click(TEACHER_SCORING.recitationMinus(memberId));
  }

  async getRecitationCount(memberId: string): Promise<string> {
    return this.page.locator(TEACHER_SCORING.recitationCount(memberId)).innerText();
  }

  async getMemberTotal(memberId: string): Promise<string> {
    return this.page.locator(TEACHER_SCORING.memberTotal(memberId)).innerText();
  }

  async getTeamTotal(): Promise<string> {
    return this.page.locator(TEACHER_SCORING.teamTotal).innerText();
  }

  async submitScores() {
    await this.page.click(TEACHER_SCORING.submitButton);
    await this.page.click(TEACHER_SCORING.submitConfirmButton);
  }

  async getSubmissionStatus(): Promise<string> {
    return this.page.locator(TEACHER_SCORING.submissionStatus).innerText();
  }

  // ── Badge Request ──

  async openBadgePanel(memberId: string) {
    await this.page.click(BADGE_REQUEST.openButton(memberId));
  }

  async selectBadgeChip(badgeId: string) {
    await this.page.click(BADGE_REQUEST.chip(badgeId));
  }

  async fillBadgeNote(note: string) {
    await this.page.fill(BADGE_REQUEST.noteInput, note);
  }

  async submitBadgeRequest() {
    await this.page.click(BADGE_REQUEST.submitButton);
  }

  async openBadgeReviewModal() {
    await this.page.click(BADGE_REQUEST.reviewOpenModal);
  }

  async approveBadgeRequest(requestId: string) {
    await this.page.click(BADGE_REQUEST.approveButton(requestId));
  }

  async rejectBadgeRequest(requestId: string, note?: string) {
    await this.page.click(BADGE_REQUEST.rejectButton(requestId));
    if (note) {
      await this.page.fill(BADGE_REQUEST.rejectionNoteInput(requestId), note);
    }
    await this.page.click(BADGE_REQUEST.rejectConfirmButton(requestId));
  }
}
