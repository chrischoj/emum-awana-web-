import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { buildAwardsData, buildCeremonyUrl } from '../../services/awardsIntegrationService';
import { TEAM_NAMES, TEAM_COLORS } from '../../types/awana';
import type { AwardsData, TeamName } from '../../types/awana';

const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function CeremonyPage() {
  const today = toLocalDateStr(new Date());

  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [data, setData] = useState<AwardsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [ceremonyUrl, setCeremonyUrl] = useState<string | null>(null);

  const setPreset = (preset: string) => {
    const now = new Date();
    const todayStr = toLocalDateStr(now);
    let from = todayStr;
    let to = todayStr;

    switch (preset) {
      case 'today':
        break;
      case 'yesterday': {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        from = to = toLocalDateStr(d);
        break;
      }
      case 'thisWeek': {
        const day = now.getDay(); // 0=Sun
        const diff = day === 0 ? 6 : day - 1; // Monday start
        const mon = new Date(now);
        mon.setDate(mon.getDate() - diff);
        from = toLocalDateStr(mon);
        to = todayStr;
        break;
      }
      case 'lastWeek': {
        const day = now.getDay();
        const diff = day === 0 ? 6 : day - 1;
        const mon = new Date(now);
        mon.setDate(mon.getDate() - diff - 7);
        const sun = new Date(mon);
        sun.setDate(sun.getDate() + 6);
        from = toLocalDateStr(mon);
        to = toLocalDateStr(sun);
        break;
      }
      case 'thisMonth': {
        from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        to = todayStr;
        break;
      }
      case 'lastMonth': {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        from = toLocalDateStr(lm);
        to = toLocalDateStr(lmEnd);
        break;
      }
    }
    setDateFrom(from);
    setDateTo(to);
  };

  const handleLoad = async () => {
    setLoading(true);
    try {
      const awardsData = await buildAwardsData(dateFrom, dateTo);
      setData(awardsData);
      const url = buildCeremonyUrl(awardsData);
      setCeremonyUrl(url);
    } catch {
      toast.error('데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  };

  // 페이지 진입 시 자동 집계
  const didAutoLoad = useRef(false);
  useEffect(() => {
    if (!didAutoLoad.current) {
      didAutoLoad.current = true;
      handleLoad();
    }
  }, []);

  const handleCopyUrl = () => {
    if (ceremonyUrl) {
      navigator.clipboard.writeText(ceremonyUrl);
      toast.success('URL이 복사되었습니다');
    }
  };

  const handleOpenCeremony = () => {
    if (ceremonyUrl) {
      window.open(ceremonyUrl, '_blank');
    }
  };

  const renderTeamRow = (label: string, scores: Record<TeamName, number>) => (
    <div className="mb-4">
      <h3 className="text-sm font-medium text-gray-500 mb-2">{label}</h3>
      <div className="grid grid-cols-4 gap-2">
        {TEAM_NAMES.map((team) => (
          <div
            key={team}
            className="text-center py-3 rounded-lg"
            style={{ backgroundColor: TEAM_COLORS[team] + '20' }}
          >
            <p className="text-xs font-bold" style={{ color: TEAM_COLORS[team] }}>
              {team}
            </p>
            <p className="text-xl font-bold mt-1">{(scores[team] || 0).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">시상식 준비</h1>

      {/* Date range */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { key: 'today', label: '오늘' },
            { key: 'yesterday', label: '어제' },
            { key: 'thisWeek', label: '이번 주' },
            { key: 'lastWeek', label: '지난 주' },
            { key: 'thisMonth', label: '이번 달' },
            { key: 'lastMonth', label: '지난 달' },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className="px-3 py-1.5 text-xs font-medium rounded-full border border-gray-300 text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">시작일</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <span className="text-gray-400 mt-4">~</span>
          <div>
            <label className="block text-xs text-gray-500 mb-1">종료일</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          data-testid="ceremony-aggregate-btn"
          onClick={handleLoad}
          disabled={loading}
          className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm disabled:opacity-50"
        >
          {loading ? '집계 중...' : '점수 집계'}
        </button>
      </div>

      {/* Results */}
      {data && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            {renderTeamRow('Sparks 핸드북 점수', data.handbook.sparks)}
            {renderTeamRow('Sparks 게임 점수', data.game.sparks)}
            {renderTeamRow('T&T 핸드북 점수', data.handbook.tnt)}
            {renderTeamRow('T&T 게임 점수', data.game.tnt)}

            {/* Grand total */}
            <div className="border-t border-gray-200 pt-4 mt-4">
              <h3 className="text-sm font-bold text-gray-900 mb-2">최종 합계</h3>
              <div className="grid grid-cols-4 gap-2">
                {TEAM_NAMES.map((team) => {
                  const total =
                    (data.handbook.sparks[team] || 0) +
                    (data.handbook.tnt[team] || 0) +
                    (data.game.sparks[team] || 0) +
                    (data.game.tnt[team] || 0);
                  return (
                    <div
                      key={team}
                      className="text-center py-3 rounded-lg border-2"
                      style={{
                        backgroundColor: TEAM_COLORS[team] + '20',
                        borderColor: TEAM_COLORS[team],
                      }}
                    >
                      <p className="text-xs font-bold" style={{ color: TEAM_COLORS[team] }}>
                        {team}
                      </p>
                      <p className="text-2xl font-bold mt-1">{total.toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button
              data-testid="ceremony-start-btn"
              onClick={handleOpenCeremony}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg hover:bg-indigo-700 transition-colors"
            >
              🎉 시상식 시작 (새 탭에서 열기)
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleCopyUrl}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-200"
              >
                URL 복사
              </button>
              <button
                onClick={() => toast('QR코드 기능은 교실 관리에서 사용 가능합니다')}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-200"
              >
                QR코드 표시
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
