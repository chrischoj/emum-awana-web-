import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import {
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventParticipants,
  addParticipants,
  removeParticipant,
} from '../../services/eventService';
import { formatDateKorean, getDday } from '../../utils/dateUtils';
import type {
  AwanaEvent,
  EventParticipant,
  EventSchedule,
  EventStatus,
  Member,
  Teacher,
} from '../../types/awana';
import { supabase } from '../../lib/supabase';
import {
  Plus,
  Trash2,
  Edit3,
  Users,
  ChevronDown,
  ChevronRight,
  Calendar,
  Eye,
  EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

// ---- 유틸 ----

const STATUS_LABELS: Record<EventStatus, string> = {
  upcoming: '예정',
  active: '진행중',
  completed: '종료',
};

const STATUS_BADGE_STYLES: Record<EventStatus, string> = {
  upcoming: 'bg-gray-100 text-gray-600',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-500',
};

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ---- 메인 컴포넌트 ----

export default function EventManagement() {
  const { teacher } = useAuth();
  const { members, clubs } = useClub();
  const [events, setEvents] = useState<AwanaEvent[]>([]);
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | EventStatus>('all');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AwanaEvent | null>(null);
  const [managingParticipants, setManagingParticipants] = useState<AwanaEvent | null>(null);

  // Create/edit form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formStatus, setFormStatus] = useState<EventStatus>('upcoming');
  const [formSchedules, setFormSchedules] = useState<EventSchedule[]>([]);
  const [formRequirements, setFormRequirements] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Participant management state
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [selectedTeachers, setSelectedTeachers] = useState<Set<string>>(new Set());
  const [participantTab, setParticipantTab] = useState<'members' | 'teachers'>('members');
  const [memberClubFilter, setMemberClubFilter] = useState<string>('all');
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});
  const [teacherRoles, setTeacherRoles] = useState<Record<string, string>>({});
  const [teacherSubGroups, setTeacherSubGroups] = useState<Record<string, string>>({});
  const [savingParticipants, setSavingParticipants] = useState(false);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  // ---- 데이터 로딩 ----

  async function loadEvents() {
    try {
      const data = await getAllEvents();
      setEvents(data);
    } catch (err) {
      console.error(err);
      toast.error('이벤트 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function loadTeachers() {
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .eq('active', true);
      if (error) throw error;
      setAllTeachers((data as Teacher[]) || []);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadEvents();
    loadTeachers();
  }, []);

  // ---- 필터링 ----

  const filteredEvents =
    activeTab === 'all'
      ? events
      : events.filter((e) => e.status === activeTab);

  const statusCounts = events.reduce(
    (acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    },
    {} as Record<EventStatus, number>,
  );

  // ---- 이벤트 CRUD ----

  function resetForm() {
    setFormName('');
    setFormDescription('');
    setFormStartDate('');
    setFormEndDate('');
    setFormStatus('upcoming');
    setFormSchedules([]);
    setFormRequirements('');
  }

  function openCreateModal() {
    resetForm();
    setEditingEvent(null);
    setShowCreateModal(true);
  }

  function openEditModal(event: AwanaEvent) {
    setFormName(event.name);
    setFormDescription(event.description || '');
    setFormStartDate(event.start_date);
    setFormEndDate(event.end_date || '');
    setFormStatus(event.status);
    setFormSchedules(event.metadata?.schedules || []);
    setFormRequirements((event.metadata?.requirements || []).join(', '));
    setEditingEvent(event);
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    setShowCreateModal(false);
    setEditingEvent(null);
    resetForm();
  }

  async function handleSubmitEvent(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) {
      toast.error('이벤트명을 입력해주세요.');
      return;
    }
    if (!formStartDate) {
      toast.error('시작일을 입력해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const requirements = formRequirements
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (editingEvent) {
        await updateEvent(editingEvent.id, {
          name: trimmedName,
          description: formDescription.trim() || null,
          start_date: formStartDate,
          end_date: formEndDate || null,
          status: formStatus,
          metadata: {
            schedules: formSchedules,
            requirements,
          },
        });
        toast.success('이벤트가 수정되었습니다.');
      } else {
        await createEvent({
          name: trimmedName,
          description: formDescription.trim() || null,
          start_date: formStartDate,
          end_date: formEndDate || null,
          status: formStatus,
          visibility: true,
          metadata: {
            schedules: formSchedules,
            requirements,
          },
          created_by: teacher?.id || null,
        });
        toast.success('이벤트가 생성되었습니다.');
      }
      closeCreateModal();
      await loadEvents();
    } catch (err) {
      console.error(err);
      toast.error(editingEvent ? '수정에 실패했습니다.' : '생성에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteEvent(event: AwanaEvent) {
    if (!window.confirm(`"${event.name}" 이벤트를 삭제하시겠습니까?`)) return;
    try {
      await deleteEvent(event.id);
      toast.success('이벤트가 삭제되었습니다.');
      await loadEvents();
    } catch (err) {
      console.error(err);
      toast.error('삭제에 실패했습니다.');
    }
  }

  async function handleToggleVisibility(event: AwanaEvent) {
    try {
      await updateEvent(event.id, { visibility: !event.visibility });
      await loadEvents();
      toast.success(event.visibility ? '이벤트가 숨겨졌습니다.' : '이벤트가 표시됩니다.');
    } catch (err) {
      console.error(err);
      toast.error('변경에 실패했습니다.');
    }
  }

  // ---- 일정 관리 ----

  function addScheduleRow() {
    setFormSchedules((prev) => [
      ...prev,
      { order: prev.length + 1, date: '', time: '', location: '' },
    ]);
  }

  function updateScheduleRow(index: number, field: keyof EventSchedule, value: string | number) {
    setFormSchedules((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  }

  function removeScheduleRow(index: number) {
    setFormSchedules((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })),
    );
  }

  // ---- 참가자 관리 ----

  function getClubTypeById(clubId: string | null): 'sparks' | 'tnt' {
    if (!clubId) return 'sparks';
    const club = clubs.find((c) => c.id === clubId);
    return (club?.type as 'sparks' | 'tnt') || 'sparks';
  }

  async function openParticipantModal(event: AwanaEvent) {
    setManagingParticipants(event);
    setParticipantTab('members');
    setMemberClubFilter('all');
    setSelectedMembers(new Set());
    setSelectedTeachers(new Set());
    setMemberRoles({});
    setTeacherRoles({});
    setTeacherSubGroups({});
    setLoadingParticipants(true);

    try {
      const data = await getEventParticipants(event.id);
      setParticipants(data);
    } catch (err) {
      console.error(err);
      toast.error('참가자 목록을 불러오지 못했습니다.');
      setParticipants([]);
    } finally {
      setLoadingParticipants(false);
    }
  }

  function closeParticipantModal() {
    setManagingParticipants(null);
    setParticipants([]);
    setSelectedMembers(new Set());
    setSelectedTeachers(new Set());
  }

  function toggleMemberSelection(memberId: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }

  function toggleTeacherSelection(teacherId: string) {
    setSelectedTeachers((prev) => {
      const next = new Set(prev);
      if (next.has(teacherId)) {
        next.delete(teacherId);
      } else {
        next.add(teacherId);
      }
      return next;
    });
  }

  const existingMemberIds = new Set(participants.filter((p) => p.member_id).map((p) => p.member_id!));
  const existingTeacherIds = new Set(participants.filter((p) => p.teacher_id).map((p) => p.teacher_id!));

  const filteredMembers =
    memberClubFilter === 'all'
      ? members.filter((m) => m.enrollment_status === 'active')
      : members.filter(
          (m) =>
            m.enrollment_status === 'active' &&
            getClubTypeById(m.club_id) === memberClubFilter,
        );

  async function handleSaveParticipants() {
    if (!managingParticipants) return;
    setSavingParticipants(true);

    try {
      const newParticipants: Array<{
        member_id?: string;
        teacher_id?: string;
        club_type: 'sparks' | 'tnt';
        role: string;
        sub_group?: string;
      }> = [];

      // 새로 추가할 학생
      for (const memberId of selectedMembers) {
        if (!existingMemberIds.has(memberId)) {
          const member = members.find((m) => m.id === memberId);
          newParticipants.push({
            member_id: memberId,
            club_type: getClubTypeById(member?.club_id || null),
            role: memberRoles[memberId] || 'player',
          });
        }
      }

      // 새로 추가할 교사
      for (const teacherId of selectedTeachers) {
        if (!existingTeacherIds.has(teacherId)) {
          const t = allTeachers.find((t) => t.id === teacherId);
          newParticipants.push({
            teacher_id: teacherId,
            club_type: getClubTypeById(t?.club_id || null),
            role: teacherRoles[teacherId] || 'coach',
            sub_group: teacherSubGroups[teacherId] || undefined,
          });
        }
      }

      if (newParticipants.length > 0) {
        await addParticipants(managingParticipants.id, newParticipants);
        toast.success(`${newParticipants.length}명이 추가되었습니다.`);
      } else {
        toast.success('변경사항이 없습니다.');
      }

      // 참가자 목록 새로고침
      const updated = await getEventParticipants(managingParticipants.id);
      setParticipants(updated);
      setSelectedMembers(new Set());
      setSelectedTeachers(new Set());
      await loadEvents();
    } catch (err) {
      console.error(err);
      toast.error('참가자 저장에 실패했습니다.');
    } finally {
      setSavingParticipants(false);
    }
  }

  async function handleRemoveParticipant(participant: EventParticipant) {
    const name = participant.member?.name || participant.teacher?.name || '참가자';
    if (!window.confirm(`${name}을(를) 참가자에서 제거하시겠습니까?`)) return;

    try {
      await removeParticipant(participant.id);
      toast.success(`${name}이(가) 제거되었습니다.`);
      if (managingParticipants) {
        const updated = await getEventParticipants(managingParticipants.id);
        setParticipants(updated);
        await loadEvents();
      }
    } catch (err) {
      console.error(err);
      toast.error('제거에 실패했습니다.');
    }
  }

  // ---- 참가자 수 (events 목록에서) ----

  function getParticipantCount(event: AwanaEvent): string {
    // metadata에 count가 없으므로 placeholder; 실제로는 별도 쿼리 필요
    // 여기서는 카드에서 표시하지 않거나 간략 처리
    return '';
  }

  // ---- 렌더링 ----

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">이벤트 관리</h1>
        <Button variant="primary" size="sm" onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-1" />
          새 이벤트
        </Button>
      </div>

      {/* 상태 탭 */}
      <div className="flex gap-2">
        {(
          [
            { key: 'all' as const, label: '전체' },
            { key: 'upcoming' as const, label: `예정(${statusCounts.upcoming || 0})` },
            { key: 'active' as const, label: `진행중(${statusCounts.active || 0})` },
            { key: 'completed' as const, label: `종료(${statusCounts.completed || 0})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 이벤트 목록 */}
      {filteredEvents.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">등록된 이벤트가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🏅</span>
                    <h3 className="font-semibold text-gray-900 truncate">
                      {event.name}
                    </h3>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE_STYLES[event.status]}`}
                    >
                      {STATUS_LABELS[event.status]}
                    </span>
                    {!event.visibility && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                        숨김
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {formatShortDate(event.start_date)}
                    {event.end_date && ` ~ ${formatShortDate(event.end_date)}`}
                    {event.description && (
                      <span className="ml-2 text-gray-400">· {event.description}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openParticipantModal(event)}
                >
                  <Users className="w-4 h-4 mr-1" />
                  참가자 관리
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditModal(event)}
                >
                  <Edit3 className="w-4 h-4 mr-1" />
                  수정
                </Button>
                <button
                  onClick={() => handleToggleVisibility(event)}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title={event.visibility ? '숨기기' : '표시하기'}
                >
                  {event.visibility ? (
                    <Eye className="w-4 h-4" />
                  ) : (
                    <EyeOff className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => handleDeleteEvent(event)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 생성/수정 모달 */}
      <Modal
        open={showCreateModal}
        onClose={closeCreateModal}
        title={editingEvent ? '이벤트 수정' : '새 이벤트'}
        className="max-w-lg"
      >
        <form onSubmit={handleSubmitEvent} className="space-y-4">
          {/* 이벤트명 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이벤트명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="예: 2026 어와나 올림픽"
            />
          </div>

          {/* 설명 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              설명
            </label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="이벤트에 대한 간단한 설명"
            />
          </div>

          {/* 날짜 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                시작일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                종료일
              </label>
              <input
                type="date"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* 상태 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              상태
            </label>
            <select
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value as EventStatus)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="upcoming">예정</option>
              <option value="active">진행중</option>
              <option value="completed">종료</option>
            </select>
          </div>

          {/* 일정 배열 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                일정
              </label>
              <button
                type="button"
                onClick={addScheduleRow}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                + 일정 추가
              </button>
            </div>
            {formSchedules.length === 0 ? (
              <p className="text-xs text-gray-400">등록된 일정이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {formSchedules.map((schedule, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 bg-gray-50 rounded-lg p-2"
                  >
                    <span className="text-xs text-gray-400 w-6 text-center shrink-0">
                      {schedule.order}
                    </span>
                    <input
                      type="date"
                      value={schedule.date}
                      onChange={(e) =>
                        updateScheduleRow(index, 'date', e.target.value)
                      }
                      className="flex-1 min-w-0 rounded border border-gray-300 px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                    <input
                      type="text"
                      value={schedule.time}
                      onChange={(e) =>
                        updateScheduleRow(index, 'time', e.target.value)
                      }
                      placeholder="시간"
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                    <input
                      type="text"
                      value={schedule.location}
                      onChange={(e) =>
                        updateScheduleRow(index, 'location', e.target.value)
                      }
                      placeholder="장소"
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeScheduleRow(index)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 준비물 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              준비물
            </label>
            <input
              type="text"
              value={formRequirements}
              onChange={(e) => setFormRequirements(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="쉼표로 구분 (예: 운동화, 물통, 수건)"
            />
          </div>

          {/* 버튼 */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={closeCreateModal}
            >
              취소
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={submitting}
            >
              {editingEvent ? '수정' : '생성'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 참가자 관리 모달 */}
      <Modal
        open={!!managingParticipants}
        onClose={closeParticipantModal}
        title={`참가자 관리 - ${managingParticipants?.name || ''}`}
        className="max-w-2xl"
      >
        {loadingParticipants ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* 기존 참가자 목록 */}
            {participants.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  현재 참가자 ({participants.length}명)
                </h4>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {participants.map((p) => {
                    const name = p.member?.name || p.teacher?.name || '알 수 없음';
                    const type = p.member_id ? '학생' : '교사';
                    const roleLabel =
                      p.role === 'player'
                        ? '선수'
                        : p.role === 'observer'
                          ? '참관'
                          : p.role === 'coach'
                            ? '코치'
                            : p.role === 'assistant_coach'
                              ? '보조코치'
                              : p.role;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900">{name}</span>
                          <span className="text-xs text-gray-400">({type})</span>
                          <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                            {roleLabel}
                          </span>
                          {p.sub_group && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                              {p.sub_group}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveParticipant(p)}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 탭: 학생 / 교사 */}
            <div className="flex gap-2 border-b border-gray-200 pb-0">
              {(
                [
                  { key: 'members' as const, label: '학생 선택' },
                  { key: 'teachers' as const, label: '교사 선택' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setParticipantTab(tab.key)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    participantTab === tab.key
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 학생 선택 탭 */}
            {participantTab === 'members' && (
              <div className="space-y-3">
                {/* 클럽 필터 */}
                <div className="flex gap-2">
                  {[
                    { key: 'all', label: '전체' },
                    { key: 'sparks', label: '스팍스' },
                    { key: 'tnt', label: '티앤티' },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setMemberClubFilter(f.key)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        memberClubFilter === f.key
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* 학생 체크리스트 */}
                <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {filteredMembers.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      해당 클럽의 학생이 없습니다.
                    </p>
                  ) : (
                    filteredMembers.map((member) => {
                      const alreadyAdded = existingMemberIds.has(member.id);
                      const isSelected = selectedMembers.has(member.id);
                      const clubType = getClubTypeById(member.club_id);
                      const clubLabel = clubType === 'sparks' ? '스팍스' : '티앤티';

                      return (
                        <div
                          key={member.id}
                          className={`flex items-center justify-between px-3 py-2 ${
                            alreadyAdded ? 'bg-gray-50' : ''
                          }`}
                        >
                          <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                            {alreadyAdded ? (
                              <span className="text-green-500 text-sm">✓</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleMemberSelection(member.id)}
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            )}
                            <span className="text-sm text-gray-900 truncate">
                              {member.name}
                            </span>
                            <span className="text-xs text-gray-400 shrink-0">
                              ({clubLabel})
                            </span>
                          </label>
                          {!alreadyAdded && isSelected && (
                            <select
                              value={memberRoles[member.id] || 'player'}
                              onChange={(e) =>
                                setMemberRoles((prev) => ({
                                  ...prev,
                                  [member.id]: e.target.value,
                                }))
                              }
                              className="text-xs rounded border border-gray-300 px-1.5 py-1 ml-2"
                            >
                              <option value="player">선수</option>
                              <option value="observer">참관</option>
                            </select>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* 교사 선택 탭 */}
            {participantTab === 'teachers' && (
              <div className="space-y-3">
                <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {allTeachers.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      등록된 교사가 없습니다.
                    </p>
                  ) : (
                    allTeachers.map((t) => {
                      const alreadyAdded = existingTeacherIds.has(t.id);
                      const isSelected = selectedTeachers.has(t.id);

                      return (
                        <div
                          key={t.id}
                          className={`flex items-center justify-between px-3 py-2 ${
                            alreadyAdded ? 'bg-gray-50' : ''
                          }`}
                        >
                          <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                            {alreadyAdded ? (
                              <span className="text-green-500 text-sm">✓</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleTeacherSelection(t.id)}
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            )}
                            <span className="text-sm text-gray-900 truncate">
                              {t.name}
                            </span>
                            {t.position && (
                              <span className="text-xs text-gray-400 shrink-0">
                                ({t.position})
                              </span>
                            )}
                          </label>
                          {!alreadyAdded && isSelected && (
                            <div className="flex items-center gap-2 ml-2">
                              <select
                                value={teacherRoles[t.id] || 'coach'}
                                onChange={(e) =>
                                  setTeacherRoles((prev) => ({
                                    ...prev,
                                    [t.id]: e.target.value,
                                  }))
                                }
                                className="text-xs rounded border border-gray-300 px-1.5 py-1"
                              >
                                <option value="coach">코치</option>
                                <option value="assistant_coach">보조코치</option>
                              </select>
                              <input
                                type="text"
                                value={teacherSubGroups[t.id] || ''}
                                onChange={(e) =>
                                  setTeacherSubGroups((prev) => ({
                                    ...prev,
                                    [t.id]: e.target.value,
                                  }))
                                }
                                placeholder="소그룹"
                                className="w-20 text-xs rounded border border-gray-300 px-1.5 py-1"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* 저장 버튼 */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={closeParticipantModal}
              >
                닫기
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={savingParticipants}
                onClick={handleSaveParticipants}
              >
                선택 추가
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
