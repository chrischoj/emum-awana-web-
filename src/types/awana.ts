// ============================================
// Awana Club Management System - Type Definitions
// ============================================

// ---- Enums ----

export type UserRole = 'admin' | 'teacher' | 'member';
export type ClubType = 'sparks' | 'tnt';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'none';
export type ScoringCategory = 'attendance' | 'handbook' | 'uniform' | 'recitation';
export type BadgeType = 'handbook_completion' | 'attendance_perfect' | 'memorization' | 'special' | 'custom';
export type BadgeCategory = 'jewel' | 'promotion' | 'citation' | 'special';
export type BadgeGroup = 'promotion' | 'podium' | 'gem' | 'completion' | 'review' | 'workbook' | 'multi_review' | 'currency' | 'pin' | 'recitation_pin';
export type EnrollmentStatus = 'pending' | 'active' | 'inactive';
export type EventStatus = 'upcoming' | 'active' | 'completed';
export type EventParticipantRole = 'player' | 'coach' | 'assistant_coach' | 'observer';

// ---- Core Entities ----

export interface Club {
  id: string;
  name: string;
  type: ClubType;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Teacher {
  id: string;
  user_id: string | null;
  club_id: string | null;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  position: string | null;
  active: boolean;
  is_game_assistant?: boolean;
  created_at: string;
  updated_at: string;
}

export type HandbookViewMode = 'reflow' | 'original';

export interface ClubHandbook {
  id: string;
  club_id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  uploaded_by: string | null;
  default_view_mode?: HandbookViewMode;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  club_id: string | null;
  team_id: string | null;
  room_id: string | null;
  name: string;
  birthday: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  uniform_size: string | null;
  avatar_url: string | null;
  active: boolean;
  enrollment_status: EnrollmentStatus;
  registered_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  registered_via_room_id: string | null;
  gender: 'M' | 'F' | null;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  club_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export const TEAM_NAMES = ['RED', 'BLUE', 'GREEN', 'YELLOW'] as const;
export type TeamName = typeof TEAM_NAMES[number];

export const TEAM_COLORS: Record<TeamName, string> = {
  RED: '#EF4444',
  BLUE: '#3B82F6',
  GREEN: '#22C55E',
  YELLOW: '#EAB308',
};

// ---- Attendance ----

export interface TeacherAttendanceRecord {
  id: string;
  teacher_id: string;
  training_date: string;
  present: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberAttendanceRecord {
  id: string;
  member_id: string;
  training_date: string;
  present: boolean;
  status: AttendanceStatus;
  absence_reason: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Scoring ----

export interface ScoringCategoryConfig {
  key: ScoringCategory;
  label: string;
  basePoints: number;
  multiplier: boolean;
  multiplierLabel?: string;
}

export interface CurriculumTemplate {
  id: string;
  club_type: ClubType;
  name: string;
  scoring_categories: ScoringCategoryConfig[];
  created_at: string;
  updated_at: string;
}

export interface WeeklyScore {
  id: string;
  member_id: string;
  club_id: string;
  training_date: string;
  category: ScoringCategory;
  base_points: number;
  multiplier: number;
  total_points: number;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GameScoreEntry {
  id: string;
  team_id: string;
  club_id: string;
  training_date: string;
  points: number;
  description: string | null;
  recorded_by: string | null;
  created_at: string;
}

// ---- Late/Absence Tracking ----

export interface LateAbsenceTracking {
  id: string;
  member_id: string;
  semester: string;
  late_count: number;
  converted_absences: number;
  created_at: string;
  updated_at: string;
}

// ---- Club Stages ----

export interface ClubStage {
  id: string;
  club_type: ClubType;
  stage_key: string;
  stage_name: string;
  sort_order: number;
  created_at: string;
}

// ---- Badges ----

export interface Badge {
  id: string;
  name: string;
  badge_type: BadgeType;
  description: string | null;
  icon_url: string | null;
  curriculum_template_id: string | null;
  category: BadgeCategory | null;
  level: number | null;
  sort_order: number | null;
  stage_id: string | null;
  badge_group: BadgeGroup | null;
  created_at: string;
  // join시 사용할 optional 필드
  stage?: ClubStage;
}

export interface MemberBadge {
  id: string;
  member_id: string;
  badge_id: string;
  awarded_by: string | null;
  awarded_date: string;
  note: string | null;
  created_at: string;
}

// ---- Badge Requests (뱃지 신청) ----

export type BadgeRequestStatus = 'requested' | 'approved' | 'rejected';

export interface BadgeRequest {
  id: string;
  member_id: string;
  badge_id: string;
  requested_by: string;
  status: BadgeRequestStatus;
  approved_by: string | null;
  note: string | null;
  rejection_note: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Rooms ----

export interface Room {
  id: string;
  club_id: string;
  team_id: string | null;
  name: string;
  qr_code_data: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomSession {
  id: string;
  room_id: string;
  training_date: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  created_at: string;
}

export interface RoomTeacher {
  id: string;
  room_session_id: string;
  teacher_id: string;
  checked_in_at: string;
}

// ---- Aggregation Types ----

export interface MemberWeeklySummary {
  member_id: string;
  member_name: string;
  team_id: string | null;
  team_name: string | null;
  scores: Record<ScoringCategory, WeeklyScore | null>;
  total_points: number;
}

export interface TeamWeeklySummary {
  team_id: string;
  team_name: TeamName;
  team_color: string;
  member_count: number;
  total_handbook_points: number;
  total_game_points: number;
  total_points: number;
}

export interface TeamFinalScore {
  team_id: string;
  team_name: TeamName;
  team_color: string;
  handbook_total: number;
  game_total: number;
  grand_total: number;
}

// ---- Awards Integration (awana-awards app) ----

export interface AwardsData {
  handbook: {
    sparks: Record<TeamName, number>;
    tnt: Record<TeamName, number>;
  };
  game: {
    sparks: Record<TeamName, number>;
    tnt: Record<TeamName, number>;
  };
}

// ---- Training Schedule (existing) ----

export interface TrainingSchedule {
  id: string;
  club_id: string | null;
  training_date: string;
  is_holiday: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Assignment Types (담임 배정) ----

export type AssignmentType = 'primary' | 'temporary';

export interface TeacherRoomAssignment {
  id: string;
  teacher_id: string;
  room_id: string;
  assignment_type: AssignmentType;
  effective_date: string;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** active_teacher_assignments 뷰의 반환 타입 */
export interface ActiveTeacherAssignment {
  id: string;
  teacher_id: string;
  room_id: string;
  assignment_type: AssignmentType;
  effective_date: string;
  end_date: string | null;
  club_id: string;
  team_id: string;
  room_name: string;
  team_name: string;
  team_color: string;
}

// ---- Submission Types (점수 제출/승인) ----

export type SubmissionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface WeeklyScoreSubmission {
  id: string;
  club_id: string;
  team_id: string;
  room_id: string | null;
  training_date: string;
  status: SubmissionStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_note: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Score Edit History (점수 수정 이력) ----

export interface ScoreEditHistory {
  id: string;
  weekly_score_id: string;
  member_id: string;
  club_id: string;
  training_date: string;
  category: ScoringCategory;
  old_base_points: number;
  old_multiplier: number;
  old_total_points: number;
  new_base_points: number;
  new_multiplier: number;
  new_total_points: number;
  edited_by: string;
  edit_reason: string | null;
  created_at: string;
}

// ---- Teacher Assignment Info (프런트엔드 훅 반환용) ----

export interface TeacherAssignmentInfo {
  /** 배정된 팀 ID 목록 (primary + active temporary) */
  assignedTeamIds: string[];
  /** 배정된 방 ID 목록 */
  assignedRoomIds: string[];
  /** primary 배정 상세 */
  primaryAssignments: ActiveTeacherAssignment[];
  /** temporary 배정 상세 */
  temporaryAssignments: ActiveTeacherAssignment[];
  /** 배정된 팀의 멤버만 필터 */
  assignedMembers: Member[];
  /** 미배정 교사 여부 */
  isUnassigned: boolean;
  /** 읽기 전용 여부 (미배정 = true) */
  isReadOnly: boolean;
}

// ---- Notifications (알림 시스템) ----

export type NotificationType =
  | 'score_submitted'
  | 'score_approved'
  | 'score_rejected'
  | 'game_score_locked'
  | 'game_score_unlocked'
  | 'badge_requested'
  | 'badge_approved'
  | 'badge_rejected';

export interface Notification {
  id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

// ---- Events ----

export interface EventSchedule {
  order: number;
  date: string;
  time: string;
  location: string;
}

export interface AwanaEvent {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  status: EventStatus;
  visibility: boolean;
  metadata: {
    schedules?: EventSchedule[];
    requirements?: string[];
  };
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventParticipant {
  id: string;
  event_id: string;
  member_id: string | null;
  teacher_id: string | null;
  club_type: 'sparks' | 'tnt';
  role: EventParticipantRole;
  sub_group: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  member?: Member;
  teacher?: Teacher;
}

