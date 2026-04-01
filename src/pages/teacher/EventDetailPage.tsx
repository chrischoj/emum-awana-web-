import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import { getEventById, getEventParticipants, getPublicEvent } from '../../services/eventService';
import { getKoreanAge, getSchoolGrade, gradeLabel, formatDateKorean, getDday } from '../../utils/dateUtils';
import type { AwanaEvent, EventParticipant, EventSchedule } from '../../types/awana';
import { ArrowLeft } from 'lucide-react';

type ClubTab = 'sparks' | 'tnt';

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

export default function EventDetailPage({ isPublic = false }: { isPublic?: boolean }) {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const memberProfile = useMemberProfile();

  const [event, setEvent] = useState<AwanaEvent | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clubTab, setClubTab] = useState<ClubTab>('sparks');

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

  const filtered = participants.filter((p) => p.club_type === clubTab);
  const sparksCount = participants.filter((p) => p.club_type === 'sparks').length;
  const tntCount = participants.filter((p) => p.club_type === 'tnt').length;

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
        <div className="flex gap-2">
          <button
            onClick={() => setClubTab('sparks')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              clubTab === 'sparks'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            🔴 스팍스 ({sparksCount})
          </button>
          <button
            onClick={() => setClubTab('tnt')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              clubTab === 'tnt'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            🟢 티앤티 ({tntCount})
          </button>
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

        {/* Participants Grid */}
        {sortedGroupKeys.length > 0 && (
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
