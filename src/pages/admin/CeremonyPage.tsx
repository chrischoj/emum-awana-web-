import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { buildAwardsData } from '../../services/awardsIntegrationService';
import { saveConfirmedCeremony, loadConfirmedCeremony } from '../../services/ceremonyService';
import { TEAM_NAMES, TEAM_COLORS } from '../../types/awana';
import type { AwardsData, TeamName } from '../../types/awana';

const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const BONUS_REASONS = [
  { value: 'recitation', label: '암송 우수' },
  { value: 'handbook_completion', label: '핸드북 완료율' },
  { value: 'special_activity', label: '특별 활동' },
  { value: 'custom', label: '직접 입력' },
];

const BONUS_PRESETS = [50, 100, 200, 300];

const STEPS = [
  { num: 1, label: '집계 확인' },
  { num: 2, label: '가산점 조정' },
  { num: 3, label: '최종 확정' },
];

type ClubTab = 'sparks' | 'tnt';

function deepCloneAwardsData(d: AwardsData): AwardsData {
  return {
    handbook: { sparks: { ...d.handbook.sparks }, tnt: { ...d.handbook.tnt } },
    game: { sparks: { ...d.game.sparks }, tnt: { ...d.game.tnt } },
  };
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── 공통 점수 테이블 컴포넌트 ───
// columns: RED, BLUE, GREEN, YELLOW
// rows: 핸드북(스팍스, T&T) | 게임(스팍스, T&T) | 가산점(선택) | 합계
// Row definitions: single-column label approach (mobile-friendly)
const SCORE_ROWS: { label: string; shortLabel: string; cat: 'handbook' | 'game'; club: ClubTab; bgClass: string; textClass: string; borderClass: string }[] = [
  { label: '핸드북 · 스팍스', shortLabel: '📖 S', cat: 'handbook', club: 'sparks', bgClass: 'bg-blue-50/60', textClass: 'text-blue-700', borderClass: 'border-l-blue-400' },
  { label: '핸드북 · T&T', shortLabel: '📖 T', cat: 'handbook', club: 'tnt', bgClass: 'bg-blue-50/40', textClass: 'text-blue-600', borderClass: 'border-l-blue-300' },
  { label: '게임 · 스팍스', shortLabel: '🎮 S', cat: 'game', club: 'sparks', bgClass: 'bg-green-50/60', textClass: 'text-green-700', borderClass: 'border-l-green-400' },
  { label: '게임 · T&T', shortLabel: '🎮 T', cat: 'game', club: 'tnt', bgClass: 'bg-green-50/40', textClass: 'text-green-600', borderClass: 'border-l-green-300' },
];

const BONUS_ROWS: { label: string; shortLabel: string; club: ClubTab }[] = [
  { label: '가산 · 스팍스', shortLabel: '⚡ S', club: 'sparks' },
  { label: '가산 · T&T', shortLabel: '⚡ T', club: 'tnt' },
];

// Team header: colored circle on mobile, circle+name on desktop
const TEAM_SHORT: Record<TeamName, string> = { RED: 'R', BLUE: 'B', GREEN: 'G', YELLOW: 'Y' };

function ScoreTable({
  data,
  editable = false,
  onEdit,
  bonusData,
  onBonusChange,
  onBonusPreset,
  showBonus = false,
}: {
  data: AwardsData;
  editable?: boolean;
  onEdit?: (cat: 'handbook' | 'game', club: ClubTab, team: TeamName, val: number) => void;
  bonusData?: Record<ClubTab, Record<TeamName, number>>;
  onBonusChange?: (club: ClubTab, team: TeamName, val: number) => void;
  onBonusPreset?: (club: ClubTab, team: TeamName, amt: number) => void;
  showBonus?: boolean;
}) {
  const getTotal = (team: TeamName) => {
    const base =
      (data.handbook.sparks[team] || 0) + (data.handbook.tnt[team] || 0) +
      (data.game.sparks[team] || 0) + (data.game.tnt[team] || 0);
    const bonus = showBonus && bonusData
      ? (bonusData.sparks[team] || 0) + (bonusData.tnt[team] || 0)
      : 0;
    return { base, bonus, total: base + bonus };
  };

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm border-collapse" style={{ minWidth: 340 }}>
        {/* Header: single row with team colors */}
        <thead>
          <tr>
            <th className="border border-gray-200 px-1.5 py-1.5 sm:px-2 sm:py-2 bg-gray-100 text-gray-500 font-bold text-[10px] sm:text-xs text-center whitespace-nowrap">
              구분
            </th>
            {TEAM_NAMES.map((team) => (
              <th
                key={team}
                className="border border-gray-200 px-1 py-1.5 sm:px-3 sm:py-2 text-center font-bold"
                style={{ backgroundColor: TEAM_COLORS[team] + '20', color: TEAM_COLORS[team] }}
              >
                {/* Mobile: circle + letter, Desktop: circle + full name */}
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full align-middle"
                  style={{ backgroundColor: TEAM_COLORS[team] }}
                />
                <span className="sm:hidden ml-0.5 text-xs font-black">{TEAM_SHORT[team]}</span>
                <span className="hidden sm:inline ml-1.5 text-sm">{team}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Score rows: single label column */}
          {SCORE_ROWS.map((row) => (
            <tr key={`${row.cat}-${row.club}`} className="hover:bg-gray-50/50 transition-colors">
              <td className={`border border-gray-200 border-l-[3px] ${row.borderClass} px-1.5 py-1.5 sm:px-2 sm:py-2 ${row.bgClass} ${row.textClass} font-semibold whitespace-nowrap`}>
                <span className="sm:hidden text-[11px]">{row.shortLabel}</span>
                <span className="hidden sm:inline text-xs">{row.label}</span>
              </td>
              {TEAM_NAMES.map((team) => {
                const val = data[row.cat][row.club][team] || 0;
                if (editable && onEdit) {
                  return (
                    <td key={team} className="border border-gray-200 px-0.5 py-1 sm:px-1 sm:py-1.5 text-center">
                      <input
                        type="number"
                        value={val || ''}
                        onChange={(e) => onEdit(row.cat, row.club, team, parseInt(e.target.value) || 0)}
                        className="w-full text-center bg-transparent outline-none font-semibold text-xs sm:text-sm"
                        style={{ color: TEAM_COLORS[team] }}
                      />
                    </td>
                  );
                }
                return (
                  <td key={team} className="border border-gray-200 px-1 py-1.5 sm:px-2 sm:py-2 text-center font-semibold text-gray-700 text-xs sm:text-sm">
                    {val.toLocaleString()}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* Bonus rows */}
          {showBonus && onBonusChange && onBonusPreset && BONUS_ROWS.map((row) => (
            <tr key={`bonus-${row.club}`} className="bg-indigo-50/20">
              <td className="border border-gray-200 border-l-[3px] border-l-indigo-400 px-1.5 py-1.5 sm:px-2 sm:py-2 bg-indigo-50/50 text-indigo-700 font-semibold whitespace-nowrap">
                <span className="sm:hidden text-[11px]">{row.shortLabel}</span>
                <span className="hidden sm:inline text-xs">{row.label}</span>
              </td>
              {TEAM_NAMES.map((team) => {
                const bval = bonusData ? bonusData[row.club][team] || 0 : 0;
                return (
                  <td key={team} className="border border-gray-200 px-0.5 py-1 sm:px-1 sm:py-1.5 text-center">
                    <input
                      type="number"
                      value={bval || ''}
                      onChange={(e) => onBonusChange(row.club, team, parseInt(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full text-center bg-white outline-none font-semibold text-xs sm:text-sm rounded py-0.5 border border-indigo-200 focus:border-indigo-400"
                      style={{ color: TEAM_COLORS[team] }}
                    />
                    {/* 2x2 grid for bonus presets */}
                    <div className="grid grid-cols-2 gap-0.5 mt-1">
                      {BONUS_PRESETS.map((amt) => (
                        <button
                          key={amt}
                          onClick={() => onBonusPreset(row.club, team, amt)}
                          className="px-0.5 py-0 text-[8px] sm:text-[9px] rounded border border-gray-200 text-gray-400 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors leading-4"
                        >
                          +{amt}
                        </button>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}

          {/* Total row */}
          <tr className="font-bold">
            <td className="border-2 border-gray-300 px-1.5 py-2 sm:px-2 sm:py-2.5 text-center text-gray-900 bg-gray-100 text-xs sm:text-sm whitespace-nowrap">
              합계
            </td>
            {TEAM_NAMES.map((team) => {
              const { total, bonus } = getTotal(team);
              return (
                <td
                  key={team}
                  className="border-2 border-gray-300 px-1 py-2 sm:px-2 sm:py-2.5 text-center text-base sm:text-lg"
                  style={{ color: TEAM_COLORS[team], backgroundColor: TEAM_COLORS[team] + '15' }}
                >
                  {total.toLocaleString()}
                  {bonus !== 0 && (
                    <div className="text-[9px] sm:text-[10px] font-medium text-indigo-500">+{bonus.toLocaleString()}</div>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── 순위 미리보기 ───
function RankingPreview({
  data,
  bonusData,
}: {
  data: AwardsData;
  bonusData?: Record<ClubTab, Record<TeamName, number>>;
}) {
  const getTotal = (team: TeamName) => {
    const base =
      (data.handbook.sparks[team] || 0) + (data.handbook.tnt[team] || 0) +
      (data.game.sparks[team] || 0) + (data.game.tnt[team] || 0);
    const bonus = bonusData
      ? (bonusData.sparks[team] || 0) + (bonusData.tnt[team] || 0)
      : 0;
    return { base, bonus, total: base + bonus };
  };

  const baseRanked = TEAM_NAMES
    .map((t) => ({ team: t, total: getTotal(t).base }))
    .sort((a, b) => b.total - a.total);
  const baseRankMap: Record<string, number> = {};
  baseRanked.forEach((r, i) => { baseRankMap[r.team] = i + 1; });

  const ranked = TEAM_NAMES
    .map((t) => ({ team: t, ...getTotal(t) }))
    .sort((a, b) => b.total - a.total)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return (
    <div className="space-y-2">
      {ranked.map((item) => {
        const diff = baseRankMap[item.team] - item.rank;
        return (
          <div
            key={item.team}
            className="flex items-center gap-3 p-3 rounded-lg transition-all duration-300"
            style={{
              backgroundColor: TEAM_COLORS[item.team] + '10',
              borderLeft: `4px solid ${TEAM_COLORS[item.team]}`,
            }}
          >
            <span className="text-lg font-black text-gray-400 w-6 text-center">{item.rank}</span>
            <span className="font-bold flex-1" style={{ color: TEAM_COLORS[item.team] }}>
              {item.team}
            </span>
            <span className="text-sm font-bold text-gray-700">{item.total.toLocaleString()}점</span>
            {item.bonus !== 0 && (
              <span className="text-xs text-indigo-500 font-medium">(+{item.bonus.toLocaleString()})</span>
            )}
            {diff !== 0 ? (
              <span className={`text-xs font-bold ${diff > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {diff > 0 ? `↑${diff}` : `↓${Math.abs(diff)}`}
              </span>
            ) : (
              <span className="text-xs text-gray-300 w-6 text-center">-</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════
// ─── 메인 컴포넌트 ───
// ═══════════════════════════════════════
export default function CeremonyPage() {
  const navigate = useNavigate();
  const today = toLocalDateStr(new Date());

  const [currentStep, setCurrentStep] = useState(1);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [data, setData] = useState<AwardsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [bonusPoints, setBonusPoints] = useState<Record<ClubTab, Record<TeamName, number>>>({
    sparks: { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 },
    tnt: { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 },
  });
  const [bonusReasons, setBonusReasons] = useState<Record<TeamName, string>>({
    RED: '', BLUE: '', GREEN: '', YELLOW: '',
  });
  const [editableData, setEditableData] = useState<AwardsData | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [previousConfirm, setPreviousConfirm] = useState<ReturnType<typeof loadConfirmedCeremony>>(null);

  useEffect(() => { setPreviousConfirm(loadConfirmedCeremony()); }, []);

  // --- Date preset ---
  const setPreset = (preset: string) => {
    const now = new Date();
    const todayStr = toLocalDateStr(now);
    let from = todayStr, to = todayStr;
    switch (preset) {
      case 'today': break;
      case 'yesterday': { const d = new Date(now); d.setDate(d.getDate() - 1); from = to = toLocalDateStr(d); break; }
      case 'thisWeek': { const day = now.getDay(); const diff = day === 0 ? 6 : day - 1; const mon = new Date(now); mon.setDate(mon.getDate() - diff); from = toLocalDateStr(mon); to = todayStr; break; }
      case 'lastWeek': { const day = now.getDay(); const diff = day === 0 ? 6 : day - 1; const mon = new Date(now); mon.setDate(mon.getDate() - diff - 7); const sun = new Date(mon); sun.setDate(sun.getDate() + 6); from = toLocalDateStr(mon); to = toLocalDateStr(sun); break; }
      case 'thisMonth': { from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`; to = todayStr; break; }
      case 'lastMonth': { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0); from = toLocalDateStr(lm); to = toLocalDateStr(lmEnd); break; }
    }
    setDateFrom(from);
    setDateTo(to);
  };

  const handleLoad = async () => {
    setLoading(true);
    try {
      const awardsData = await buildAwardsData(dateFrom, dateTo);
      setData(awardsData);
      setConfirmed(false);
      setBonusPoints({ sparks: { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 }, tnt: { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 } });
    } catch { toast.error('데이터 로드 실패'); }
    finally { setLoading(false); }
  };

  const didAutoLoad = useRef(false);
  useEffect(() => { if (!didAutoLoad.current) { didAutoLoad.current = true; handleLoad(); } }, []);

  // --- Bonus helpers ---
  const updateBonus = (club: ClubTab, team: TeamName, value: number) => {
    setBonusPoints((prev) => ({ ...prev, [club]: { ...prev[club], [team]: value } }));
  };
  const addPresetBonus = (club: ClubTab, team: TeamName, amount: number) => {
    setBonusPoints((prev) => ({ ...prev, [club]: { ...prev[club], [team]: prev[club][team] + amount } }));
  };
  const resetBonuses = () => {
    setBonusPoints({ sparks: { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 }, tnt: { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 } });
  };

  // --- Merge bonus into data for step 3 ---
  const mergeBonus = (): AwardsData | null => {
    if (!data) return null;
    const merged = deepCloneAwardsData(data);
    for (const club of ['sparks', 'tnt'] as ClubTab[]) {
      for (const team of TEAM_NAMES) {
        merged.game[club][team] += bonusPoints[club][team];
      }
    }
    return merged;
  };

  // --- Step navigation ---
  const goToStep2 = () => { if (data) setCurrentStep(2); };
  const goToStep3 = () => {
    const merged = mergeBonus();
    if (!merged) return;
    setEditableData(merged);
    setConfirmed(false);
    setCurrentStep(3);
  };

  // --- Editable data helpers ---
  const updateEditableScore = (cat: 'handbook' | 'game', club: ClubTab, team: TeamName, value: number) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const next = deepCloneAwardsData(prev);
      next[cat][club][team] = value;
      return next;
    });
  };

  const handleConfirm = () => {
    if (!editableData) return;
    saveConfirmedCeremony(editableData, dateFrom, dateTo);
    setConfirmed(true);
    setPreviousConfirm(loadConfirmedCeremony());
    toast.success('시상식 데이터가 확정되었습니다!');
  };

  // ========================================
  // RENDER
  // ========================================
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">시상식 준비</h1>

      {/* Step Indicator */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between">
          {STEPS.map((step, idx) => (
            <div key={step.num} className="flex items-center flex-1">
              <button
                onClick={() => {
                  if (step.num === 1) setCurrentStep(1);
                  else if (step.num === 2 && data) setCurrentStep(2);
                  else if (step.num === 3 && data) goToStep3();
                }}
                disabled={!data && step.num > 1}
                className={`flex items-center gap-2 transition-colors ${!data && step.num > 1 ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  currentStep === step.num ? 'bg-indigo-600 text-white shadow-md'
                    : currentStep > step.num ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-gray-100 text-gray-400'
                }`}>
                  {currentStep > step.num ? '✓' : step.num}
                </span>
                <span className={`text-sm font-medium ${
                  currentStep === step.num ? 'text-indigo-600'
                    : currentStep > step.num ? 'text-indigo-400' : 'text-gray-400'
                }`}>
                  {step.label}
                </span>
              </button>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 rounded ${currentStep > step.num ? 'bg-indigo-300' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Previous confirmed shortcut */}
      {previousConfirm && currentStep === 1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-800">이전 확정 데이터 있음</p>
              <p className="text-xs text-amber-600 mt-0.5">
                확정: {formatDateTime(previousConfirm.confirmedAt)} | 기간: {previousConfirm.dateFrom} ~ {previousConfirm.dateTo}
              </p>
            </div>
            <button
              onClick={() => navigate('/admin/ceremony-play')}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
            >
              시상식 바로 시작
            </button>
          </div>
        </div>
      )}

      {/* ============ STEP 1: 집계 확인 ============ */}
      {currentStep === 1 && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                { key: 'today', label: '오늘' }, { key: 'yesterday', label: '어제' },
                { key: 'thisWeek', label: '이번 주' }, { key: 'lastWeek', label: '지난 주' },
                { key: 'thisMonth', label: '이번 달' }, { key: 'lastMonth', label: '지난 달' },
              ].map((p) => (
                <button key={p.key} onClick={() => setPreset(p.key)}
                  className="px-3 py-1.5 text-xs font-medium rounded-full border border-gray-300 text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                >{p.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">시작일</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <span className="text-gray-400 mt-4">~</span>
              <div>
                <label className="block text-xs text-gray-500 mb-1">종료일</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <button data-testid="ceremony-aggregate-btn" onClick={handleLoad} disabled={loading}
              className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm disabled:opacity-50"
            >{loading ? '집계 중...' : '점수 집계'}</button>
          </div>

          {data && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
                <h3 className="text-sm font-bold text-gray-900 mb-3">집계 결과</h3>
                <ScoreTable data={data} />
              </div>
              <button onClick={goToStep2}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors"
              >다음: 가산점 조정 →</button>
            </>
          )}
        </>
      )}

      {/* ============ STEP 2: 가산점 조정 ============ */}
      {currentStep === 2 && data && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3">가산점 조정</h3>
            <p className="text-xs text-gray-400 mb-3">가산점 열에 직접 입력하거나 프리셋 버튼을 사용하세요</p>
            <ScoreTable
              data={data}
              showBonus
              bonusData={bonusPoints}
              onBonusChange={updateBonus}
              onBonusPreset={addPresetBonus}
            />

            {/* 팀별 가산점 사유 (가산점이 있는 팀만 표시) + 초기화 */}
            <div className="mt-5 border-t border-gray-200 pt-4">
              {(() => {
                const teamsWithBonus = TEAM_NAMES.filter(
                  (t) => (bonusPoints.sparks[t] || 0) + (bonusPoints.tnt[t] || 0) !== 0
                );
                if (teamsWithBonus.length === 0) return (
                  <p className="text-xs text-gray-400 mb-3">가산점을 입력하면 팀별 사유를 입력할 수 있습니다</p>
                );
                return (
                  <>
                    <p className="text-xs text-gray-500 mb-3">팀별 가산점 사유</p>
                    <div className="space-y-2">
                      {teamsWithBonus.map((team) => {
                        const totalBonus = (bonusPoints.sparks[team] || 0) + (bonusPoints.tnt[team] || 0);
                        return (
                          <div
                            key={team}
                            className="flex items-start gap-2 p-2 rounded-lg"
                            style={{ backgroundColor: TEAM_COLORS[team] + '08', borderLeft: `3px solid ${TEAM_COLORS[team]}` }}
                          >
                            <div className="flex items-center gap-1.5 min-w-[80px] pt-1">
                              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TEAM_COLORS[team] }} />
                              <span className="text-xs font-bold" style={{ color: TEAM_COLORS[team] }}>{team}</span>
                              <span className="text-[10px] text-indigo-500 font-medium">+{totalBonus.toLocaleString()}</span>
                            </div>
                            <div className="flex-1 space-y-1.5">
                              <div className="flex flex-wrap gap-1">
                                {BONUS_REASONS.map((r) => (
                                  <button
                                    key={r.value}
                                    onClick={() => setBonusReasons((prev) => ({
                                      ...prev,
                                      [team]: prev[team] === r.value ? '' : r.value,
                                    }))}
                                    className={`px-2 py-0.5 rounded-full border text-[10px] sm:text-xs font-medium transition-colors ${
                                      bonusReasons[team] === r.value
                                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                        : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                                    }`}
                                  >
                                    {r.label}
                                  </button>
                                ))}
                              </div>
                              {bonusReasons[team] === 'custom' && (
                                <input
                                  type="text"
                                  value={bonusReasons[team] === 'custom' ? '' : ''}
                                  onChange={(e) => setBonusReasons((prev) => ({
                                    ...prev,
                                    [team]: `custom:${e.target.value}`,
                                  }))}
                                  placeholder="사유를 직접 입력"
                                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-indigo-300"
                                />
                              )}
                              {bonusReasons[team].startsWith('custom:') && (
                                <input
                                  type="text"
                                  value={bonusReasons[team].replace('custom:', '')}
                                  onChange={(e) => setBonusReasons((prev) => ({
                                    ...prev,
                                    [team]: `custom:${e.target.value}`,
                                  }))}
                                  placeholder="사유를 직접 입력"
                                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-indigo-300"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
              <button onClick={() => {
                resetBonuses();
                setBonusReasons({ RED: '', BLUE: '', GREEN: '', YELLOW: '' });
              }}
                className="mt-3 px-4 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-500 hover:bg-red-50 transition-colors"
              >가산점 초기화</button>
            </div>
          </div>

          {/* 전체 순위 미리보기 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3">전체 순위 미리보기</h3>
            <RankingPreview data={data} bonusData={bonusPoints} />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setCurrentStep(1)}
              className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors"
            >← 이전</button>
            <button onClick={goToStep3}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors"
            >다음: 최종 확정 →</button>
          </div>
        </>
      )}

      {/* ============ STEP 3: 최종 확정 ============ */}
      {currentStep === 3 && editableData && (
        <>
          {previousConfirm && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4">
              <p className="text-xs text-gray-500">
                마지막 확정: {formatDateTime(previousConfirm.confirmedAt)} | 기간: {previousConfirm.dateFrom} ~ {previousConfirm.dateTo}
              </p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-bold text-gray-900 mb-1">최종 점수 확인</h3>
            <p className="text-xs text-gray-400 mb-3">셀을 클릭하여 점수를 직접 수정할 수 있습니다</p>
            <ScoreTable data={editableData} editable onEdit={updateEditableScore} />
          </div>

          {/* 순위 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3">최종 순위</h3>
            <RankingPreview data={editableData} />
          </div>

          <div className="space-y-3">
            <button onClick={handleConfirm}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-md"
            >{confirmed ? '재확정하기' : '확정하기'}</button>

            {confirmed && (
              <button onClick={() => navigate('/admin/ceremony-play')}
                className="w-full py-4 rounded-xl font-bold text-lg text-white transition-all shadow-lg hover:shadow-xl"
                style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)' }}
              >🎉 시상식 플레이</button>
            )}

            <button onClick={() => setCurrentStep(2)}
              className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors"
            >← 이전: 가산점 조정</button>
          </div>
        </>
      )}
    </div>
  );
}
