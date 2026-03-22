import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Camera, RefreshCw, UserPlus, Key, ChevronDown, ChevronRight, Phone, Gamepad2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { AvatarUpload } from '../../components/ui/AvatarUpload';
import { Switch } from '../../components/ui/Switch';
import { getAllAssignmentsByClub, createAssignment, endAssignment, deleteAssignment } from '../../services/assignmentService';
import { formatPhone, getInitialPassword } from '../../utils/phone';
import { PositionInput } from '../../components/ui/PositionInput';
import { POSITION_PRESETS } from '../../constants/positions';
import { groupTeachersByCategory, isLeader } from '../../constants/teacherCategories';
import type { Teacher, ActiveTeacherAssignment, AssignmentType, Room } from '../../types/awana';

type ClubFilterKey = 'all' | 'sparks' | 'tnt' | 'unassigned';

const CLUB_FILTER_TABS: { key: ClubFilterKey; label: string }[] = [
  { key: 'all', label: '모두' },
  { key: 'sparks', label: '스팍스' },
  { key: 'tnt', label: '티앤티' },
  { key: 'unassigned', label: '그 외' },
];

// 관리자 세션에 영향을 주지 않는 별도 클라이언트
const authOnlySupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ---- 유틸 ----

function clubTypeLabel(clubId: string, clubs: { id: string; type: string }[]): string {
  const club = clubs.find((c) => c.id === clubId);
  if (!club) return '';
  return club.type === 'sparks' ? '스팍스' : 'T&T';
}

// ---- 교사 카드 ----

interface TeacherCardProps {
  teacher: Teacher;
  clubs: { id: string; name: string; type: string }[];
  assignments: ActiveTeacherAssignment[];
  onAction: () => void;
  onAvatarClick: (teacher: Teacher) => void;
  onManageAssignment: (teacher: Teacher) => void;
}

