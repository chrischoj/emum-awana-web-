import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import { getEventById, getEventParticipants, getPublicEvent } from '../../services/eventService';
import { getKoreanAge, getSchoolGrade, gradeLabel, formatDateKorean, getDday } from '../../utils/dateUtils';
import type { AwanaEvent, EventParticipant, EventSchedule } from '../../types/awana';
import { ArrowLeft, Flag, Grid3X3, ListChecks, MapPin, Search, Table2, Target, UserRoundCheck, UsersRound } from 'lucide-react';

type ClubTab = 'sparks' | 'tnt';
type EventTeamTab = 'sparks-team-1' | 'tnt-team-2' | 'tnt-team-1';
type LineupSession = 'morning' | 'afternoon';
type LineupSessionPlayer = { name: string; memberNames?: string[] };
type LineupPlayer = {
  order: number;
  name: string;
  memberNames?: string[];
  sessionPlayers?: Partial<Record<LineupSession, LineupSessionPlayer>>;
};
type LineupDutyType = 'pin' | 'shooter';
type LineupDuty = { order: number; label: string; type: LineupDutyType };
type LineupGame = { label: string; players: number[]; runner?: number; duties?: LineupDuty[]; allPlay?: boolean };
type LineupViewMode = 'games' | 'players' | 'matrix';
type EventLineup = {
  id: string;
  club: ClubTab;
  teamTab: EventTeamTab;
  teamLabel: string;
  groupLabel: string;
  title: string;
  morningGameCount: number;
  players: LineupPlayer[];
  games: LineupGame[];
};

const STATUS_LABELS: Record<string, { text: string; className: string }> = {
  upcoming: { text: '예정', className: 'bg-gray-100 text-gray-600' },
  active: { text: '진행중', className: 'bg-green-100 text-green-700' },
  completed: { text: '종료', className: 'bg-gray-100 text-gray-500' },
};

const ROLE_LABELS: Record<string, string> = {
  coach: '코치',
  assistant_coach: '보조코치',
  observer: '참관',
};

const TEAM_TABS: Array<{ key: EventTeamTab; club: ClubTab; label: string }> = [
  { key: 'sparks-team-1', club: 'sparks', label: '🔴 스팍스 1팀' },
  { key: 'tnt-team-1', club: 'tnt', label: '🟢 티앤티 1팀' },
  { key: 'tnt-team-2', club: 'tnt', label: '🟢 티앤티 2팀' },
];

const LINEUP_VIEW_MODES: Array<{
  key: LineupViewMode;
  label: string;
  icon: typeof Grid3X3;
}> = [
  { key: 'games', label: '게임별', icon: Grid3X3 },
  { key: 'players', label: '선수별', icon: UsersRound },
  { key: 'matrix', label: '전체표', icon: Table2 },
];

const TNT_TEAM_LINEUP_GAMES: LineupGame[] = [
  { label: '콩주머니 릴레이 1조', players: [1, 2, 3, 4, 5, 7], runner: 7 },
  { label: '콩주머니 릴레이 2조', players: [2, 6, 7, 8, 9, 10], runner: 2 },
  { label: '콩주머니 릴레이 3조', players: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], runner: 10, allPlay: true },
  { label: '단거리 이어 달리기 1조', players: [1, 3, 5, 7, 9], duties: [{ order: 9, label: '종료핀', type: 'pin' }] },
  { label: '단거리 이어 달리기 2조', players: [2, 4, 6, 8, 10], duties: [{ order: 10, label: '종료핀', type: 'pin' }] },
  { label: '농구', players: [4, 6, 10], duties: [{ order: 4, label: '슈터', type: 'shooter' }, { order: 6, label: '슈터', type: 'shooter' }, { order: 10, label: '슈터', type: 'shooter' }] },
  { label: '소방관 1조', players: [1, 2, 3, 4], runner: 4 },
  { label: '소방관 2조', players: [6, 7, 8, 9], runner: 9 },
  { label: '풋볼 1조', players: [2, 3, 4], duties: [{ order: 2, label: '종료핀', type: 'pin' }] },
  { label: '풋볼 2조', players: [5, 6, 7], duties: [{ order: 5, label: '종료핀', type: 'pin' }] },
  { label: '풋볼 3조', players: [8, 9, 10], duties: [{ order: 8, label: '종료핀', type: 'pin' }] },
  { label: '콩주머니 옮기기', players: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], allPlay: true },
  { label: '볼릴레이 1조', players: [1, 2, 3, 4, 5], duties: [{ order: 1, label: '종료핀', type: 'pin' }] },
  { label: '볼릴레이 2조', players: [6, 7, 8, 9, 10], duties: [{ order: 6, label: '종료핀', type: 'pin' }] },
  { label: '스피드 스택스 1조', players: [1, 2, 3, 4, 5], duties: [{ order: 5, label: '종료핀', type: 'pin' }] },
  { label: '스피드 스택스 2조', players: [6, 7, 8, 9, 10], duties: [{ order: 10, label: '종료핀', type: 'pin' }] },
  { label: '지그재그 릴레이 1조', players: [1, 2, 3, 4, 5], duties: [{ order: 5, label: '종료핀', type: 'pin' }] },
  { label: '지그재그 릴레이 2조', players: [6, 7, 8, 9, 10], duties: [{ order: 10, label: '종료핀', type: 'pin' }] },
  { label: '사방 줄다리기 1조', players: [1, 3] },
  { label: '사방 줄다리기 2조', players: [5, 8] },
  { label: '사방 줄다리기 3조', players: [9, 10] },
];

