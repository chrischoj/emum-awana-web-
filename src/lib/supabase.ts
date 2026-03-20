import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase credentials. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: (url, options = {}) => {
      // 이미 signal이 있으면 (auth 내부 등) 그대로 사용
      if (options.signal) {
        return fetch(url, options);
      }
      // auth 요청(토큰 갱신 등)은 30초, 일반 요청은 30초 타임아웃
      // 모바일에서 다수 동시 쿼리 시 브라우저 연결 제한으로 큐 대기가 발생하므로 넉넉하게 설정
      const urlStr = typeof url === 'string' ? url : url.toString();
      const isAuth = urlStr.includes('/auth/');
      const timeoutMs = isAuth ? 30000 : 30000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeout));
    },
  },
});