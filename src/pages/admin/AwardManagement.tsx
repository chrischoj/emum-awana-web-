import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getBadges, createBadge, updateBadge, deleteBadge } from '../../services/badgeService';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { cn } from '../../lib/utils';
import type { Badge, BadgeType, BadgeCategory } from '../../types/awana';

const BADGE_TYPE_LABELS: Record<BadgeType, string> = {
  handbook_completion: '핸드북 완료',
  attendance_perfect: '개근',
  memorization: '암송',
  special: '특별',
  custom: '커스텀',
};

const CATEGORY_TABS = [
  { key: 'all', label: '전체' },
  { key: 'jewel', label: '💎 보석' },
  { key: 'promotion', label: '🏆 진급' },
  { key: 'citation', label: '📜 표창' },
  { key: 'special', label: '⭐ 특별' },
] as const;

const BADGE_CATEGORY_LABELS: Record<string, string> = {
  jewel: '보석',
  promotion: '진급',
  citation: '표창',
  special: '특별',
};

export default function AwardManagement() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  // 생성 모달 상태
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [badgeType, setBadgeType] = useState<BadgeType>('custom');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<BadgeCategory | ''>('');
  const [level, setLevel] = useState<number>(0);
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [creating, setCreating] = useState(false);

  // 카테고리 필터 상태
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // 수정 모달 상태
  const [editBadge, setEditBadge] = useState<Badge | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<BadgeType>('custom');
  const [editCategory, setEditCategory] = useState<BadgeCategory | ''>('');
  const [editDescription, setEditDescription] = useState('');
  const [editLevel, setEditLevel] = useState(0);
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const loadBadges = async () => {
    try {
      const data = await getBadges();
      setBadges(data);
    } catch {
      toast.error('뱃지 로드 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBadges(); }, []);

  const filteredBadges = selectedCategory === 'all'
    ? badges
    : badges.filter(b => b.category === selectedCategory);

  const openEdit = (badge: Badge) => {
    setEditBadge(badge);
    setEditName(badge.name);
    setEditType(badge.badge_type);
    setEditCategory(badge.category || '');
    setEditDescription(badge.description || '');
    setEditLevel(badge.level || 0);
    setEditSortOrder(badge.sort_order || 0);
    setShowEdit(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('이름을 입력하세요'); return; }
    setCreating(true);
    try {
      await createBadge({
        name: name.trim(),
        badge_type: badgeType,
        description: description || null,
        icon_url: null,
        curriculum_template_id: null,
        category: category || null,
        level: level || null,
        sort_order: sortOrder || null,
      });
      toast.success('뱃지 생성 완료');
      setShowCreate(false);
      setName('');
      setDescription('');
      setCategory('');
      setLevel(0);
      setSortOrder(0);
      await loadBadges();
    } catch {
      toast.error('뱃지 생성 실패');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!editBadge || !editName.trim()) { toast.error('이름을 입력하세요'); return; }
    setCreating(true);
    try {
      await updateBadge(editBadge.id, {
        name: editName.trim(),
        badge_type: editType,
        description: editDescription || null,
        category: editCategory || null,
        level: editLevel || null,
        sort_order: editSortOrder || null,
      });
      toast.success('뱃지 수정 완료');
      setShowEdit(false);
      setEditBadge(null);
      await loadBadges();
    } catch {
      toast.error('뱃지 수정 실패');
    } finally {
      setCreating(false);
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
      await loadBadges();
    } catch {
      toast.error('뱃지 삭제 실패 (사용 중인 뱃지일 수 있습니다)');
    } finally {
      setDeleting(false);
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">시상/뱃지 관리</h1>
        <Button onClick={() => setShowCreate(true)}>뱃지 추가</Button>
      </div>

      {/* 카테고리 필터 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSelectedCategory(tab.key)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors',
              selectedCategory === tab.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 뱃지 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBadges.map((badge) => (
          <div
            key={badge.id}
            className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-indigo-300 transition-colors"
            onClick={() => openEdit(badge)}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-lg">🏆</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900">{badge.name}</h3>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-500">{BADGE_TYPE_LABELS[badge.badge_type]}</p>
                  {badge.category && (
                    <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                      {BADGE_CATEGORY_LABELS[badge.category] || badge.category}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {badge.description && (
              <p className="text-sm text-gray-600 truncate">{badge.description}</p>
            )}
          </div>
        ))}
        {filteredBadges.length === 0 && (
          <p className="text-gray-500 col-span-full text-center py-10">등록된 뱃지가 없습니다.</p>
        )}
      </div>

      {/* 생성 모달 */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="뱃지 추가">
        <div className="space-y-3 mb-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="뱃지 이름"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            autoFocus
          />
          <select
            value={badgeType}
            onChange={(e) => setBadgeType(e.target.value as BadgeType)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {Object.entries(BADGE_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="설명 (선택)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as BadgeCategory | '')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">카테고리 (선택)</option>
            {Object.entries(BADGE_CATEGORY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              placeholder="레벨"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              min={0}
            />
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              placeholder="정렬 순서"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              min={0}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">취소</Button>
          <Button onClick={handleCreate} isLoading={creating} className="flex-1">생성</Button>
        </div>
      </Modal>

      {/* 수정 모달 */}
      <Modal
        open={showEdit}
        onClose={() => { setShowEdit(false); setEditBadge(null); }}
        title="뱃지 수정"
      >
        {editBadge && (
          <>
            <div className="space-y-3 mb-4">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="뱃지 이름"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                autoFocus
              />
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value as BadgeType)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {Object.entries(BADGE_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as BadgeCategory | '')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">카테고리 (선택)</option>
                {Object.entries(BADGE_CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="설명"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  value={editLevel}
                  onChange={(e) => setEditLevel(Number(e.target.value))}
                  placeholder="레벨"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  min={0}
                />
                <input
                  type="number"
                  value={editSortOrder}
                  onChange={(e) => setEditSortOrder(Number(e.target.value))}
                  placeholder="정렬 순서"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  min={0}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="danger" onClick={handleDelete} isLoading={deleting} className="flex-1">삭제</Button>
              <Button onClick={handleUpdate} isLoading={creating} className="flex-1">저장</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
