import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const resolvedEmail = loginId.includes('@') ? loginId : `${loginId.trim().replace(/[^0-9]/g, '')}@awana.local`;
      const { error } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      });

      if (error) throw error;

      const redirect = searchParams.get('redirect');
      const isValidRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//');
      navigate(isValidRedirect ? redirect : '/');
      toast.success('로그인되었습니다!');
    } catch (error) {
      console.error('Login error:', error);
      toast.error('로그인에 실패했습니다. 이름/이메일 또는 비밀번호를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="text-center mb-8">
          <img src="/eeum-logo.png" alt="이음교회" className="h-16 mx-auto mb-3 object-contain" />
          <h2 className="text-2xl font-bold text-gray-900">이음 AWANA</h2>
          <p className="mt-2 text-sm text-gray-600">전화번호 또는 이메일로 로그인해주세요</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="loginId" className="block text-sm font-medium text-gray-700">
              전화번호 또는 이메일
            </label>
            <input
              id="loginId"
              type="text"
              required
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="01012345678"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                const redirectParam = searchParams.get('redirect');
                const qrMatch = redirectParam?.match(/^\/qr\/(.+)$/);
                const signupPath = qrMatch ? `/signup?roomId=${qrMatch[1]}` : '/signup';
                navigate(signupPath);
              }}
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              계정이 없으신가요? 회원가입하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;