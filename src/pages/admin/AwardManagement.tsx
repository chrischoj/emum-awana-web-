import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  getBadges,
  createBadge,
  updateBadge,
  deleteBadge,
  getClubStages,
  getBadgesByStageAndGroup,
  createBadgeWithStage,
} from '../../services/badgeService';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { cn } from '../../lib/utils';
import type { Badge, BadgeType, BadgeCategory, BadgeGroup, ClubType, ClubStage } from '../../types/awana';
import {
  BADGE_GROUPS_BY_CLUB,
  BADGE_GROUP_LABELS,
  getBadgeIconPath,
  BADGE_FALLBACK_ICON,
  RECITATION_PINS,
  getRecitationPinIconPath,
} from '../../constants/badgeConstants';

const BADGE_TYPE_LABELS: Record<BadgeType, string> = {
  handbook_completion: '핸드북 완료',
  attendance_perfect: '개근',
  memorization: '암송',
  special: '특별',
  custom: '커스텀',
};

export default function AwardManagement() {
  // ---- 계층 선택 상태 ----
  const [selectedClub, setSelectedClub] = useState<ClubType | 'common'>('sparks');
  const [commonPins, setCommonPins] = useState<Badge[]>([]);
  const [stages, setStages] = useState<ClubStage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [stageBadges, setStageBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  // ---- 생성 모달 ----
  const [showCreate, setShowCreate] = useState(false);
  const [createGroup, setCreateGroup] = useState<BadgeGroup | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState(1);
  const [creating, setCreating] = useState(false);

  // ---- 수정 모달 ----
  const [editBadge, setEditBadge] = useState<Badge | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ---- 현재 선택된 단계 객체 ----
  const selectedStage = useMemo(
    () => stages.find((s) => s.id === selectedStageId) ?? null,
    [stages, selectedStageId],
  );

  // ---- 현재 클럽의 뱃지 그룹 목록 ----
  const badgeGroups = useMemo(
    () => (selectedClub === 'common' ? [] : BADGE_GROUPS_BY_CLUB[selectedClub]),
    [selectedClub],
  );

  // ============================================
  // Data Loading
  // ============================================

  // 클럽 변경 시 단계 로드
  useEffect(() => {
    if (selectedClub === 'common') return;
    let cancelled = false;
    setLoading(true);
    setStageBadges([]);
    getClubStages(selectedClub)
      .then((data) => {
        if (cancelled) return;
        setStages(data);
        if (data.length > 0) {
          setSelectedStageId(data[0].id);
        } else {
          setSelectedStageId(null);
          setStageBadges([]);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('단계 로드 실패');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedClub]);

  // 공통 암송핀 로드
  useEffect(() => {
    if (selectedClub !== 'common') return;
    let cancelled = false;
    getBadges().then((allBadges) => {
      if (!cancelled) setCommonPins(allBadges.filter((b) => b.badge_group === 'recitation_pin'));
    }).catch(() => {
      if (!cancelled) toast.error('암송핀 로드 실패');
    });
    return () => { cancelled = true; };
  }, [selectedClub]);

  // 단계 변경 시 뱃지 로드
  useEffect(() => {
    if (!selectedStageId) return;
    let cancelled = false;
    getBadgesByStageAndGroup(selectedStageId)
      .then((data) => {
        if (!cancelled) setStageBadges(data);
      })
      .catch(() => {
        if (!cancelled) toast.error('뱃지 로드 실패');
      });
    return () => { cancelled = true; };
  }, [selectedStageId]);

  // ============================================
  // 뱃지 리로드 헬퍼
  // ============================================
  const reloadBadges = async () => {
    if (!selectedStageId) return;
    try {
      const data = await getBadgesByStageAndGroup(selectedStageId);
      setStageBadges(data);
    } catch {
      toast.error('뱃지 로드 실패');
    }
  };

  // ============================================
  // 생성 핸들러
  // ============================================
  const openCreateForGroup = (group: BadgeGroup) => {
    setCreateGroup(group);
    setName('');
    setDescription('');
    setSortOrder(stageBadges.filter((b) => b.badge_group === group).length + 1);
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!name.trim() || !createGroup || !selectedStageId) return;
    setCreating(true);
    try {
      await createBadgeWithStage({
        name: name.trim(),
        badge_type: 'special',
        badge_group: createGroup,
        stage_id: selectedStageId,
        description: description || undefined,
        sort_order: sortOrder,
      });
      toast.success('뱃지 생성 완료');
      setShowCreate(false);
      await reloadBadges();
    } catch {
      toast.error('생성 실패');
    } finally {
      setCreating(false);
    }
  };

  // ============================================
  // 수정 핸들러
  // ============================================
  const openEdit = (badge: Badge) => {
    setEditBadge(badge);
    setEditName(badge.name);
    setEditDescription(badge.description || '');
    setEditSortOrder(badge.sort_order || 0);
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    if (!editBadge || !editName.trim()) {
      toast.error('이름을 입력하세요');
      return;
    }
    setUpdating(true);
    try {
      await updateBadge(editBadge.id, {
        name: editName.trim(),
        description: editDescription || null,
        sort_order: editSortOrder || null,
      });
      toast.success('뱃지 수정 완료');
      setShowEdit(false);
      setEditBadge(null);
      await reloadBadges();
    } catch {
      toast.error('뱃지 수정 실패');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!editBadge) return;
    if (!confirm('정말 삭제하시겠습니까?')) return;
    setDeleting(true);
    try {
      await deleteBadge(editBadge.id);
      toast.success('뱃지 삭제 완료');
      setShowEdit(false);
      setEditBadge(null);
      await reloadBadges();
    } catch {
      toast.error('뱃지 삭제 실패 (사용 중인 뱃지일 수 있습니다)');
    } finally {
      setDeleting(false);
    }
  };

  // ============================================
  // 로딩 스피너
  // ============================================
  if (loading && selectedClub !== 'common') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div>
      {/* 페이지 헤더 */}
      <h1 className="text-2xl font-bold text-gray-900 mb-4">시상/뱃지 관리</h1>

      {/* ===== 1. 클럽 탭 (스팍스 / 티앤티 / 공통) ===== */}
      <div className="flex gap-2 mb-4">
        {(['sparks', 'tnt'] as ClubType[]).map((ct) => (
          <button
            key={ct}
            onClick={() => setSelectedClub(ct)}
            className={cn(
              'flex-1 py-3 rounded-xl text-sm font-bold transition-all',
              selectedClub === ct
                ? ct === 'sparks'
                  ? 'bg-red-500 text-white shadow-lg'
                  : 'bg-blue-500 text-white shadow-lg'
                : 'bg-gray-100 text-gray-600',
            )}
          >
            {ct === 'sparks' ? '⚡ 스팍스' : '📘 티앤티'}
          </button>
        ))}
        <button
          onClick={() => setSelectedClub('common')}
          className={cn(
            'flex-1 py-3 rounded-xl text-sm font-bold transition-all',
            selectedClub === 'common'
              ? 'bg-emerald-500 text-white shadow-lg'
              : 'bg-gray-100 text-gray-600',
          )}
        >
          📌 공통 암송핀
        </button>
      </div>

      {selectedClub === 'common' ? (
        /* ===== 공통 암송핀 섹션 ===== */
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3">
            📌 암송핀 <span className="text-xs text-gray-400">({commonPins.length}개)</span>
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {commonPins.map((badge) => {
              const pinDef = RECITATION_PINS.find((p) => p.name === badge.name);
              const iconSrc = badge.icon_url
                || (pinDef ? getRecitationPinIconPath(pinDef.index, pinDef.ext) : BADGE_FALLBACK_ICON);
              return (
                <div
                  key={badge.id}
                  onClick={() => openEdit(badge)}
                  className="bg-white rounded-xl border border-gray-200 p-3 text-center cursor-pointer hover:border-emerald-300 transition-colors"
                >
                  <img
                    src={iconSrc}
                    alt={badge.name}
                    className="w-12 h-12 mx-auto mb-1 object-contain rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = BADGE_FALLBACK_ICON;
                    }}
                  />
                  <p className="text-xs font-medium text-gray-700 truncate">{badge.name}</p>
                </div>
              );
            })}
            {commonPins.length === 0 && (
              <p className="col-span-3 text-xs text-gray-400 text-center py-4">
                아직 암송핀이 없습니다
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ===== 2. 단계 탭 ===== */}
          {stages.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
              {stages.map((stage) => (
                <button
                  key={stage.id}
                  onClick={() => setSelectedStageId(stage.id)}
                  className={cn(
                    'px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors',
                    selectedStageId === stage.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600',
                  )}
                >
                  {stage.stage_name}
                </button>
              ))}
            </div>
          )}

          {/* ===== 3. 그룹별 뱃지 섹션 ===== */}
          {stages.length === 0 ? (
            <p className="text-gray-500 text-center py-10">등록된 단계가 없습니다.</p>
          ) : (
            badgeGroups.map((group) => {
              const groupBadges = stageBadges
                .filter((b) => b.badge_group === group.key)
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

              return (
                <div key={group.key} className="mb-4">
                  {/* 그룹 헤더 */}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-700">
                      {group.icon} {group.label}
                      <span className="ml-1 text-xs text-gray-400">({groupBadges.length}개)</span>
                    </h3>
                    <button
                      onClick={() => openCreateForGroup(group.key)}
                      className="text-xs text-indigo-600 font-medium"
                    >
                      + 추가
                    </button>
                  </div>

                  {/* 뱃지 그리드 */}
                  <div className="grid grid-cols-3 gap-2">
                    {groupBadges.map((badge) => (
                      <div
                        key={badge.id}
                        onClick={() => openEdit(badge)}
                        className="bg-white rounded-xl border border-gray-200 p-3 text-center cursor-pointer hover:border-indigo-300 transition-colors"
                      >
                        <img
                          src={
                            badge.icon_url ||
                            getBadgeIconPath(
                              selectedClub as ClubType,
                              selectedStage?.stage_key || '',
                              group.key,
                              badge.name,
                            )
                          }
                          alt={badge.name}
                          className="w-12 h-12 mx-auto mb-1 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = BADGE_FALLBACK_ICON;
                          }}
                        />
                        <p className="text-xs font-medium text-gray-700 truncate">{badge.name}</p>
                      </div>
                    ))}
                    {groupBadges.length === 0 && (
                      <p className="col-span-3 text-xs text-gray-400 text-center py-4">
                        아직 뱃지가 없습니다
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {/* ===== 4. 생성 모달 ===== */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={`뱃지 추가 — ${createGroup ? BADGE_GROUP_LABELS[createGroup] : ''}`}
      >
        <div className="space-y-3 mb-4">
          {/* 컨텍스트 표시 */}
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
            <p>
              <span className="font-semibold text-gray-700">클럽:</span>{' '}
              {selectedClub === 'sparks' ? '스팍스' : '티앤티'}
            </p>
            <p>
              <span className="font-semibold text-gray-700">단계:</span>{' '}
              {selectedStage?.stage_name || '-'}
            </p>
            <p>
              <span className="font-semibold text-gray-700">그룹:</span>{' '}
              {createGroup ? BADGE_GROUP_LABELS[createGroup] : '-'}
            </p>
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="뱃지 이름"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            autoFocus
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="설명 (선택)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            placeholder="정렬 순서"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            min={1}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">
            취소
          </Button>
          <Button onClick={handleCreate} isLoading={creating} className="flex-1">
            생성
          </Button>
        </div>
      </Modal>

      {/* ===== 5. 수정/삭제 모달 ===== */}
      <Modal
        open={showEdit}
        onClose={() => {
          setShowEdit(false);
          setEditBadge(null);
        }}
        title="뱃지 수정"
      >
        {editBadge && (
          <>
            <div className="space-y-3 mb-4">
              {/* 뱃지 정보 표시 */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <p>
                  <span className="font-semibold text-gray-700">그룹:</span>{' '}
                  {editBadge.badge_group ? BADGE_GROUP_LABELS[editBadge.badge_group] : '-'}
                </p>
                <p>
                  <span className="font-semibold text-gray-700">유형:</span>{' '}
                  {BADGE_TYPE_LABELS[editBadge.badge_type]}
                </p>
              </div>

              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="뱃지 이름"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                autoFocus
              />
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="설명"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={editSortOrder}
                onChange={(e) => setEditSortOrder(Number(e.target.value))}
                placeholder="정렬 순서"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                min={0}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="danger" onClick={handleDelete} isLoading={deleting} className="flex-1">
                삭제
              </Button>
              <Button onClick={handleUpdate} isLoading={updating} className="flex-1">
                저장
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
