import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useClub } from '../../contexts/ClubContext';
import { getGameScoresByDate, getTeamGameTotals } from '../../services/gameScoreService';
import { getToday } from '../../lib/utils';
import type { GameScoreEntry } from '../../types/awana';

export default function GameScoresAdmin() {
  const { currentClub, clubs, setCurrentClub, teams } = useClub();
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [teamTotals, setTeamTotals] = useState<Record<string, number>>({});
  const [entries, setEntries] = useState<GameScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentClub) return;
    setLoading(true);
    Promise.all([
      getTeamGameTotals(currentClub.id, selectedDate),
      getGameScoresByDate(currentClub.id, selectedDate),
    ])
      .then(([totals, data]) => { setTeamTotals(totals); setEntries(data); })
      .catch(() => toast.error('데이터 로드 실패'))
      .finally(() => setLoading(false));
  }, [currentClub, selectedDate]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">게임 점수 관리</h1>
        <div className="flex gap-2">
          {clubs.map((club) => (
            <button key={club.id} onClick={() => setCurrentClub(club)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${currentClub?.id === club.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{club.name}</button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>

      {/* Team totals */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {teams.map((team) => (
          <div key={team.id} className="bg-white rounded-xl border border-gray-200 p-4 text-center" style={{ borderTopColor: team.color, borderTopWidth: 3 }}>
            <p className="text-sm font-bold" style={{ color: team.color }}>{team.name}</p>
            <p className="text-2xl font-bold mt-1">{(teamTotals[team.id] || 0).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Entry list */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold mb-3">점수 기록</h2>
        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /></div>
        ) : entries.length === 0 ? (
          <p className="text-gray-400 text-center py-4 text-sm">기록이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const team = teams.find((t) => t.id === entry.team_id);
              return (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-50 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                    {team && <span className="px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: team.color }}>{team.name}</span>}
                    {entry.description && <span className="text-gray-500">{entry.description}</span>}
                  </div>
                  <span className="font-bold text-indigo-600">+{entry.points}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
