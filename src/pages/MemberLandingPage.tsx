import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function MemberLandingPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="mb-6">
          <img src="/eeum-logo.png" alt="이음교회" className="h-16 mx-auto mb-4 object-contain" />
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            가입 요청이 완료되었습니다
          </h1>
          <p className="text-gray-600 text-sm leading-relaxed">
            어와나 클럽원 기능은 현재 준비 중입니다.
            <br />
            담당 교사분에게 문의해 주시면,
            <br />
            가입 승인 후 안내드리겠습니다.
          </p>
        </div>

        <div className="bg-indigo-50 rounded-xl p-4 mb-6">
          <p className="text-indigo-700 text-sm font-medium">
            나중에 클럽원 전용 기능이 추가되면
            <br />
            이 계정으로 바로 이용하실 수 있어요!
          </p>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
