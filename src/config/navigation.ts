import {
  LayoutDashboard,
  ClipboardCheck,
  Users,
  Trophy,
  Star,
  Gamepad2,
  DoorOpen,
  BarChart3,
  Settings,
  Home,
  PenLine,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const adminNavItems: NavItem[] = [
  { label: '대시보드', path: '/admin', icon: LayoutDashboard },
  { label: '점수 총괄', path: '/admin/scoring', icon: ClipboardCheck },
  { label: '게임 점수', path: '/admin/game-scores', icon: Gamepad2 },
  { label: '교사 출석', path: '/admin/attendance/teacher', icon: UserCheck },
  { label: '클럽원 출석', path: '/admin/attendance/member', icon: Users },
  { label: '팀 관리', path: '/admin/teams', icon: Users },
  { label: '시상/뱃지', path: '/admin/awards', icon: Trophy },
  { label: '시상식', path: '/admin/ceremony', icon: Star },
  { label: '교실 관리', path: '/admin/rooms', icon: DoorOpen },
  { label: '보고서', path: '/admin/reports', icon: BarChart3 },
  { label: '설정', path: '/admin/settings', icon: Settings },
];

export const teacherNavItems: NavItem[] = [
  { label: '홈', path: '/teacher', icon: Home },
  { label: '점수 입력', path: '/teacher/scoring', icon: PenLine },
  { label: '게임 점수', path: '/teacher/game', icon: Gamepad2 },
  { label: '출석', path: '/teacher/attendance', icon: ClipboardCheck },
];
