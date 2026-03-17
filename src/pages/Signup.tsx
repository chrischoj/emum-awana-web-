import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { AvatarUpload } from '../components/ui/AvatarUpload';

type TabType = 'teacher' | 'member';

const initialFormData = {
  email: '',
  password: '',
  confirmPassword: '',
  name: '',
  phone: '',
  clubId: '',
  birthday: '',
  parentName: '',
  parentPhone: '',
};

const Signup = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('teacher');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  // 2단계: 가입 후 사진 업로드
  const [registered, setRegistered] = useState<{ id: string; name: string; folder: 'teachers' | 'members' } | null>(null);

  const [clubs, setClubs] = useState<{ id: string; name: string; type: string }[]>([]);

  useEffect(() => {
    const fetchClubs = async () => {
      const { data } = await supabase.from('clubs').select('id, name, type');
      if (data) setClubs(data);
    };
    fetchClubs();
  }, []);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setFormData(initialFormData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmitTeacher = async () => {
    // Sign up with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          role: 'teacher',
        },
      },
    });

    if (authError) throw authError;

    // 이미 가입된 이메일인 경우 (Supabase는 보안상 동일 응답을 줌)
    if (!authData.user?.identities?.length) {
      toast.error('이미 가입된 이메일입니다. 로그인해주세요.');
      navigate('/login');
      return;
    }

    // Create teacher profile
    const { data: teacherData, error: profileError } = await supabase
      .from('teachers')
      .insert({
        user_id: authData.user?.id,
        name: formData.name,
        phone: formData.phone,
        club_id: formData.clubId,
        role: 'teacher',
      })
      .select('id, name')
      .single();

    if (profileError) throw profileError;

    toast.success('회원가입이 완료되었습니다!');
    setRegistered({ id: teacherData.id, name: teacherData.name, folder: 'teachers' });
  };

  const handleSubmitMember = async () => {
    // Sign up with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          role: 'member',
        },
      },
    });

    if (authError) throw authError;

    // 이미 가입된 이메일인 경우
    if (!authData.user?.identities?.length) {
      toast.error('이미 가입된 이메일입니다. 로그인해주세요.');
      navigate('/login');
      return;
    }

    // Create member profile
    const { data: memberData, error: profileError } = await supabase
      .from('members')
      .insert({
        name: formData.name,
        birthday: formData.birthday || null,
        parent_name: formData.parentName || null,
        parent_phone: formData.parentPhone || null,
        club_id: formData.clubId,
        enrollment_status: 'pending',
        active: true,
        registered_by: null,
      })
      .select('id, name')
      .single();

    if (profileError) throw profileError;

    toast.success('회원가입이 완료되었습니다!');
    setRegistered({ id: memberData.id, name: memberData.name, folder: 'members' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (formData.password !== formData.confirmPassword) {
        throw new Error('비밀번호가 일치하지 않습니다.');
      }

      if (activeTab === 'teacher') {
        await handleSubmitTeacher();
      } else {
        await handleSubmitMember();
      }
    } catch (error) {
      console.error('Signup error:', error);
      toast.error(error instanceof Error ? error.message : '회원가입에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (url: string) => {
    if (!registered) return;
    const table = registered.folder === 'teachers' ? 'teachers' : 'members';
    const { error } = await supabase
      .from(table)
      .update({ avatar_url: url })
      .eq('id', registered.id);
    if (error) {
      toast.error('사진 저장 실패');
      return;
    }
    toast.success('프로필 사진이 등록되었습니다!');
  };

  const inputClass =
    'mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500';

  // 2단계: 프로필 사진 업로드
  if (registered) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-6">
            <img src="/eeum-logo.png" alt="이음교회" className="h-16 mx-auto mb-3 object-contain" />
            <h2 className="text-2xl font-bold text-gray-900">프로필 사진 등록</h2>
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-semibold">{registered.name}</span>님의 프로필 사진을 등록해주세요
            </p>
          </div>

          <div className="flex justify-center py-4">
            <AvatarUpload
              currentUrl={null}
              name={registered.name}
              folder={registered.folder}
              entityId={registered.id}
              onUpload={handleAvatarUpload}
              size="lg"
            />
          </div>

          <button
            onClick={() => navigate('/login')}
            className="w-full mt-4 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            로그인하러 가기
          </button>
          <p className="text-center text-xs text-gray-400 mt-3">
            이메일 확인 후 로그인해주세요
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="text-center mb-6">
          <img src="/eeum-logo.png" alt="이음교회" className="h-16 mx-auto mb-3 object-contain" />
          <h2 className="text-2xl font-bold text-gray-900">
            {activeTab === 'teacher' ? '교사 회원가입' : '클럽원 회원가입'}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {activeTab === 'teacher'
              ? '이음 AWANA 교사 계정을 만들어주세요'
              : '이음 AWANA 클럽원 계정을 만들어주세요'}
          </p>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-6">
          {([{ key: 'teacher', label: '교사' }, { key: 'member', label: '클럽원' }] as { key: TabType; label: string }[]).map(
            ({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleTabChange(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 공통: 이메일 */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              className={inputClass}
              placeholder="your@email.com"
            />
          </div>

          {/* 공통: 비밀번호 */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={formData.password}
              onChange={handleChange}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          {/* 공통: 비밀번호 확인 */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              비밀번호 확인
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              value={formData.confirmPassword}
              onChange={handleChange}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          {/* 공통: 이름 */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              이름
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              className={inputClass}
              placeholder="홍길동"
            />
          </div>

          {/* 교사 전용: 전화번호 */}
          {activeTab === 'teacher' && (
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                전화번호
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                value={formData.phone}
                onChange={handleChange}
                className={inputClass}
                placeholder="010-1234-5678"
              />
            </div>
          )}

          {/* 클럽원 전용: 생년월일 */}
          {activeTab === 'member' && (
            <div>
              <label htmlFor="birthday" className="block text-sm font-medium text-gray-700">
                생년월일 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <input
                id="birthday"
                name="birthday"
                type="date"
                value={formData.birthday}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
          )}

          {/* 클럽원 전용: 보호자 이름 */}
          {activeTab === 'member' && (
            <div>
              <label htmlFor="parentName" className="block text-sm font-medium text-gray-700">
                보호자 이름 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <input
                id="parentName"
                name="parentName"
                type="text"
                value={formData.parentName}
                onChange={handleChange}
                className={inputClass}
                placeholder="홍부모"
              />
            </div>
          )}

          {/* 클럽원 전용: 보호자 연락처 */}
          {activeTab === 'member' && (
            <div>
              <label htmlFor="parentPhone" className="block text-sm font-medium text-gray-700">
                보호자 연락처 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <input
                id="parentPhone"
                name="parentPhone"
                type="tel"
                value={formData.parentPhone}
                onChange={handleChange}
                className={inputClass}
                placeholder="010-1234-5678"
              />
            </div>
          )}

          {/* 공통: 소속 클럽 */}
          <div>
            <label htmlFor="clubId" className="block text-sm font-medium text-gray-700">
              소속 클럽
            </label>
            <select
              id="clubId"
              name="clubId"
              required
              value={formData.clubId}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="">클럽을 선택해주세요</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name} ({club.type === 'sparks' ? 'Sparks' : 'T&T'})
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? '처리 중...' : '회원가입'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              이미 계정이 있으신가요? 로그인하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Signup;
