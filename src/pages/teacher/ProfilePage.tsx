import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AvatarUpload } from '../../components/ui/AvatarUpload';

const POSITIONS = ['조정관', '감독관', '서기', '게임디렉터', '회계', '교사', '보조 교사'] as const;

export default function ProfilePage() {
  const { teacher, user, refreshTeacher } = useAuth();
  const { clubs } = useClub();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(teacher?.name ?? '');
  const [phone, setPhone] = useState(teacher?.phone ?? '');
  const [clubId, setClubId] = useState(teacher?.club_id ?? '');
  const [position, setPosition] = useState(teacher?.position ?? '');

  const handleAvatarUpload = async (url: string) => {
    if (!teacher) return;
    const { error } = await supabase
      .from('teachers')
      .update({ avatar_url: url })
      .eq('id', teacher.id);
    if (error) {
      toast.error('프로필 사진 저장 실패');
      return;
    }
    await refreshTeacher();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacher) return;
    setLoading(true);

    try {
      const { error } = await supabase
        .from('teachers')
        .update({
          name: name.trim(),
          phone: phone.trim() || null,
          club_id: clubId || null,
          position: position || null,
        })
        .eq('id', teacher.id);

      if (error) throw error;
      await refreshTeacher();
      toast.success('프로필이 수정되었습니다.');
      navigate(-1);
    } catch (error) {
      toast.error('프로필 수정에 실패했습니다.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">프로필 수정</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex justify-center">
          <AvatarUpload
            currentUrl={teacher?.avatar_url}
            name={teacher?.name || ''}
            folder="teachers"
            entityId={teacher?.id || ''}
            onUpload={handleAvatarUpload}
            size="lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            type="email"
            value={user?.email ?? ''}
            disabled
            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            placeholder="이름을 입력하세요"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            placeholder="010-1234-5678"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">소속 클럽</label>
          <select
            value={clubId}
            onChange={(e) => setClubId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          >
            <option value="">없음 (그 외)</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name} ({club.type === 'sparks' ? 'Sparks' : 'T&T'})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">직책</label>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          >
            <option value="">선택 안함</option>
            {POSITIONS.map((pos) => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full py-2.5 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
        >
          {loading ? '저장 중...' : '저장'}
        </button>
      </form>
    </div>
  );
}
