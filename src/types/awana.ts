// ============================================
// Awana Club Management System - Type Definitions
// ============================================

// ---- Enums ----

export type UserRole = 'admin' | 'teacher' | 'member';
export type ClubType = 'sparks' | 'tnt';
export type OrderStatus = 'pending' | 'approved' | 'completed' | 'cancelled';
export type AwardType = 'handbook' | 'memorization' | 'attendance' | 'game';
export type AttendanceStatus = 'present' | 'late' | 'absent';
export type ScoringCategory = 'attendance' | 'handbook' | 'uniform' | 'recitation';
export type BadgeType = 'handbook_completion' | 'attendance_perfect' | 'memorization' | 'special' | 'custom';

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
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  club_id: string | null;
  team_id: string | null;
  name: string;
  birthday: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  uniform_size: string | null;
  active: boolean;
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

// ---- Badges ----

export interface Badge {
  id: string;
  name: string;
  badge_type: BadgeType;
  description: string | null;
  icon_url: string | null;
  curriculum_template_id: string | null;
  created_at: string;
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

// ---- Rooms ----

export interface Room {
  id: string;
  club_id: string;
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

// ---- Inventory & Budget (existing) ----

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit_price: number;
  current_stock: number;
  min_stock: number;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  category: string;
  amount: number;
  fiscal_year: number;
  remaining: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  inventory_item_id: string;
  quantity: number;
  total_price: number;
  status: OrderStatus;
  requested_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
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

// ---- Dalant (existing) ----

export interface DalantTransaction {
  id: string;
  member_id: string;
  amount: number;
  description: string;
  transaction_date: string;
  approved_by: string | null;
  created_at: string;
}

// ---- Award (existing) ----

export interface Award {
  id: string;
  member_id: string;
  award_type: AwardType;
  award_date: string;
  description: string | null;
  inventory_item_id: string | null;
  created_at: string;
  updated_at: string;
}
