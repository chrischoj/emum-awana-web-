/** data-testid 기반 셀렉터 상수 */

// ── Login ──
export const LOGIN = {
  emailInput: '#email',
  passwordInput: '#password',
  submitButton: 'button[type="submit"]',
} as const;

// ── Teacher: Scoring Page ──
export const TEACHER_SCORING = {
  teamTab: (teamName: string) => `[data-testid="team-tab-${teamName}"]`,
  memberCard: (memberId: string) => `[data-testid="member-card-${memberId}"]`,
  attendanceButton: (memberId: string) => `[data-testid="attendance-btn-${memberId}"]`,
  handbookButton: (memberId: string) => `[data-testid="handbook-btn-${memberId}"]`,
  uniformButton: (memberId: string) => `[data-testid="uniform-btn-${memberId}"]`,
  recitationButton: (memberId: string) => `[data-testid="recitation-btn-${memberId}"]`,
  recitationPlus: (memberId: string) => `[data-testid="recitation-plus-${memberId}"]`,
  recitationMinus: (memberId: string) => `[data-testid="recitation-minus-${memberId}"]`,
  recitationCount: (memberId: string) => `[data-testid="recitation-count-${memberId}"]`,
  memberTotal: (memberId: string) => `[data-testid="member-total-${memberId}"]`,
  teamTotal: '[data-testid="team-total"]',
  submitButton: '[data-testid="submit-scores-btn"]',
  submitConfirmButton: '[data-testid="submit-confirm-btn"]',
  submissionStatus: '[data-testid="submission-status"]',
} as const;

// ── Teacher: Game Scoring Page ──
export const TEACHER_GAME = {
  teamButton: (teamId: string) => `[data-testid="game-team-btn-${teamId}"]`,
  teamTotal: (teamId: string) => `[data-testid="game-team-total-${teamId}"]`,
  pointsInput: '[data-testid="game-points-input"]',
  pointsPlus: '[data-testid="game-points-plus"]',
  pointsMinus: '[data-testid="game-points-minus"]',
  pointPreset: (value: number) => `[data-testid="game-point-preset-${value}"]`,
  descriptionInput: '[data-testid="game-description-input"]',
  descriptionPreset: (desc: string) => `[data-testid="game-desc-preset-${desc}"]`,
  submitButton: '[data-testid="game-submit-btn"]',
  lockBanner: '[data-testid="game-lock-banner"]',
  entryRow: (entryId: string) => `[data-testid="game-entry-${entryId}"]`,
} as const;

// ── Teacher: Attendance Page ──
export const TEACHER_ATTENDANCE = {
  teamTab: (teamName: string) => `[data-testid="att-team-tab-${teamName}"]`,
  memberRow: (memberId: string) => `[data-testid="att-member-${memberId}"]`,
  statusButton: (memberId: string) => `[data-testid="att-status-btn-${memberId}"]`,
  bulkPresentButton: '[data-testid="att-bulk-present-btn"]',
  filterButton: (status: string) => `[data-testid="att-filter-${status}"]`,
} as const;

// ── Admin: Scoring Overview ──
export const ADMIN_SCORING = {
  teamCard: (teamId: string) => `[data-testid="admin-team-card-${teamId}"]`,
  approveButton: (teamId: string) => `[data-testid="admin-approve-btn-${teamId}"]`,
  rejectButton: (teamId: string) => `[data-testid="admin-reject-btn-${teamId}"]`,
  rejectInput: (teamId: string) => `[data-testid="admin-reject-input-${teamId}"]`,
  rejectConfirmButton: (teamId: string) => `[data-testid="admin-reject-confirm-${teamId}"]`,
  submissionStatus: (teamId: string) => `[data-testid="admin-submission-status-${teamId}"]`,
} as const;

// ── Admin: Scoring Overview (Room-level) ──
export const ADMIN_ROOM_SCORING = {
  roomCard: (roomId: string) => `[data-testid="admin-room-card-${roomId}"]`,
  roomStatus: (roomId: string) => `[data-testid="admin-room-status-${roomId}"]`,
  roomApproveButton: (roomId: string) => `[data-testid="admin-room-approve-btn-${roomId}"]`,
  roomRejectButton: (roomId: string) => `[data-testid="admin-room-reject-btn-${roomId}"]`,
  roomRejectInput: (roomId: string) => `[data-testid="admin-room-reject-input-${roomId}"]`,
  roomRejectConfirmButton: (roomId: string) => `[data-testid="admin-room-reject-confirm-${roomId}"]`,
} as const;

// ── Badge Request ──
export const BADGE_REQUEST = {
  openButton: (memberId: string) => `[data-testid="badge-open-${memberId}"]`,
  chip: (badgeId: string) => `[data-testid="badge-chip-${badgeId}"]`,
  noteInput: '[data-testid="badge-request-note"]',
  submitButton: '[data-testid="badge-request-submit"]',
  reviewBanner: '[data-testid="badge-review-banner"]',
  reviewOpenModal: '[data-testid="badge-review-open-modal"]',
  approveButton: (requestId: string) => `[data-testid="badge-approve-${requestId}"]`,
  rejectButton: (requestId: string) => `[data-testid="badge-reject-${requestId}"]`,
  rejectionNoteInput: (requestId: string) => `[data-testid="badge-rejection-note-${requestId}"]`,
  rejectConfirmButton: (requestId: string) => `[data-testid="badge-reject-confirm-${requestId}"]`,
} as const;

// ── Admin: Ceremony Page ──
export const ADMIN_CEREMONY = {
  aggregateButton: '[data-testid="ceremony-aggregate-btn"]',
  teamScore: (teamId: string) => `[data-testid="ceremony-team-score-${teamId}"]`,
  startButton: '[data-testid="ceremony-start-btn"]',
} as const;
