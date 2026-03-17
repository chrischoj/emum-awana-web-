import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { AvatarUpload } from '../../components/ui/AvatarUpload';
import { Avatar } from '../../components/ui/Avatar';
import type { Member, EnrollmentStatus } from '../../types/awana';

// ---- 유틸 ----

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear().toString().slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const UNIFORM_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

type TabKey = EnrollmentStatus;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: '승인 대기' },
  { key: 'active', label: '활동 중' },
  { key: 'inactive', label: '비활성' },
];

// ---- 등록 모달 ----

interface RegisterModalProps {
  open: boolean;
  onClose: () => void;
  onRegistered: () => void;
  clubId: string;
  clubs: { id: string; name: string; type: string }[];
  teacherId: string | null;
}

function RegisterModal({ open, onClose, onRegistered, clubId, clubs, teacherId }: RegisterModalProps) {
  const [formName, setFormName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [uniformSize, setUniformSize] = useState('');
  const [selectedClubId, setSelectedClubId] = useState(clubId);
  const [submitting, setSubmitting] = useState(false);
  // 2단계: 등록 후 사진 업로드
  const [registeredMember, setRegisteredMember] = useState<{ id: string; name: string } | null>(null);

  function resetForm() {
    setFormName('');
    setBirthday('');
    setParentName('');
    setParentPhone('');
    setUniformSize('');
    setSelectedClubId(clubId);
    setRegisteredMember(null);
  }

  function handleClose() {
    resetForm();
    onClose();
    if (registeredMember) onRegistered();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) {
      toast.error('이름을 입력해주세요.');
      return;
    }

    setSubmitting(true);

    // 중복 체크: 같은 클럽 내 이름 + 생년월일이 동일한 멤버가 있는지 확인
    let dupQuery = supabase
      .from('members')
      .select('id, name, enrollment_status')
      .eq('club_id', selectedClubId)
      .eq('name', trimmedName);

    if (birthday) {
      dupQuery = dupQuery.eq('birthday', birthday);
    } else {
      dupQuery = dupQuery.is('birthday', null);
    }

    const { data: existing } = await dupQuery;

    if (existing && existing.length > 0) {
      const dup = existing[0];

      if (dup.enrollment_status === 'inactive') {
        // 거부/비활성 멤버 → 재등록(pending)으로 복원
        const { error } = await supabase
          .from('members')
          .update({
            enrollment_status: 'pending',
            active: true,
            parent_name: parentName.trim() || null,
            parent_phone: parentPhone.trim() || null,
            uniform_size: uniformSize || null,
            registered_by: teacherId || null,
          })
          .eq('id', dup.id);

        if (error) {
          toast.error('재등록 실패: ' + error.message);
        } else {
          toast.success(`${dup.name}을(를) 다시 등록했습니다.`);
          setRegisteredMember({ id: dup.id, name: dup.name });
          onRegistered();
        }
        setSubmitting(false);
        return;
      }

      // pending 또는 active 상태의 멤버가 이미 존재
      const statusLabel = dup.enrollment_status === 'pending' ? '승인 대기 중' : '활동 중';
      toast.error(`이미 ${statusLabel}인 동명의 클럽원이 있습니다.`);
      setSubmitting(false);
      return;
    }

    // 중복 없음 → 신규 등록
    const { data, error } = await supabase.from('members').insert({
      club_id: selectedClubId,
      name: trimmedName,
      birthday: birthday || null,
      parent_name: parentName.trim() || null,
      parent_phone: parentPhone.trim() || null,
      uniform_size: uniformSize || null,
      enrollment_status: 'pending',
      registered_by: teacherId || null,
      active: true,
    }).select('id, name').single();

    if (error) {
      toast.error('등록 실패: ' + error.message);
    } else {
      toast.success('클럽원이 등록되었습니다');
      setRegisteredMember(data);
      onRegistered();
    }
    setSubmitting(false);
  }

  async function handleAvatarUpload(url: string) {
    if (!registeredMember) return;
    const { error } = await supabase
      .from('members')
      .update({ avatar_url: url })
      .eq('id', registeredMember.id);
    if (error) {
      toast.error('사진 저장 실패');
      return;
    }
    toast.success('사진이 저장되었습니다');
    onRegistered();
  }

  // 2단계: 사진 업로드 화면
  if (registeredMember) {
    return (
      <Modal open={open} onClose={handleClose} title="프로필 사진 등록">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 text-center">
            <span className="font-semibold">{registeredMember.name}</span> 클럽원의 프로필 사진을 등록하세요.
          </p>
          <div className="flex justify-center py-2">
            <AvatarUpload
              currentUrl={null}
              name={registeredMember.name}
              folder="members"
              entityId={registeredMember.id}
              onUpload={handleAvatarUpload}
              size="lg"
            />
          </div>
          <div className="flex justify-center pt-2">
            <Button variant="secondary" onClick={handleClose}>
              건너뛰기
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={handleClose} title="클럽원 등록">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            소속 클럽 <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedClubId}
            onChange={(e) => setSelectedClubId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name} ({club.type === 'sparks' ? 'Sparks' : 'T&T'})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            이름 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="클럽원 이름"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">생년월일</label>
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">보호자 이름</label>
          <input
            type="text"
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="보호자 이름"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">보호자 연락처</label>
          <input
            type="tel"
            value={parentPhone}
            onChange={(e) => setParentPhone(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="010-0000-0000"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">유니폼 사이즈</label>
          <select
            value={uniformSize}
            onChange={(e) => setUniformSize(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">선택 안함</option>
            {UNIFORM_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            취소
          </Button>
          <Button type="submit" isLoading={submitting}>
            등록
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---- 멤버 카드 ----

interface MemberCardProps {
  member: Member;
  tab: TabKey;
  clubs: { id: string; name: string; type: string }[];
  onAction: () => void;
  onAvatarClick: (member: Member) => void;
}

function MemberCard({ member, tab, clubs, onAction, onAvatarClick }: MemberCardProps) {
  const { teacher } = useAuth();
  const [loading, setLoading] = useState(false);

  const currentClubName = clubs.find((c) => c.id === member.club_id)?.name;

  async function handleChangeClub(newClubId: string) {
    if (newClubId === member.club_id) return;
    const targetClub = clubs.find((c) => c.id === newClubId);
    setLoading(true);
    const { error } = await supabase
      .from('members')
      .update({ club_id: newClubId, team_id: null })
      .eq('id', member.id);

    if (error) {
      toast.error('클럽 변경 실패: ' + error.message);
    } else {
      toast.success(`${member.name}을(를) ${targetClub?.name ?? ''}(으)로 이동했습니다.`);
      onAction();
    }
    setLoading(false);
  }

  async function handleApprove() {
    setLoading(true);
    const { error } = await supabase
      .from('members')
      .update({
        enrollment_status: 'active',
        approved_by: teacher?.id || null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', member.id);

    if (error) {
      toast.error('승인 실패: ' + error.message);
    } else {
      toast.success(`${member.name}을(를) 승인했습니다.`);
      onAction();
    }
    setLoading(false);
  }

  async function handleReject() {
    setLoading(true);
    const { error } = await supabase
      .from('members')
      .update({ enrollment_status: 'inactive' })
      .eq('id', member.id);

    if (error) {
      toast.error('거부 실패: ' + error.message);
    } else {
      toast.success(`${member.name}을(를) 거부했습니다.`);
      onAction();
    }
    setLoading(false);
  }

  async function handleDeactivate() {
    setLoading(true);
    const { error } = await supabase
      .from('members')
      .update({ enrollment_status: 'inactive', active: false })
      .eq('id', member.id);

    if (error) {
      toast.error('비활성화 실패: ' + error.message);
    } else {
      toast.success(`${member.name}을(를) 비활성화했습니다.`);
      onAction();
    }
    setLoading(false);
  }

  async function handleReactivate() {
    setLoading(true);
    const { error } = await supabase
      .from('members')
      .update({ enrollment_status: 'active', active: true })
      .eq('id', member.id);

    if (error) {
      toast.error('재활성화 실패: ' + error.message);
    } else {
      toast.success(`${member.name}을(를) 재활성화했습니다.`);
      onAction();
    }
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <button onClick={() => onAvatarClick(member)} className="shrink-0">
              <Avatar name={member.name} src={member.avatar_url} size="md" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{member.name}</p>
              {member.birthday && (
                <p className="text-xs text-gray-500">{formatDate(member.birthday)}</p>
              )}
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-2">
            {loading ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
            ) : (
              <>
                {tab === 'pending' && (
                  <>
                    <Button size="sm" onClick={handleApprove}>
                      승인
                    </Button>
                    <Button size="sm" variant="danger" onClick={handleReject}>
                      거부
                    </Button>
                  </>
                )}
                {tab === 'active' && (
                  <Button size="sm" variant="ghost" onClick={handleDeactivate}>
                    비활성화
                  </Button>
                )}
                {tab === 'inactive' && (
                  <Button size="sm" variant="secondary" onClick={handleReactivate}>
                    재활성화
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* 상세 정보 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            클럽:
            <select
              value={member.club_id || ''}
              onChange={(e) => handleChangeClub(e.target.value)}
              disabled={loading}
              className="text-xs font-medium text-gray-700 bg-transparent border-b border-gray-300 focus:border-indigo-500 focus:outline-none cursor-pointer py-0 px-0.5"
            >
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </span>
          {member.parent_name && (
            <span>보호자: {member.parent_name}</span>
          )}
          {member.parent_phone && (
            <span>연락처: {member.parent_phone}</span>
          )}
          {member.uniform_size && (
            <span>유니폼: {member.uniform_size}</span>
          )}
          <span>등록일: {formatDate(member.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

// ---- 메인 페이지 ----

export default function MemberManagement() {
  const { clubs, refreshMembers } = useClub();
  const { teacher } = useAuth();

  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [filterClubId, setFilterClubId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [showRegister, setShowRegister] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editAvatarMember, setEditAvatarMember] = useState<Member | null>(null);

  const loadMembers = async () => {
    let query = supabase
      .from('members')
      .select('*')
      .order('created_at', { ascending: false });

    if (filterClubId) {
      query = query.eq('club_id', filterClubId);
    }

    const { data, error } = await query;

    if (error) {
      toast.error('멤버 로드 실패');
      return;
    }
    setAllMembers((data as Member[]) || []);
  };

  useEffect(() => {
    setLoading(true);
    loadMembers().finally(() => setLoading(false));
  }, [filterClubId]);

  const filteredMembers = allMembers.filter((m) => m.enrollment_status === activeTab);

  const countByStatus = (status: TabKey) =>
    allMembers.filter((m) => m.enrollment_status === status).length;

  function handleAction() {
    loadMembers();
    refreshMembers();
  }

  const handleMemberAvatarUpload = async (url: string) => {
    if (!editAvatarMember) return;
    const { error } = await supabase
      .from('members')
      .update({ avatar_url: url })
      .eq('id', editAvatarMember.id);
    if (error) {
      toast.error('사진 저장 실패');
      return;
    }
    setEditAvatarMember(null);
    await loadMembers();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const emptyMessages: Record<TabKey, string> = {
    pending: '승인 대기 중인 클럽원이 없습니다.',
    active: '활동 중인 클럽원이 없습니다.',
    inactive: '비활성 클럽원이 없습니다.',
  };

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">클럽원 관리</h1>
        <Button onClick={() => setShowRegister(true)}>클럽원 등록</Button>
      </div>

      {/* 클럽 필터 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilterClubId(null)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filterClubId === null
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          모두
        </button>
        {clubs.map((club) => (
          <button
            key={club.id}
            onClick={() => setFilterClubId(club.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterClubId === club.id
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {club.name}
          </button>
        ))}
      </div>

      {/* 상태 탭 */}
      <div className="flex gap-2 mb-6">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
            <span
              className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
                activeTab === key
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {countByStatus(key)}
            </span>
          </button>
        ))}
      </div>

      {/* 멤버 리스트 */}
      {filteredMembers.length === 0 ? (
        <p className="text-gray-500 text-center py-10">{emptyMessages[activeTab]}</p>
      ) : (
        <div className="space-y-3">
          {filteredMembers.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              tab={activeTab}
              clubs={clubs}
              onAction={handleAction}
              onAvatarClick={setEditAvatarMember}
            />
          ))}
        </div>
      )}

      {/* 등록 모달 */}
      <RegisterModal
        open={showRegister}
        onClose={() => setShowRegister(false)}
        onRegistered={handleAction}
        clubId={filterClubId || clubs[0]?.id || ''}
        clubs={clubs}
        teacherId={teacher?.id || null}
      />

      {/* 아바타 편집 모달 */}
      <Modal
        open={!!editAvatarMember}
        onClose={() => setEditAvatarMember(null)}
        title="프로필 사진"
      >
        {editAvatarMember && (
          <div className="flex justify-center py-4">
            <AvatarUpload
              currentUrl={editAvatarMember.avatar_url}
              name={editAvatarMember.name}
              folder="members"
              entityId={editAvatarMember.id}
              onUpload={handleMemberAvatarUpload}
              size="lg"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
