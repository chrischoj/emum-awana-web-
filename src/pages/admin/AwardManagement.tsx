import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getBadges, createBadge } from '../../services/badgeService';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import type { Badge, BadgeType } from '../../types/awana';

const BADGE_TYPE_LABELS: Record<BadgeType, string> = {
  handbook_completion: '핸드북 완료',
  attendance_perfect: '개근',
  memorization: '암송',
  special: '특별',
  custom: '커스텀',
};

export default function AwardManagement() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [badgeType, setBadgeType] = useState<BadgeType>('custom');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

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
      });
      toast.success('뱃지 생성 완료');
      setShowCreate(false);
      setName(''); setDescription('');
      await loadBadges();
    } catch {
      toast.error('뱃지 생성 실패');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">시상/뱃지 관리</h1>
        <Button onClick={() => setShowCreate(true)}>뱃지 추가</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {badges.map((badge) => (
          <div key={badge.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-lg">🏆</div>
              <div>
                <h3 className="font-semibold text-gray-900">{badge.name}</h3>
                <p className="text-xs text-gray-500">{BADGE_TYPE_LABELS[badge.badge_type]}</p>
              </div>
            </div>
            {badge.description && <p className="text-sm text-gray-600">{badge.description}</p>}
          </div>
        ))}
        {badges.length === 0 && (
          <p className="text-gray-500 col-span-full text-center py-10">등록된 뱃지가 없습니다.</p>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="뱃지 추가">
        <div className="space-y-3 mb-4">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="뱃지 이름" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" autoFocus />
          <select value={badgeType} onChange={(e) => setBadgeType(e.target.value as BadgeType)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {Object.entries(BADGE_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="설명 (선택)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">취소</Button>
          <Button onClick={handleCreate} isLoading={creating} className="flex-1">생성</Button>
        </div>
      </Modal>
    </div>
  );
}
