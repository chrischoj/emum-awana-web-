import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import type { CurriculumTemplate, ScoringCategoryConfig } from '../../types/awana';

const CLUB_TYPE_LABELS: Record<string, string> = {
  sparks: '스팍스 (Sparks)',
  tnt: '티앤티 (T&T)',
};

export default function SettingsPage() {
  const [templates, setTemplates] = useState<CurriculumTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState<Record<string, ScoringCategoryConfig[]>>({});

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from('curriculum_templates')
      .select('*')
      .order('club_type');
    if (error) {
      toast.error('설정 로드 실패');
      return;
    }
    const list = (data as CurriculumTemplate[]) || [];
    setTemplates(list);
    const initial: Record<string, ScoringCategoryConfig[]> = {};
    for (const t of list) {
      initial[t.id] = [...t.scoring_categories];
    }
    setEdited(initial);
    setLoading(false);
  };

  const handlePointsChange = (templateId: string, categoryKey: string, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return;
    setEdited((prev) => ({
      ...prev,
      [templateId]: prev[templateId].map((cat) =>
        cat.key === categoryKey ? { ...cat, basePoints: num } : cat
      ),
    }));
  };

  const handleSave = async (templateId: string) => {
    setSaving(true);
    const categories = edited[templateId];
    const { error } = await supabase
      .from('curriculum_templates')
      .update({ scoring_categories: categories, updated_at: new Date().toISOString() })
      .eq('id', templateId);
    if (error) {
      toast.error('저장 실패');
    } else {
      toast.success('점수 설정이 저장되었습니다');
      await loadTemplates();
    }
    setSaving(false);
  };

  const hasChanges = (templateId: string) => {
    const original = templates.find((t) => t.id === templateId);
    if (!original || !edited[templateId]) return false;
    return JSON.stringify(original.scoring_categories) !== JSON.stringify(edited[templateId]);
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">설정</h1>

      <div className="space-y-6">
        {templates.map((template) => (
          <div key={template.id} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                {CLUB_TYPE_LABELS[template.club_type] || template.club_type}
              </h2>
              <button
                onClick={() => handleSave(template.id)}
                disabled={saving || !hasChanges(template.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  hasChanges(template.id)
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">카테고리별 기본 점수를 설정합니다.</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(edited[template.id] || []).map((cat) => (
                <div key={cat.key} className="bg-gray-50 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {cat.label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={cat.basePoints}
                      onChange={(e) => handlePointsChange(template.id, cat.key, e.target.value)}
                      className="w-full text-center text-lg font-bold border border-gray-300 rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none"
                    />
                    <span className="text-sm text-gray-500 whitespace-nowrap">점</span>
                  </div>
                  {cat.multiplier && (
                    <p className="text-xs text-gray-400 mt-1">
                      x {cat.multiplierLabel || '배수'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
