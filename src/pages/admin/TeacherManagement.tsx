import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { Avatar } from '../../components/ui/Avatar';
import type { Teacher } from '../../types/awana';

// ---- 상수 ----

const POSITIONS = ['조정관', '감독관', '서기', '게임디렉터', '회계', '교사'] as const;

type ClubFilterKey = 'all' | 'sparks' | 'tnt' | 'unassigned';

const CLUB_FILTER_TABS: { key: ClubFilterKey; label: string }[] = [
  { key: 'all', label: '모두' },
  { key: 'sparks', label: '스팍스' },
  { key: 'tnt', label: '티앤티' },
  { key: 'unassigned', label: '그 외' },
];

// ---- 교사 카드 ----

interface TeacherCardProps {
  teacher: Teacher;
  clubs: { id: string; name: string; type: string }[];
  onAction: () => void;
}

function TeacherCard({ teacher, clubs, onAction }: TeacherCardProps) {
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              <Avatar name={teacher.name} src={teacher.avatar_url} size="md" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{teacher.name}</p>
              {teacher.phone && (
                <p className="text-xs text-gray-500">{teacher.phone}</p>
              )}
            </div>
          </div>

          {/* 직책 드롭다운 */}
          <div className="flex items-center gap-2">
            {loading ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
            ) : (
              <select
                value={teacher.position || ''}
                onChange={(e) => handleChangePosition(e.target.value)}
                disabled={loading}
                className="text-xs font-medium text-gray-700 bg-transparent border border-gray-300 rounded-md px-2 py-1 focus:border-indigo-500 focus:outline-none cursor-pointer"
              >
                <option value="">선택 안함</option>
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* 상세 정보 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            클럽:
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
          </span>

          <button
            onClick={teacher.active ? handleDeactivate : handleActivate}
            disabled={loading}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              teacher.active
                ? 'border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-500'
                : 'border-indigo-300 text-indigo-500 hover:border-indigo-500'
            }`}
          >
            {teacher.active ? '비활성화' : '활성화'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- 메인 페이지 ----

export default function TeacherManagement() {
  const { clubs } = useClub();

  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [filterTab, setFilterTab] = useState<ClubFilterKey>('all');
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    setLoading(true);
    loadTeachers().finally(() => setLoading(false));
  }, [filterTab, clubs]);

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
        <h1 className="text-2xl font-bold text-gray-900">교사 관리</h1>
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
      ) : (
        <div className="space-y-3">
          {allTeachers.map((teacher) => (
            <TeacherCard
              key={teacher.id}
              teacher={teacher}
              clubs={clubs}
              onAction={loadTeachers}
            />
          ))}
        </div>
      )}
    </div>
  );
}
