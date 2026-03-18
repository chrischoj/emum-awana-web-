import { useEffect, useRef, useCallback } from 'react';

/**
 * sessionStorage에 state를 캐시하여 페이지 이탈 후 복귀 시 복원.
 * - 온라인이면 네트워크 데이터를 우선 사용
 * - 오프라인이거나 네트워크 로드 실패 시 캐시에서 복원
 */
export function useSessionCache<T>(
  key: string,
  data: T,
  /** data가 의미 있는 값인지 (빈 객체/배열이 아닌지) */
  hasData: boolean,
) {
  const savedRef = useRef(false);

  // data가 있을 때 sessionStorage에 저장
  useEffect(() => {
    if (!hasData) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(data));
      savedRef.current = true;
    } catch {
      // 용량 초과 등 무시
    }
  }, [key, data, hasData]);

  // 캐시에서 복원
  const restore = useCallback((): T | null => {
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) return JSON.parse(cached) as T;
    } catch {
      // parse 실패 무시
    }
    return null;
  }, [key]);

  return { restore };
}
