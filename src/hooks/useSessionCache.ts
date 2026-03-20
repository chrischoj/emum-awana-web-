import { useEffect, useRef, useCallback } from 'react';

const TTL_MS = 24 * 60 * 60 * 1000; // 24시간

interface CacheEntry<T> {
  data: T;
  ts: number;
}

/**
 * localStorage 기반 state 캐시.
 * - 온라인: 네트워크 데이터 우선
 * - 오프라인/네트워크 실패/백그라운드 복귀 시: 캐시에서 복원
 * - 24시간 TTL로 오래된 캐시 자동 폐기
 *
 * 기존 sessionStorage에서 localStorage로 변경:
 *   모바일 백그라운드 전환 후 페이지 reload 시에도 데이터 유지
 */
export function useSessionCache<T>(
  key: string,
  data: T,
  /** data가 의미 있는 값인지 (빈 객체/배열이 아닌지) */
  hasData: boolean,
) {
  const savedRef = useRef(false);

  // data가 있을 때 localStorage에 저장
  useEffect(() => {
    if (!hasData) return;
    try {
      const entry: CacheEntry<T> = { data, ts: Date.now() };
      localStorage.setItem(key, JSON.stringify(entry));
      savedRef.current = true;
    } catch {
      // 용량 초과 등 무시
    }
  }, [key, data, hasData]);

  // 캐시에서 복원 (TTL 검사)
  const restore = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const entry = JSON.parse(raw) as CacheEntry<T>;

      // TTL 초과 시 폐기
      if (Date.now() - entry.ts > TTL_MS) {
        localStorage.removeItem(key);
        return null;
      }

      return entry.data;
    } catch {
      // parse 실패 시 기존 sessionStorage 형식 호환 시도
      try {
        const raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw) as T;
      } catch { /* ignore */ }
      return null;
    }
  }, [key]);

  return { restore };
}
