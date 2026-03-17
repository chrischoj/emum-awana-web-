import { useState } from 'react';
import { useClub } from '../../contexts/ClubContext';
import { supabase } from '../../lib/supabase';
import { downloadCSV } from '../../services/exportService';
import toast from 'react-hot-toast';

export default function ReportsPage() {
  const { currentClub, clubs, setCurrentClub, teams, members } = useClub();
  const [exporting, setExporting] = useState(false);

  const handleExportScores = async () => {
    if (!currentClub) return;
    setExporting(true);
    try {
      const { data } = await supabase
        .from('weekly_scores')
        .select('*, members!inner(name, team_id)')
        .eq('club_id', currentClub.id)
        .order('training_date', { ascending: false });

      if (!data || data.length === 0) {
        toast.error('내보낼 데이터가 없습니다');
        return;
      }

      const rows = data.map((row: Record<string, unknown>) => {
        const member = row.members as Record<string, unknown> | null;
        return {
          날짜: row.training_date,
          이름: member?.name ?? '',
          카테고리: row.category,
          기본점수: row.base_points,
          배수: row.multiplier,
          총점: row.total_points,
        };
      });

      downloadCSV(rows as Record<string, unknown>[], `점수_${currentClub.name}_${new Date().toISOString().split('T')[0]}`);
      toast.success('CSV 다운로드 완료');
    } catch {
      toast.error('내보내기 실패');
    } finally {
      setExporting(false);
    }
  };

  const handleExportAttendance = async () => {
    if (!currentClub) return;
    setExporting(true);
    try {
      const { data } = await supabase
        .from('member_attendance')
        .select('*, members!inner(name, club_id)')
        .eq('members.club_id', currentClub.id)
        .order('training_date', { ascending: false });

      if (!data || data.length === 0) {
        toast.error('내보낼 데이터가 없습니다');
        return;
      }

      const rows = data.map((row: Record<string, unknown>) => {
        const member = row.members as Record<string, unknown> | null;
        return {
          날짜: row.training_date,
          이름: member?.name ?? '',
          상태: row.status || (row.present ? '출석' : '결석'),
          사유: row.absence_reason ?? '',
        };
      });

      downloadCSV(rows as Record<string, unknown>[], `출석_${currentClub.name}_${new Date().toISOString().split('T')[0]}`);
      toast.success('CSV 다운로드 완료');
    } catch {
      toast.error('내보내기 실패');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">보고서</h1>

      {/* Club selector */}
      <div className="flex gap-2 mb-6">
        {clubs.map((club) => (
          <button
            key={club.id}
            onClick={() => setCurrentClub(club)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              currentClub?.id === club.id
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {club.name}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">클럽원 수</p>
          <p className="text-2xl font-bold">{members.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">팀 수</p>
          <p className="text-2xl font-bold">{teams.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">클럽 유형</p>
          <p className="text-2xl font-bold capitalize">{currentClub?.type ?? '-'}</p>
        </div>
      </div>

      {/* Export buttons */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">데이터 내보내기</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={handleExportScores}
            disabled={exporting || !currentClub}
            className="py-3 bg-indigo-600 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {exporting ? '내보내는 중...' : '점수 데이터 CSV 내보내기'}
          </button>
          <button
            onClick={handleExportAttendance}
            disabled={exporting || !currentClub}
            className="py-3 bg-green-600 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {exporting ? '내보내는 중...' : '출석 데이터 CSV 내보내기'}
          </button>
        </div>
      </div>
    </div>
  );
}