const SPARKS_TEAM_LINEUP_GAMES: LineupGame[] = [
  { label: '단거리 이어 달리기 1조', players: [1, 2, 3, 4], duties: [{ order: 5, label: '종료핀', type: 'pin' }] },
  { label: '단거리 이어 달리기 2조', players: [6, 7, 8, 9], duties: [{ order: 10, label: '종료핀', type: 'pin' }] },
  { label: '볼 릴레이', players: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], duties: [{ order: 10, label: '종료핀', type: 'pin' }], allPlay: true },
  { label: '사파리 1조', players: [1, 3], duties: [{ order: 5, label: '종료핀', type: 'pin' }] },
  { label: '사파리 2조', players: [6, 8], duties: [{ order: 10, label: '종료핀', type: 'pin' }] },
  { label: '볼링 1조', players: [2] },
  { label: '볼링 2조', players: [4] },
  { label: '볼링 3조', players: [7] },
  { label: '볼링 4조', players: [9] },
  { label: '콩주머니 인앤 아웃', players: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], duties: [{ order: 10, label: '종료핀', type: 'pin' }], allPlay: true },
  { label: '컬링 1조', players: [2, 4, 6] },
  { label: '컬링 2조', players: [5, 7, 9] },
  { label: '지그재그 달리기 1조', players: [1] },
  { label: '지그재그 달리기 2조', players: [3] },
  { label: '지그재그 달리기 3조', players: [8] },
  { label: '지그재그 달리기 4조', players: [10] },
  { label: '스택스 릴레이 1조', players: [1, 2], duties: [{ order: 3, label: '종료핀', type: 'pin' }] },
  { label: '스택스 릴레이 2조', players: [6, 7], duties: [{ order: 8, label: '종료핀', type: 'pin' }] },
  { label: '핀 바로 세우기 1조', players: [4] },
  { label: '핀 바로 세우기 2조', players: [5] },
  { label: '핀 바로 세우기 3조', players: [9] },
  { label: '핀 바로 세우기 4조', players: [10] },
  { label: '후프 릴레이 1조', players: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], runner: 6, allPlay: true },
  { label: '후프 릴레이 2조', players: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], runner: 8, allPlay: true },
];

const EVENT_LINEUPS: EventLineup[] = [
  {
    id: 'sparks-team-1',
    club: 'sparks',
    teamTab: 'sparks-team-1',
    teamLabel: '스팍스 1팀',
    groupLabel: '스팍스 기준',
    title: '스팍스 1팀 경기 라인업',
    morningGameCount: 10,
    players: [
      { order: 1, name: '최이안' },
      {
        order: 2,
        name: '김지혁/은호',
        memberNames: ['김지혁', '강은호'],
        sessionPlayers: {
          morning: { name: '김지혁' },
          afternoon: { name: '강은호' },
        },
      },
      { order: 3, name: '박서준' },
      { order: 4, name: '김주호' },
      { order: 5, name: '심예린' },
      { order: 6, name: '김율아' },
      { order: 7, name: '김시아' },
      { order: 8, name: '이서후' },
      {
        order: 9,
        name: '김서은/주아',
        memberNames: ['김서은', '김주아'],
        sessionPlayers: {
          morning: { name: '김서은' },
          afternoon: { name: '김주아' },
        },
      },
      { order: 10, name: '구교현' },
    ],
    games: SPARKS_TEAM_LINEUP_GAMES,
  },
  {
    id: 'tnt-boys-team-1',
    club: 'tnt',
    teamTab: 'tnt-team-1',
    teamLabel: '티앤티 1팀',
    groupLabel: '남자부 기준',
    title: '티앤티 1팀 경기 라인업',
    morningGameCount: 11,
    players: [
      { order: 1, name: '신예봄' },
      { order: 2, name: '한채아' },
      { order: 3, name: '김주언' },
      { order: 4, name: '이로아' },
      { order: 5, name: '최서원' },
      { order: 6, name: '우주비' },
      { order: 7, name: '최아인' },
      { order: 8, name: '최해온' },
      { order: 9, name: '오하은' },
      { order: 10, name: '김아원' },
    ],
    games: TNT_TEAM_LINEUP_GAMES,
  },
  {
    id: 'tnt-boys-team-2',
    club: 'tnt',
    teamTab: 'tnt-team-2',
    teamLabel: '티앤티 2팀',
    groupLabel: '남자부 기준',
    title: '티앤티 2팀 경기 라인업',
    morningGameCount: 11,
    players: [
      { order: 1, name: '이채후' },
      { order: 2, name: '최시윤' },
      { order: 3, name: '장재원' },
      { order: 4, name: '조정우' },
      { order: 5, name: '한지호' },
      { order: 6, name: '김윤희' },
      { order: 7, name: '김아인' },
      { order: 8, name: '김주안' },
      { order: 9, name: '최해강' },
      { order: 10, name: '권오율' },
    ],
    games: TNT_TEAM_LINEUP_GAMES,
  },
];

function getNextSchedule(schedules: EventSchedule[]): EventSchedule | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sorted = [...schedules].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return sorted.find((s) => new Date(s.date) >= today) ?? null;
}

function getScheduleStatus(dateStr: string): 'past' | 'today' | 'future' {
  const target = new Date(dateStr);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  if (target.getTime() === today.getTime()) return 'today';
  return target < today ? 'past' : 'future';
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, '').trim();
}

