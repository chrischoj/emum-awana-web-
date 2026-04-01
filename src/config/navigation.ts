import {
  LayoutDashboard,
  ClipboardCheck,
  ClipboardList,
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
  UserPlus,
  UserCog,
  UsersRound,
  BookOpen,
  Play,
  Calendar,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  requireGameAssistant?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const adminNavSections: NavSection[] = [
  {
    title: '',
    items: [
      { label: '대시보드', path: '/admin', icon: LayoutDashboard },
    ],
  },
  {
    title: '주간 활동',
    items: [
      { label: '클럽원 출석', path: '/admin/attendance/member', icon: ClipboardCheck },
      { label: '교사 출석', path: '/admin/attendance/teacher', icon: UserCheck },
      { label: '점수 총괄', path: '/admin/scoring', icon: ClipboardList },
      { label: '게임 점수', path: '/admin/game-scores', icon: Gamepad2 },
    ],
  },
  {
    title: '관리',
    items: [
      { label: '클럽원 관리', path: '/admin/members', icon: UserPlus },
      { label: '교사 관리', path: '/admin/teachers', icon: UserCog },
      { label: '팀 관리', path: '/admin/teams', icon: UsersRound },
      { label: '교실 관리', path: '/admin/rooms', icon: DoorOpen },
    ],
  },
  {
    title: '시상',
    items: [
      { label: '시상/뱃지', path: '/admin/awards', icon: Trophy },
      { label: '시상식', path: '/admin/ceremony', icon: Star },
      { label: '시상식 플레이', path: '/admin/ceremony-play', icon: Play },
    ],
  },
  {
    title: '콘텐츠',
    items: [
      { label: '핸드북 관리', path: '/admin/handbook', icon: BookOpen },
    ],
  },
  {
    title: '이벤트',
    items: [
      { label: '이벤트 관리', path: '/admin/events', icon: Calendar },
    ],
  },
  {
    title: '시스템',
    items: [
      { label: '보고서', path: '/admin/reports', icon: BarChart3 },
      { label: '설정', path: '/admin/settings', icon: Settings },
    ],
  },
];

// flat list for backward compat
export const adminNavItems: NavItem[] = adminNavSections.flatMap((s) => s.items);

export const teacherNavItems: NavItem[] = [
  { label: '홈', path: '/teacher', icon: Home },
  { label: '출석', path: '/teacher/attendance', icon: ClipboardCheck },
  { label: '반별 점수', path: '/teacher/scoring', icon: PenLine },
  { label: '게임 점수', path: '/teacher/game', icon: Gamepad2, requireGameAssistant: true },
  { label: '핸드북', path: '/teacher/handbook', icon: BookOpen },
];