function TeacherCard({ teacher, clubs, assignments, onAction, onAvatarClick, onManageAssignment }: TeacherCardProps) {
  const [loading, setLoading] = useState(false);
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [tempPosition, setTempPosition] = useState(teacher.position || '');

  async function handleChangePosition(newPosition: string) {
    setLoading(true);
    const { error } = await supabase
      .from('teachers')
      .update({ position: newPosition || null })
      .eq('id', teacher.id);
    if (error) {
      toast.error('직책 변경 실패');
    } else {
      toast.success('직책이 변경되었습니다.');
      onAction();
    }
    setLoading(false);
  }

  async function handleChangeClub(newClubId: string) {
    setLoading(true);
    const { error } = await supabase
      .from('teachers')
      .update({ club_id: newClubId || null })
      .eq('id', teacher.id);
    if (error) {
      toast.error('클럽 변경 실패');
    } else {
      toast.success('소속 클럽이 변경되었습니다.');
      onAction();
    }
    setLoading(false);
  }

  async function handleDeactivate() {
    setLoading(true);
    const { error } = await supabase
      .from('teachers')
      .update({ active: false })
      .eq('id', teacher.id);
    if (error) {
      toast.error('비활성화 실패');
    } else {
      toast.success(`${teacher.name}을(를) 비활성화했습니다.`);
      onAction();
    }
    setLoading(false);
  }

  async function handleActivate() {
    setLoading(true);
    const { error } = await supabase
      .from('teachers')
      .update({ active: true })
      .eq('id', teacher.id);
    if (error) {
      toast.error('활성화 실패');
    } else {
      toast.success(`${teacher.name}을(를) 활성화했습니다.`);
      onAction();
    }
    setLoading(false);
  }

  async function handleToggleGameAssistant(value: boolean) {
    setLoading(true);
    const { error } = await supabase
      .from('teachers')
      .update({ is_game_assistant: value })
      .eq('id', teacher.id);
    if (error) {
      toast.error('게임 보조 변경 실패');
    } else {
      toast.success(value ? `${teacher.name}을(를) 게임 보조로 지정했습니다.` : `${teacher.name}의 게임 보조를 해제했습니다.`);
      onAction();
    }
    setLoading(false);
  }

  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-all duration-200 ${
      teacher.active
        ? 'border-gray-200 shadow-sm'
        : 'border-gray-100 opacity-50 grayscale hover:opacity-70 hover:grayscale-0'
    }`}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          {/* 아바타 - 클릭 시 사진 변경 */}
          <button
            onClick={() => onAvatarClick(teacher)}
            className="shrink-0 group relative"
            title="프로필 사진 변경"
          >
            <Avatar name={teacher.name} src={teacher.avatar_url} size="lg" />
            <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <Camera className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>

          {/* 이름 + 상태 뱃지 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-gray-900 truncate">{teacher.name}</p>
              <Badge variant={teacher.active ? 'success' : 'absent'}>
                {teacher.active ? '활성' : '비활성'}
              </Badge>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              {teacher.phone && (
                <a
                  href={`tel:${teacher.phone.replace(/[^0-9]/g, '')}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 text-xs text-gray-500 hover:text-indigo-600 active:text-indigo-700 transition-colors"
                >
                  <Phone className="w-3 h-3" />
                  {formatPhone(teacher.phone)}
                </a>
              )}
              {teacher.user_id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const loginId = teacher.phone?.replace(/[^0-9]/g, '') || teacher.name;
                    const initialPw = teacher.phone ? getInitialPassword(teacher.phone) : '(미등록)';
                    toast(`로그인: ${loginId}\n초기 비밀번호: ${initialPw} (뒷8자리)`, { icon: '🔑', duration: 5000 });
                  }}
                  className="text-gray-300 hover:text-indigo-500 transition-colors"
                  title="로그인 정보"
                >
                  <Key className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* 직책 드롭다운 + 토글 버튼 */}
          <div className="flex items-center gap-2 shrink-0">
            {loading ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
            ) : (
              <>
                <button
                  onClick={() => { setTempPosition(teacher.position || ''); setShowPositionModal(true); }}
                  disabled={loading}
                  className={`text-xs font-medium rounded-md px-2 py-1 border transition-colors truncate max-w-[6rem] ${
                    teacher.position
                      ? 'text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100'
                      : 'text-gray-400 bg-transparent border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {teacher.position || '직책'}
                </button>
                <Switch
                  checked={teacher.active}
                  onChange={(checked) => checked ? handleActivate() : handleDeactivate()}
                  disabled={loading}
                  size="sm"
                  label={teacher.active ? '비활성화' : '활성화'}
                />
              </>
            )}
          </div>
        </div>

        {/* 하단: 클럽 선택 + 게임 보조 */}
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <span>클럽:</span>
          <select
            value={teacher.club_id || ''}
            onChange={(e) => handleChangeClub(e.target.value)}
            disabled={loading}
            className="text-xs font-medium text-gray-700 bg-transparent border-b border-gray-300 focus:border-indigo-500 focus:outline-none cursor-pointer py-0 px-0.5"
          >
            <option value="">없음(그 외)</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="mx-1 text-gray-300">|</span>
          <button
            onClick={() => handleToggleGameAssistant(!teacher.is_game_assistant)}
            disabled={loading}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
              teacher.is_game_assistant
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
            }`}
            title={teacher.is_game_assistant ? '게임 보조 해제' : '게임 보조 지정'}
          >
            <Gamepad2 className="w-3 h-3" />
            게임보조
          </button>
        </div>

        {/* 담임 배정 정보 */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {assignments.length === 0 ? (
            <span className="text-xs text-gray-400 italic">미배정</span>
          ) : (
            assignments.map((a) => {
              const typeTag = clubTypeLabel(a.club_id, clubs);
              return (
                <span
                  key={a.id}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    a.assignment_type === 'primary' ? 'text-white' : 'border'
                  }`}
                  style={
                    a.assignment_type === 'primary'
                      ? { backgroundColor: a.team_color }
                      : { borderColor: a.team_color, color: a.team_color }
                  }
                >
                  {a.room_name} · {a.assignment_type === 'primary' ? '담임' : '임시 담임(지원)'}
                  {a.assignment_type === 'temporary' && a.end_date && (
                    <span className="opacity-70"> (~{a.end_date})</span>
                  )}
                </span>
              );
            })
          )}
          <button
            onClick={() => onManageAssignment(teacher)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium ml-1"
          >
            배정관리
          </button>
        </div>
      </div>

      {/* 직책 편집 모달 */}
      <Modal
        open={showPositionModal}
        onClose={() => setShowPositionModal(false)}
        title={`${teacher.name} - 직책 변경`}
      >
        <div className="space-y-4">
          <PositionInput
            value={tempPosition}
            onChange={setTempPosition}
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowPositionModal(false)}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={async () => {
                await handleChangePosition(tempPosition);
                setShowPositionModal(false);
              }}
              disabled={loading}
              className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---- 메인 페이지 ----

export default function TeacherManagement() {
  const { clubs } = useClub();
  const { teacher: currentTeacher, refreshTeacher } = useAuth();

  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [filterTab, setFilterTab] = useState<ClubFilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [editAvatarTeacher, setEditAvatarTeacher] = useState<Teacher | null>(null);

  const [assignments, setAssignments] = useState<ActiveTeacherAssignment[]>([]);
  const [assignmentTeacher, setAssignmentTeacher] = useState<Teacher | null>(null);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [newAssignRoomId, setNewAssignRoomId] = useState('');
  const [newAssignType, setNewAssignType] = useState<AssignmentType>('primary');
  const [newAssignEndDate, setNewAssignEndDate] = useState('');
  const [assignCreating, setAssignCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherPhone, setNewTeacherPhone] = useState('');
  const [newTeacherClubId, setNewTeacherClubId] = useState('');
  const [newTeacherPosition, setNewTeacherPosition] = useState('');
  const [addingTeacher, setAddingTeacher] = useState(false);

  const loadTeachers = async () => {
    const showUnassigned = filterTab === 'unassigned';
    const filterType = filterTab === 'sparks' ? 'sparks' : filterTab === 'tnt' ? 'tnt' : null;

    // 클럽 타입으로 필터링 시 해당 타입의 club_id 목록 추출
    let clubIdsForType: string[] | null = null;
    if (filterType) {
      clubIdsForType = clubs
        .filter((c) => c.type === filterType)
        .map((c) => c.id);
    }

    let query = supabase
      .from('teachers')
      .select('*')
      .order('name');

    if (showUnassigned) {
      query = query.is('club_id', null);
    } else if (clubIdsForType && clubIdsForType.length > 0) {
      query = query.in('club_id', clubIdsForType);
    }

    const { data, error } = await query;

    if (error) {
      toast.error('교사 목록 로드 실패');
      return;
    }
    setAllTeachers((data as Teacher[]) || []);
  };

  const loadAssignments = async () => {
    const results = await Promise.all(clubs.map(club => getAllAssignmentsByClub(club.id)));
    setAssignments(results.flat());
  };

  const loadRooms = async () => {
    const { data } = await supabase.from('rooms').select('*').eq('active', true);
    setAllRooms((data as Room[]) || []);
  };

  // 최초 로드: assignments와 rooms는 한 번만
  useEffect(() => {
    if (clubs.length > 0) {
      Promise.all([loadAssignments(), loadRooms()]);
    }
  }, [clubs]);

  // 교사 목록은 탭 변경 시 재로드
  useEffect(() => {
    setLoading(true);
    loadTeachers().finally(() => setLoading(false));
  }, [filterTab, clubs]);

  // Realtime 구독
  useEffect(() => {
    const channel = supabase
      .channel('admin-teachers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teachers' }, () => loadTeachers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teacher_assignments' }, () => loadAssignments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filterTab, clubs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadTeachers(), loadAssignments(), loadRooms()]);
    setRefreshing(false);
    toast.success('갱신됨');
  };

  const handleAddTeacher = async () => {
    if (!newTeacherName.trim() || !newTeacherPhone.trim()) {
      toast.error('이름과 전화번호를 입력해주세요.');
      return;
    }
    setAddingTeacher(true);
    try {
      const phoneDigits = newTeacherPhone.replace(/[^0-9]/g, '');
      const email = `${phoneDigits}@awana.local`;
      const password = getInitialPassword(newTeacherPhone);

      // 세션 영향 없는 클라이언트로 Auth 계정 생성
      const { data: authData, error: authError } = await authOnlySupabase.auth.signUp({
        email,
        password,
        options: { data: { role: 'teacher' } },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('계정 생성 실패');

      // teachers 테이블에 프로필 INSERT (admin의 세션으로)
      const { error: insertError } = await supabase.from('teachers').insert({
        user_id: authData.user.id,
        name: newTeacherName.trim(),
        phone: newTeacherPhone.trim(),
        club_id: newTeacherClubId || null,
        position: newTeacherPosition || null,
        role: 'teacher',
      });

      if (insertError) throw insertError;

      toast.success(`${newTeacherName} 교사 계정이 생성되었습니다.\n로그인: ${phoneDigits} / 비밀번호: ${password}`);
      setShowAddTeacher(false);
      setNewTeacherName('');
      setNewTeacherPhone('');
      setNewTeacherClubId('');
      setNewTeacherPosition('');
      await loadTeachers();
    } catch (error) {
      console.error('Teacher creation error:', error);
      const msg = error instanceof Error ? error.message : '교사 계정 생성 실패';
      toast.error(msg.includes('already') ? '이미 등록된 전화번호입니다.' : msg);
    } finally {
      setAddingTeacher(false);
    }
  };

  const handleTeacherAvatarUpload = async (url: string) => {
    if (!editAvatarTeacher) return;
    const { error } = await supabase
      .from('teachers')
      .update({ avatar_url: url })
      .eq('id', editAvatarTeacher.id);
    if (error) {
      toast.error('사진 저장 실패');
    } else {
      toast.success('프로필 사진이 변경되었습니다');
      setEditAvatarTeacher(null);
      loadTeachers();
      if (editAvatarTeacher.id === currentTeacher?.id) {
        await refreshTeacher();
      }
    }
  };

  const handleCreateAssignment = async () => {
    if (!assignmentTeacher || !newAssignRoomId || !currentTeacher) return;
    setAssignCreating(true);
    try {
      await createAssignment({
        teacherId: assignmentTeacher.id,
        roomId: newAssignRoomId,
        assignmentType: newAssignType,
        endDate: newAssignType === 'temporary' && newAssignEndDate ? newAssignEndDate : null,
        createdBy: currentTeacher.id,
      });
      toast.success('배정이 추가되었습니다');
      setNewAssignRoomId('');
      setNewAssignType('primary');
      setNewAssignEndDate('');
      await loadAssignments();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(msg.includes('duplicate') ? '이미 배정되어 있습니다' : '배정 추가 실패');
    } finally {
      setAssignCreating(false);
    }
  };

  const handleEndAssignment = async (assignmentId: string) => {
    try {
      await endAssignment(assignmentId);
      toast.success('배정이 종료되었습니다');
      await loadAssignments();
    } catch {
      toast.error('배정 종료 실패');
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    try {
      await deleteAssignment(assignmentId);
      toast.success('배정이 삭제되었습니다');
      await loadAssignments();
    } catch {
      toast.error('배정 삭제 실패');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">교사 관리</h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <button
          onClick={() => setShowAddTeacher(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          교사 추가
        </button>
      </div>

      {/* 클럽 필터 탭 */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CLUB_FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterTab === key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 교사 리스트 */}
      {allTeachers.length === 0 ? (
        <p className="text-gray-500 text-center py-10">해당하는 교사가 없습니다.</p>
      ) : (() => {
        const activeTeachers = allTeachers.filter(t => t.active !== false);
        const inactiveTeachers = allTeachers.filter(t => t.active === false);
        const categories = groupTeachersByCategory(activeTeachers, clubs);

        return (
          <div className="space-y-3">
            {/* 활성 교사 - 카테고리별 구분선 */}
            {categories.map((cat, catIdx) => (
              <div key={cat.key}>
                {/* 카테고리 divider */}
                <div className="flex items-center gap-2 py-2 px-1">
                  <span className="text-sm">{cat.emoji}</span>
                  <span className="text-xs font-semibold text-gray-500">{cat.label}</span>
                  <span className="text-xs text-gray-300">({cat.teachers.length}명)</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <div className="space-y-3">
                  {cat.teachers.map((teacher) => (
                    <TeacherCard
                      key={teacher.id}
                      teacher={teacher}
                      clubs={clubs}
                      assignments={assignments.filter(a => a.teacher_id === teacher.id)}
                      onAction={() => { loadTeachers(); loadAssignments(); }}
                      onAvatarClick={setEditAvatarTeacher}
                      onManageAssignment={setAssignmentTeacher}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* 비활성 교사 - 접힌 섹션 */}
            {inactiveTeachers.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setShowInactive(prev => !prev)}
                  className="flex items-center gap-2 w-full py-3 px-4 bg-gray-100 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-200 transition-colors"
                >
                  {showInactive ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span>비활성 교사</span>
                  <span className="text-xs text-gray-400">({inactiveTeachers.length}명)</span>
                </button>
                {showInactive && (
                  <div className="mt-3 space-y-3">
                    {inactiveTeachers.map((teacher) => (
                      <TeacherCard
                        key={teacher.id}
                        teacher={teacher}
                        clubs={clubs}
                        assignments={assignments.filter(a => a.teacher_id === teacher.id)}
                        onAction={() => { loadTeachers(); loadAssignments(); }}
                        onAvatarClick={setEditAvatarTeacher}
                        onManageAssignment={setAssignmentTeacher}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* 아바타 업로드 모달 */}
      <Modal
        open={!!editAvatarTeacher}
        onClose={() => setEditAvatarTeacher(null)}
        title="프로필 사진 변경"
      >
        {editAvatarTeacher && (
          <div className="flex justify-center py-4">
            <AvatarUpload
              currentUrl={editAvatarTeacher.avatar_url}
              name={editAvatarTeacher.name}
              folder="teachers"
              entityId={editAvatarTeacher.id}
              onUpload={handleTeacherAvatarUpload}
              size="lg"
            />
          </div>
        )}
      </Modal>

      {/* 배정 관리 모달 */}
      <Modal
        open={!!assignmentTeacher}
        onClose={() => setAssignmentTeacher(null)}
        title={`${assignmentTeacher?.name} - 배정 관리`}
      >
        {assignmentTeacher && (
          <div className="space-y-4">
            {/* 현재 배정 목록 */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">현재 배정</h4>
              {assignments.filter(a => a.teacher_id === assignmentTeacher.id).length === 0 ? (
                <p className="text-sm text-gray-400 py-2">배정된 반이 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {assignments.filter(a => a.teacher_id === assignmentTeacher.id).map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: a.team_color }} />
                        <span className={`text-[10px] px-1 py-0.5 rounded font-semibold ${
                          clubs.find(c => c.id === a.club_id)?.type === 'sparks'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-blue-50 text-blue-600'
                        }`}>
                          {clubTypeLabel(a.club_id, clubs)}
                        </span>
                        <span className="text-sm font-medium">{a.room_name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          a.assignment_type === 'primary' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {a.assignment_type === 'primary' ? '담임' : '지원'}
                        </span>
                        {a.end_date && <span className="text-xs text-gray-400">~{a.end_date}</span>}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEndAssignment(a.id)}
                          className="text-xs text-amber-600 hover:text-amber-800 px-2 py-1"
                        >
                          종료
                        </button>
                        <button
                          onClick={() => handleDeleteAssignment(a.id)}
                          className="text-xs text-red-600 hover:text-red-800 px-2 py-1"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 새 배정 추가 */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">새 배정 추가</h4>
              <div className="space-y-2">
                <select
                  value={newAssignRoomId}
                  onChange={(e) => setNewAssignRoomId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">교실 선택</option>
                  {allRooms
                    .filter(r => !assignmentTeacher.club_id || r.club_id === assignmentTeacher.club_id)
                    .map((room) => {
                      const club = clubs.find(c => c.id === room.club_id);
                      const label = !assignmentTeacher.club_id && club
                        ? `[${club.name}] ${room.name}`
                        : room.name;
                      return <option key={room.id} value={room.id}>{label}</option>;
                    })
                  }
                </select>
                <div className="flex gap-2">
                  <select
                    value={newAssignType}
                    onChange={(e) => setNewAssignType(e.target.value as AssignmentType)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="primary">담임 (영구)</option>
                    <option value="temporary">지원 (임시)</option>
                  </select>
                  {newAssignType === 'temporary' && (
                    <input
                      type="date"
                      value={newAssignEndDate}
                      onChange={(e) => setNewAssignEndDate(e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="종료일"
                    />
                  )}
                </div>
                <button
                  onClick={handleCreateAssignment}
                  disabled={!newAssignRoomId || assignCreating}
                  className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {assignCreating ? '추가중...' : '배정 추가'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 교사 추가 모달 */}
      <Modal
        open={showAddTeacher}
        onClose={() => setShowAddTeacher(false)}
        title="새 교사 계정 생성"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            이름으로 로그인하고, 전화번호가 초기 비밀번호가 됩니다.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
            <input
              type="text"
              value={newTeacherName}
              onChange={(e) => setNewTeacherName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="홍길동"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호 * (초기 비밀번호)</label>
            <input
              type="tel"
              value={newTeacherPhone}
              onChange={(e) => setNewTeacherPhone(formatPhone(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="010-1234-5678"
            />
            {newTeacherPhone && (
              <p className="text-xs text-gray-400 mt-1">
                로그인: {newTeacherPhone.replace(/[^0-9]/g, '')} / 비밀번호: {getInitialPassword(newTeacherPhone)} (뒷 8자리)
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">소속 클럽</label>
            <select
              value={newTeacherClubId}
              onChange={(e) => setNewTeacherClubId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">없음 (그 외)</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">직책</label>
            <PositionInput
              value={newTeacherPosition}
              onChange={setNewTeacherPosition}
            />
          </div>
          <button
            onClick={handleAddTeacher}
            disabled={addingTeacher || !newTeacherName.trim() || !newTeacherPhone.trim()}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-indigo-700 transition-colors"
          >
            {addingTeacher ? '생성 중...' : '계정 생성'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