function getLineupPlayerNames(player: LineupPlayer): string[] {
  return player.memberNames ?? [player.name];
}

function resolveLineupPlayerForSession(player: LineupPlayer, session: LineupSession): LineupPlayer {
  const sessionPlayer = player.sessionPlayers?.[session];
  if (!sessionPlayer) return player;

  return {
    ...player,
    name: sessionPlayer.name,
    memberNames: sessionPlayer.memberNames ?? [sessionPlayer.name],
  };
}

function getLineupRosterCount(lineup: EventLineup): number {
  return lineup.players.reduce((count, player) => count + getLineupPlayerNames(player).length, 0);
}

function getLineupMemberNameKeys(lineup: EventLineup): string[] {
  return lineup.players.flatMap((player) => getLineupPlayerNames(player).map(normalizeName));
}

function getLineupSummary(lineup: EventLineup, order: number) {
  const assignments = lineup.games.filter(
    (game) => game.players.includes(order) || game.runner === order || Boolean(getGameDuty(game, order))
  );
  const runnerAssignments = assignments.filter((game) => game.runner === order);
  const dutyAssignments = assignments
    .map((game) => ({ game, duty: getGameDuty(game, order) }))
    .filter((item): item is { game: LineupGame; duty: LineupDuty } => Boolean(item.duty));
  return { assignments, runnerAssignments, dutyAssignments };
}

function getGameDuty(game: LineupGame, order: number): LineupDuty | undefined {
  return game.duties?.find((duty) => duty.order === order);
}

function getDutyClass(type: LineupDutyType): string {
  return type === 'shooter'
    ? 'bg-sky-100 text-sky-800 ring-1 ring-sky-200'
    : 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200';
}

function getDutyCellClass(type: LineupDutyType): string {
  return type === 'shooter' ? 'bg-sky-100 text-sky-950' : 'bg-emerald-100 text-emerald-950';
}

function getGameLineupPlayers(lineup: EventLineup, game: LineupGame): LineupPlayer[] {
  const session = getGameSession(lineup, game);

  return lineup.players.filter((player) =>
    game.players.includes(player.order) || game.runner === player.order || Boolean(getGameDuty(game, player.order))
  ).map((player) => resolveLineupPlayerForSession(player, session));
}

function getGameRosterCount(lineup: EventLineup, game: LineupGame): number {
  return getGameLineupPlayers(lineup, game).reduce(
    (count, player) => count + getLineupPlayerNames(player).length,
    0
  );
}

function getLineupPlayerRole(game: LineupGame, order: number): LineupDuty | { label: '주자'; type: 'runner' } | undefined {
  if (game.runner === order) return { label: '주자', type: 'runner' };
  return getGameDuty(game, order);
}

function getRoleBadgeClass(role: ReturnType<typeof getLineupPlayerRole>): string {
  if (!role) return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200';
  if (role.type === 'runner') return 'bg-rose-100 text-rose-800 ring-1 ring-rose-200';
  return getDutyClass(role.type);
}

function lineupMatchesQuery(lineup: EventLineup, game: LineupGame, query: string): boolean {
  const keyword = normalizeName(query);
  if (!keyword) return true;
  if (normalizeName(game.label).includes(keyword)) return true;
  return getGameLineupPlayers(lineup, game).some((player) =>
    normalizeName(player.name).includes(keyword) ||
    getLineupPlayerNames(player).some((name) => normalizeName(name).includes(keyword)) ||
    String(player.order) === keyword
  );
}

function getLineupPlayerCount(teamTab: EventTeamTab): number {
  return EVENT_LINEUPS
    .filter((lineup) => lineup.teamTab === teamTab)
    .reduce((count, lineup) => count + getLineupRosterCount(lineup), 0);
}

function getLineupSession(lineup: EventLineup, gameIndex: number): LineupSession {
  return gameIndex < lineup.morningGameCount ? 'morning' : 'afternoon';
}

function getGameSession(lineup: EventLineup, game: LineupGame): LineupSession {
  return getLineupSession(lineup, lineup.games.indexOf(game));
}

function getSessionLabel(session: LineupSession): string {
  return session === 'morning' ? '오전 경기' : '오후 경기';
}

function getSessionBadgeClass(session: LineupSession): string {
  return session === 'morning'
    ? 'bg-orange-100 text-orange-800 ring-1 ring-orange-200'
    : 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200';
}

function getSessionHeaderClass(session: LineupSession): string {
  return session === 'morning'
    ? 'border-orange-200 bg-orange-50/95 text-orange-950'
    : 'border-indigo-200 bg-indigo-50/95 text-indigo-950';
}

function getSessionCardClass(session: LineupSession): string {
  return session === 'morning'
    ? 'border-orange-200 bg-orange-50/70'
    : 'border-indigo-200 bg-indigo-50/70';
}

function getSessionNumberClass(session: LineupSession): string {
  return session === 'morning' ? 'bg-orange-600 text-white' : 'bg-indigo-600 text-white';
}

function getLineupSessionGames(lineup: EventLineup, session: LineupSession): LineupGame[] {
  return session === 'morning'
    ? lineup.games.slice(0, lineup.morningGameCount)
    : lineup.games.slice(lineup.morningGameCount);
}

function getLineupSessionGameRange(lineup: EventLineup, session: LineupSession): string {
  const games = getLineupSessionGames(lineup, session);
  if (games.length === 0) return '미정';
  return `${games[0].label} → ${games[games.length - 1].label}`;
}

