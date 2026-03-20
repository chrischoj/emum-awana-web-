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
      // auth 요청(토큰 갱신 등)은 30초, 일반 요청은 10초 타임아웃
      const urlStr = typeof url === 'string' ? url : url.toString();
      const isAuth = urlStr.includes('/auth/');
      const timeoutMs = isAuth ? 30000 : 10000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeout));
    },
  },
});