function AvatarCircle({
  name,
  avatarUrl,
  size = 'md',
}: {
  name: string;
  avatarUrl: string | null | undefined;
  size?: 'md' | 'sm';
}) {
  const [imgError, setImgError] = useState(false);
  const initials = name.slice(0, 2);
  const sizeClass = size === 'md' ? 'w-14 h-14 text-lg' : 'w-10 h-10 text-sm';

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center bg-indigo-100 text-indigo-700 font-semibold`}
    >
      {initials}
    </div>
  );
}

function LineupPlayerAvatarGroup({
  player,
  participantsByName,
  size = 'sm',
}: {
  player: LineupPlayer;
  participantsByName: Map<string, EventParticipant>;
  size?: 'md' | 'sm';
}) {
  const names = getLineupPlayerNames(player);

  if (names.length === 1) {
    const participant = participantsByName.get(normalizeName(names[0]));
    return <AvatarCircle name={names[0]} avatarUrl={participant?.member?.avatar_url} size={size} />;
  }

  return (
    <div className="flex -space-x-2">
      {names.map((name) => {
        const participant = participantsByName.get(normalizeName(name));
        return (
          <div key={name} className="rounded-full ring-2 ring-white">
            <AvatarCircle name={name} avatarUrl={participant?.member?.avatar_url} size="sm" />
          </div>
        );
      })}
    </div>
  );
}

function GameLineupSection({
  lineups,
  players,
  isPublic,
  onMemberClick,
}: {
  lineups: EventLineup[];
  players: EventParticipant[];
  isPublic: boolean;
  onMemberClick: (memberId: string) => void;
}) {
  if (lineups.length === 0) return null;

  const [viewMode, setViewMode] = useState<LineupViewMode>('games');
  const [query, setQuery] = useState('');
  const participantsByName = new Map(
    players
      .filter((participant) => participant.member)
      .map((participant) => [normalizeName(participant.member!.name), participant])
  );

  return (
    <div className="space-y-5">
      {lineups.map((lineup) => {
        const filledGames = lineup.games.filter((game) => game.players.length > 0);
        const runnerCount = lineup.games.filter((game) => game.runner).length;
        const dutyCount = lineup.games.reduce((count, game) => count + (game.duties?.length ?? 0), 0);
        const visibleGames = lineup.games.filter((game) => lineupMatchesQuery(lineup, game, query));
        const visiblePlayers = lineup.players.filter((player) => {
          const keyword = normalizeName(query);
          if (!keyword) return true;
          const { assignments } = getLineupSummary(lineup, player.order);
          return (
            normalizeName(player.name).includes(keyword) ||
            getLineupPlayerNames(player).some((name) => normalizeName(name).includes(keyword)) ||
            String(player.order) === keyword ||
            assignments.some((game) => normalizeName(game.label).includes(keyword))
          );
        });

        return (
          <section
            key={lineup.id}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      <UsersRound className="h-3.5 w-3.5" />
                      {lineup.teamLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {lineup.groupLabel}
                    </span>
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-slate-950">{lineup.title}</h2>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(['morning', 'afternoon'] as LineupSession[]).map((session) => (
                      <div
                        key={session}
                        className={`rounded-xl border px-3 py-2 shadow-sm ${getSessionCardClass(session)}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-1 text-[11px] font-black ${getSessionBadgeClass(session)}`}>
                            {getSessionLabel(session)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-black leading-snug text-slate-800">
                          {getLineupSessionGameRange(lineup, session)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
                    <p className="text-[11px] font-medium text-slate-500">선수</p>
                    <p className="text-sm font-bold text-slate-950">{getLineupRosterCount(lineup)}명</p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
                    <p className="text-[11px] font-medium text-slate-500">게임</p>
                    <p className="text-sm font-bold text-slate-950">{filledGames.length}개</p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
                    <p className="text-[11px] font-medium text-slate-500">주자</p>
                    <p className="text-sm font-bold text-rose-700">{runnerCount}회</p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
                    <p className="text-[11px] font-medium text-slate-500">특임</p>
                    <p className="text-sm font-bold text-emerald-700">{dutyCount}회</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
                  <Grid3X3 className="h-3.5 w-3.5" />
                  참여
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-rose-800">
                  <Flag className="h-3.5 w-3.5" />
                  주자
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">
                  <MapPin className="h-3.5 w-3.5" />
                  종료핀 담당
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-sky-800">
                  <Target className="h-3.5 w-3.5" />
                  슈터
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-slate-600 ring-1 ring-slate-200">
                  <ListChecks className="h-3.5 w-3.5" />
                  순번 기준
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1">
                {LINEUP_VIEW_MODES.map((mode) => {
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => setViewMode(mode.key)}
                      className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold transition ${
                        viewMode === mode.key
                          ? 'bg-white text-slate-950 shadow-sm'
                          : 'text-slate-600'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              <label className="relative mt-3 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="게임, 이름, 순번 검색"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>

            <div className="space-y-5 p-4">
              {viewMode === 'games' && (
                <div className="space-y-3">
                  {visibleGames.map((game, index) => {
                    const originalIndex = lineup.games.indexOf(game);
                    const session = getLineupSession(lineup, originalIndex);
                    const previousVisibleGame = visibleGames[index - 1];
                    const previousOriginalIndex = previousVisibleGame ? lineup.games.indexOf(previousVisibleGame) : -1;
                    const shouldShowSessionHeader =
                      index === 0 || getLineupSession(lineup, previousOriginalIndex) !== session;
                    const gamePlayers = getGameLineupPlayers(lineup, game);
                    const gameRosterCount = getGameRosterCount(lineup, game);
                    const runnerPlayer = game.runner
                      ? gamePlayers.find((player) => player.order === game.runner)
                      : undefined;
                    const dutyPlayers = gamePlayers.filter((player) => Boolean(getGameDuty(game, player.order)));
                    const sessionSpecificPlayers = gamePlayers.filter((player) => {
                      const basePlayer = lineup.players.find((item) => item.order === player.order);
                      return Boolean(basePlayer?.sessionPlayers?.[session]);
                    });
                    const firstPlayer = gamePlayers[0];
                    const lastPlayer = gamePlayers[gamePlayers.length - 1];

                    return (
                      <div key={game.label} className="space-y-2">
                        {shouldShowSessionHeader && (
                          <div className={`sticky top-[57px] z-[1] flex items-center gap-2 rounded-xl border px-3 py-2 shadow-sm backdrop-blur ${getSessionHeaderClass(session)}`}>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-black ${getSessionBadgeClass(session)}`}>
                              {getSessionLabel(session)}
                            </span>
                            <span className="min-w-0 truncate text-xs font-black">
                              {getLineupSessionGameRange(lineup, session)}
                            </span>
                          </div>
                        )}

                        <article
                          className={`rounded-2xl border p-3 shadow-sm ${getSessionCardClass(session)}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black ${getSessionNumberClass(session)}`}>
                              {originalIndex + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <h3 className="text-base font-black leading-tight text-slate-950">{game.label}</h3>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${getSessionBadgeClass(session)}`}>
                                  {session === 'morning' ? '오전' : '오후'}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
                                <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800 ring-1 ring-amber-200">
                                  {game.allPlay ? '전원 참여' : `참여 ${gameRosterCount}명`}
                                </span>
                                {game.allPlay && firstPlayer && lastPlayer && (
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700 ring-1 ring-slate-200">
                                    No.{firstPlayer.order} → No.{lastPlayer.order} 순서
                                  </span>
                                )}
                                {runnerPlayer && (
                                  <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-800 ring-1 ring-rose-200">
                                    주자 No.{runnerPlayer.order} {runnerPlayer.name}
                                  </span>
                                )}
                                {dutyPlayers.length > 0 && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800 ring-1 ring-emerald-200">
                                    특임 {dutyPlayers.length}명
                                  </span>
                                )}
                                {sessionSpecificPlayers.length > 0 && (
                                  <span className="rounded-full bg-white/90 px-2 py-1 text-slate-700 ring-1 ring-slate-200">
                                    공유 순번 {sessionSpecificPlayers.map((player) => `No.${player.order} ${player.name}`).join(' · ')}
                                  </span>
                                )}
                                {gamePlayers.length === 0 && (
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500 ring-1 ring-slate-200">
                                    미정
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {game.allPlay && firstPlayer && lastPlayer ? (
                            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                              <p className="text-sm font-black text-amber-950">
                                전체 선수 {gameRosterCount}명이 순번대로 진행합니다.
                              </p>
                              <p className="mt-1 text-xs font-bold text-amber-800">
                                시작 No.{firstPlayer.order} {firstPlayer.name} · 종료 No.{lastPlayer.order} {lastPlayer.name}
                              </p>
                              {sessionSpecificPlayers.length > 0 && (
                                <p className="mt-1 text-xs font-black text-slate-700">
                                  공유 순번: {sessionSpecificPlayers.map((player) => `No.${player.order} ${player.name}`).join(' · ')}
                                </p>
                              )}
                              {runnerPlayer && (
                                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1.5 text-xs font-black text-rose-800 ring-1 ring-rose-200">
                                  <Flag className="h-3.5 w-3.5" />
                                  주자 No.{runnerPlayer.order} {runnerPlayer.name}
                                </div>
                              )}
                              {(runnerPlayer || dutyPlayers.length > 0) && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {gamePlayers.map((player) => {
                                    const role = getLineupPlayerRole(game, player.order);

                                    return (
                                      <span
                                        key={`${player.order}-${player.name}`}
                                        className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-black ${
                                          role ? getRoleBadgeClass(role) : 'bg-white text-amber-800 ring-1 ring-amber-200'
                                        }`}
                                      >
                                        {player.order}
                                        {role?.type === 'runner' && <Flag className="ml-1 h-3 w-3" />}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ) : gamePlayers.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {gamePlayers.map((player) => {
                                const playerNames = getLineupPlayerNames(player);
                                const playerParticipants = playerNames
                                  .map((name) => participantsByName.get(normalizeName(name)))
                                  .filter((participant): participant is EventParticipant => Boolean(participant));
                                const member = playerParticipants.length === 1 ? playerParticipants[0].member : undefined;
                                const role = getLineupPlayerRole(game, player.order);
                                const RoleIcon = role?.type === 'runner' ? Flag : role?.type === 'shooter' ? Target : MapPin;

                                return (
                                  <button
                                    key={`${player.order}-${player.name}`}
                                    type="button"
                                    onClick={() => member && !isPublic && onMemberClick(member.id)}
                                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition active:scale-[0.99] disabled:cursor-default ${
                                      role
                                        ? `${getRoleBadgeClass(role)} border-transparent`
                                        : 'border-amber-200 bg-amber-50 text-amber-950'
                                    }`}
                                    disabled={!member || isPublic}
                                  >
                                    <div className="relative shrink-0">
                                      <LineupPlayerAvatarGroup
                                        player={player}
                                        participantsByName={participantsByName}
                                        size="sm"
                                      />
                                      <span className="absolute -bottom-1 -right-1 rounded-full bg-slate-950 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                        {player.order}
                                      </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-black text-slate-800">
                                          No.{player.order}
                                        </span>
                                        <span className="truncate text-sm font-black text-slate-950">{player.name}</span>
                                      </div>
                                    </div>
                                    {role ? (
                                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[11px] font-black">
                                        <RoleIcon className="h-3.5 w-3.5" />
                                        {role.label}
                                      </span>
                                    ) : (
                                      <UserRoundCheck className="h-4 w-4 shrink-0" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </article>
                      </div>
                    );
                  })}
                </div>
              )}

              {viewMode === 'players' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {visiblePlayers.map((player) => {
                    const playerNames = getLineupPlayerNames(player);
                    const playerParticipants = playerNames
                      .map((name) => participantsByName.get(normalizeName(name)))
                      .filter((participant): participant is EventParticipant => Boolean(participant));
                    const member = playerParticipants.length === 1 ? playerParticipants[0].member : undefined;
                    const { assignments, runnerAssignments, dutyAssignments } = getLineupSummary(lineup, player.order);

                    return (
                      <button
                        key={`${player.order}-${player.name}`}
                        type="button"
                        onClick={() => member && !isPublic && onMemberClick(member.id)}
                        className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition active:scale-[0.99] disabled:cursor-default"
                        disabled={!member || isPublic}
                      >
                        <div className="flex items-start gap-3">
                          <div className="relative shrink-0">
                            <LineupPlayerAvatarGroup
                              player={player}
                              participantsByName={participantsByName}
                              size="md"
                            />
                            <span className="absolute -bottom-1 -right-1 rounded-full bg-slate-950 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {player.order}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-bold text-slate-950">{player.name}</span>
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                No.{player.order}
                              </span>
                            </div>
                            <p className="mt-1 text-xs font-medium text-slate-500">
                              참여 {assignments.length}개
                              {runnerAssignments.length > 0 && (
                                <span className="text-rose-600"> · 주자 {runnerAssignments.length}회</span>
                              )}
                              {dutyAssignments.length > 0 && (
                                <span className="text-emerald-600"> · 특임 {dutyAssignments.length}회</span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {assignments.map((game) => {
                            const role = getLineupPlayerRole(game, player.order);
                            return (
                              <span
                                key={game.label}
                                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getRoleBadgeClass(role)}`}
                              >
                                {role ? `${role.label} · ` : ''}
                                {game.label}
                              </span>
                            );
                          })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {viewMode === 'matrix' && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-[1120px] border-collapse text-left text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="sticky left-0 z-[2] w-44 border-b border-r border-slate-200 bg-slate-100 px-3 py-3 text-xs font-bold text-slate-700">
                          게임 조
                        </th>
                        {lineup.players.map((player) => {
                          return (
                            <th
                              key={`${player.order}-${player.name}`}
                              className="w-24 border-b border-r border-slate-200 px-2 py-3 text-center align-top last:border-r-0"
                            >
                              <div className="flex flex-col items-center gap-1.5">
                                <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[11px] font-bold text-white">
                                  No.{player.order}
                                </span>
                                <LineupPlayerAvatarGroup
                                  player={player}
                                  participantsByName={participantsByName}
                                  size="sm"
                                />
                                <span className="max-w-20 truncate text-xs font-bold text-slate-900">
                                  {player.name}
                                </span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleGames.map((game) => {
                        const session = getGameSession(lineup, game);
                        const hasPlayers = game.players.length > 0;

                        return (
                          <tr
                            key={game.label}
                            className={session === 'morning' ? 'bg-orange-50/40' : 'bg-indigo-50/40'}
                          >
                            <th className="sticky left-0 z-[1] border-r border-t border-slate-200 bg-inherit px-3 py-2.5 text-xs font-bold text-slate-800">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${getSessionBadgeClass(session)}`}>
                                    {session === 'morning' ? '오전' : '오후'}
                                  </span>
                                  <span className="min-w-0 truncate">{game.label}</span>
                                </div>
                                {!hasPlayers && (
                                  <span className="w-fit rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                    미정
                                  </span>
                                )}
                              </div>
                            </th>
                            {lineup.players.map((player) => {
                              const role = getLineupPlayerRole(game, player.order);
                              const isPlaying = Boolean(role) || game.players.includes(player.order);

                              return (
                                <td
                                  key={`${game.label}-${player.order}`}
                                  className={`h-11 border-r border-t border-slate-200 px-2 py-2 text-center last:border-r-0 ${
                                    role?.type === 'runner'
                                      ? 'bg-rose-200 text-rose-950'
                                      : role
                                        ? getDutyCellClass(role.type)
                                      : isPlaying
                                        ? 'bg-amber-100 text-amber-900'
                                        : 'bg-white text-slate-300'
                                  }`}
                                >
                                  {role ? (
                                    <span className={`inline-flex items-center justify-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${getRoleBadgeClass(role)}`}>
                                      {role.type === 'runner' ? <Flag className="h-3 w-3" /> : role.type === 'shooter' ? <Target className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                                      {role.label}
                                    </span>
                                  ) : isPlaying ? (
                                    <UserRoundCheck className="mx-auto h-4 w-4" />
                                  ) : null}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function EventDetailPage({ isPublic = false }: { isPublic?: boolean }) {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const memberProfile = useMemberProfile();

  const [event, setEvent] = useState<AwanaEvent | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamTab, setTeamTab] = useState<EventTeamTab>('sparks-team-1');

  useEffect(() => {
    if (!eventId) return;

    async function load() {
      try {
        setLoading(true);
        if (isPublic) {
          // 공개 모드: RPC로 제한된 데이터만 조회
          const result = await getPublicEvent(eventId!);
          if (result) {
            setEvent(result.event);
            setParticipants(result.participants);
          } else {
            setError('이벤트를 찾을 수 없거나 비공개 상태입니다.');
          }
        } else {
          // 인증 모드: 전체 데이터 조회
          const [ev, parts] = await Promise.all([
            getEventById(eventId!),
            getEventParticipants(eventId!),
          ]);
          setEvent(ev);
          setParticipants(parts);
        }
      } catch (err) {
        setError('이벤트를 불러오는 데 실패했습니다.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [eventId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-gray-500">{error ?? '이벤트를 찾을 수 없습니다.'}</p>
        <button
          onClick={() => navigate(-1)}
          className="text-indigo-600 font-medium"
        >
          돌아가기
        </button>
      </div>
    );
  }

  const activeTeam = TEAM_TABS.find((tab) => tab.key === teamTab) ?? TEAM_TABS[0];
  const clubTab = activeTeam.club;
  const allLineupNames = new Set(
    EVENT_LINEUPS.flatMap(getLineupMemberNameKeys)
  );
  const activeLineups = EVENT_LINEUPS.filter((lineup) => lineup.teamTab === teamTab);
  const activeLineupNames = new Set(
    activeLineups.flatMap(getLineupMemberNameKeys)
  );
  const filtered = participants.filter((p) => {
    if (p.club_type !== clubTab) return false;
    if (p.role !== 'player' || !p.member) return true;

    const memberName = normalizeName(p.member.name);
    if (activeLineups.length > 0) return activeLineupNames.has(memberName);
    if (teamTab === 'tnt-team-1') return !allLineupNames.has(memberName);
    return true;
  });
  const sparksCount = participants.filter((p) => p.club_type === 'sparks' && p.role === 'player').length;
  const tntCount = participants.filter((p) => p.club_type === 'tnt' && p.role === 'player').length;
  const sparksLineupCount = getLineupPlayerCount('sparks-team-1');
  const tntTeam1LineupCount = getLineupPlayerCount('tnt-team-1');
  const tntTeam2LineupCount = getLineupPlayerCount('tnt-team-2');
  const teamCounts: Record<EventTeamTab, number> = {
    'sparks-team-1': sparksLineupCount || sparksCount,
    'tnt-team-1': tntTeam1LineupCount || Math.max(tntCount - tntTeam2LineupCount, 0),
    'tnt-team-2': tntTeam2LineupCount || Math.max(tntCount - tntTeam1LineupCount, 0),
  };

  const players = filtered.filter((p) => p.role === 'player' && p.member);
  const coaches = filtered.filter((p) => (p.role === 'coach' || p.role === 'assistant_coach') && p.teacher);
  const observers = filtered.filter((p) => p.role === 'observer');

  // Group players by age (sparks) or gender+grade (tnt)
  const groupedPlayers: Record<string, EventParticipant[]> = {};

  if (clubTab === 'sparks') {
    // 스팍스: 한국나이 기준 그룹핑
    players.forEach((p) => {
      const birthday = p.member?.birthday;
      const key = birthday ? `${getKoreanAge(birthday)}세` : '기타';
      if (!groupedPlayers[key]) groupedPlayers[key] = [];
      groupedPlayers[key].push(p);
    });
  } else {
    // 티앤티: 성별 → 학년 기준 그룹핑
    const girls = players.filter((p) => p.member?.gender === 'F');
    const boys = players.filter((p) => p.member?.gender !== 'F');

    if (girls.length > 0) {
      const girlsByGrade: Record<string, EventParticipant[]> = {};
      girls.forEach((p) => {
        const birthday = p.member?.birthday;
        const key = birthday ? gradeLabel(getSchoolGrade(birthday)) : '기타';
        if (!girlsByGrade[key]) girlsByGrade[key] = [];
        girlsByGrade[key].push(p);
      });
      const sortedGrades = Object.keys(girlsByGrade).sort((a, b) => {
        const numA = parseInt(a); const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
        return a.localeCompare(b);
      });
      sortedGrades.forEach((grade) => {
        groupedPlayers[`👧 여자 · ${grade}`] = girlsByGrade[grade];
      });
    }

    if (boys.length > 0) {
      const boysByGrade: Record<string, EventParticipant[]> = {};
      boys.forEach((p) => {
        const birthday = p.member?.birthday;
        const key = birthday ? gradeLabel(getSchoolGrade(birthday)) : '기타';
        if (!boysByGrade[key]) boysByGrade[key] = [];
        boysByGrade[key].push(p);
      });
      const sortedGrades = Object.keys(boysByGrade).sort((a, b) => {
        const numA = parseInt(a); const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
        return a.localeCompare(b);
      });
      sortedGrades.forEach((grade) => {
        groupedPlayers[`👦 남자 · ${grade}`] = boysByGrade[grade];
      });
    }
  }

  // Sort group keys (sparks only - tnt already ordered above)
  const sortedGroupKeys = clubTab === 'sparks'
    ? Object.keys(groupedPlayers).sort((a, b) => {
        if (a === '기타') return 1;
        if (b === '기타') return -1;
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
        return a.localeCompare(b);
      })
    : Object.keys(groupedPlayers);

  // Group coaches by sub_group for T&T
  const coachGroups: Record<string, EventParticipant[]> = {};
  coaches.forEach((c) => {
    const group = c.sub_group ?? '코치진';
    if (!coachGroups[group]) coachGroups[group] = [];
    coachGroups[group].push(c);
  });

  const schedules = event.metadata?.schedules ?? [];
  const nextSchedule = getNextSchedule(schedules);
  const requirements = event.metadata?.requirements ?? [];
  const statusInfo = STATUS_LABELS[event.status] ?? STATUS_LABELS.upcoming;
  const lineups = activeLineups;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="font-semibold text-gray-900 flex-1 truncate">{event.name}</h1>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.className}`}>
          {statusInfo.text}
        </span>
      </div>

      <div className="p-4 space-y-6">
        {/* Club Tabs */}
        <div className="grid grid-cols-3 gap-2">
          {TEAM_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTeamTab(tab.key)}
              className={`min-h-11 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                teamTab === tab.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className="block truncate">{tab.label}</span>
              <span className={`block text-[11px] ${teamTab === tab.key ? 'text-indigo-100' : 'text-gray-400'}`}>
                {teamCounts[tab.key]}명
              </span>
            </button>
          ))}
        </div>

        {/* Next Schedule Highlight */}
        {nextSchedule && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-indigo-900 mb-1">📅 다음 연습</p>
            <p className="text-sm text-indigo-800">
              {nextSchedule.order}차 &nbsp;{formatDateKorean(nextSchedule.date)} {nextSchedule.time}
            </p>
            <p className="text-xs text-indigo-600 mt-0.5">
              {nextSchedule.location} · D{getDday(nextSchedule.date) === 0 ? '-Day' : `-${getDday(nextSchedule.date)}`}
            </p>
          </div>
        )}

        <GameLineupSection
          lineups={lineups}
          players={players}
          isPublic={isPublic}
          onMemberClick={memberProfile.openMemberProfile}
        />

        {/* Participants Grid */}
        {lineups.length === 0 && sortedGroupKeys.length > 0 && (
          <div className="space-y-4">
            {sortedGroupKeys.map((groupKey) => (
              <div key={groupKey}>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">{groupKey}</h3>
                <div className="grid grid-cols-4 gap-3">
                  {groupedPlayers[groupKey].map((p) => {
                    const member = p.member!;
                    const birthday = member.birthday;
                    let subLabel = '';
                    if (birthday) {
                      subLabel = clubTab === 'sparks' ? `${getKoreanAge(birthday)}세` : gradeLabel(getSchoolGrade(birthday));
                    }
                    return (
                      <button
                        key={p.id}
                        onClick={() => !isPublic && memberProfile.openMemberProfile(member.id)}
                        className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
                      >
                        <AvatarCircle name={member.name} avatarUrl={member.avatar_url} />
                        <span className="text-xs text-center text-gray-700 truncate w-full">
                          {member.name}
                        </span>
                        <span className="text-[10px] text-gray-400">{subLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Coaches Section */}
        {coaches.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">🧑‍🏫 코치진</h3>
            {Object.entries(coachGroups).map(([group, groupCoaches]) => (
              <div key={group} className="space-y-2">
                {clubTab === 'tnt' && Object.keys(coachGroups).length > 1 && (
                  <p className="text-xs text-gray-500 font-medium mt-2 first:mt-0">{group}</p>
                )}
                {groupCoaches.map((c) => {
                  const teacher = c.teacher!;
                  return (
                    <div key={c.id} className="flex items-center gap-3 py-1">
                      <AvatarCircle name={teacher.name} avatarUrl={teacher.avatar_url} size="sm" />
                      <span className="text-sm text-gray-900">
                        {teacher.name}
                        <span className="text-gray-400"> · {ROLE_LABELS[c.role] ?? c.role}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Observers Section */}
        {observers.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">👀 참관</h3>
            <div className="grid grid-cols-4 gap-3">
              {observers.map((p) => {
                const person = p.member ?? p.teacher;
                if (!person) return null;
                const name = person.name;
                const avatarUrl = person.avatar_url;
                return (
                  <div key={p.id} className="flex flex-col items-center gap-1">
                    <AvatarCircle name={name} avatarUrl={avatarUrl} />
                    <span className="text-xs text-center text-gray-700 truncate w-full">
                      {name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Full Schedule Timeline */}
        {schedules.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">📋 전체 일정</h3>
            <div className="space-y-2">
              {[...schedules]
                .sort((a, b) => a.order - b.order)
                .map((s) => {
                  const status = getScheduleStatus(s.date);
                  const dotClass =
                    status === 'today'
                      ? 'text-indigo-600'
                      : status === 'past'
                        ? 'text-gray-400'
                        : 'text-gray-900';
                  const dot = status === 'future' ? '○' : '●';
                  return (
                    <p key={s.order} className={`text-sm ${dotClass}`}>
                      {dot} {s.order}차 {formatDateKorean(s.date)} {s.time} {s.location}
                    </p>
                  );
                })}
            </div>
          </div>
        )}

        {/* Requirements Section */}
        {requirements.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">🎒 준비물</h3>
            <div className="flex flex-wrap gap-2">
              {requirements.map((item, idx) => (
                <span
                  key={idx}
                  className="bg-gray-100 rounded-full px-3 py-1 text-sm text-gray-700"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
