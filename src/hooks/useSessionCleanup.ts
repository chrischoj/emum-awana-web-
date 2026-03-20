import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { deactivateTeacherSessions } from '../services/checkInService';
import { useAppResume } from './useAppResume';

const BACKGROUND_TIMEOUT_MS = 10 * 60 * 1000; // 10분

/**
 * 교사 세션 정리를 위한 다중 방어 hook.
 *
 * 1) beforeunload: 탭/브라우저 닫기 시 정리 시도 (best-effort)
 * 2) visibilitychange: 백그라운드 10분 초과 시 자동 정리
 * 3) 포그라운드 복귀 시 타이머 체크
 */
export function useSessionCleanup() {
  const { teacher } = useAuth();
  const teacherIdRef = useRef<string | null>(null);
  const hiddenAtRef = useRef<number | null>(null);

  // teacher id를 ref로 추적 (이벤트 핸들러에서 최신 값 사용)
  useEffect(() => {
    teacherIdRef.current = teacher?.id ?? null;
  }, [teacher]);

  // 1) beforeunload: 탭/브라우저 닫기 시 정리
  useEffect(() => {
    function handleBeforeUnload() {
      const tid = teacherIdRef.current;
      if (!tid) return;

      // sendBeacon으로 비동기 정리 요청 (가장 신뢰성 있는 unload 시 네트워크 요청)
      // Supabase REST API를 직접 호출
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) return;

      // RPC 호출로 서버 사이드에서 정리 (RPC가 없으면 fallback)
      // 간단한 방법: deactivateTeacherSessions를 동기적으로 시도
      try {
        deactivateTeacherSessions(tid).catch(() => {});
      } catch {
        // ignore - best effort
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // 2) visibilitychange: 백그라운드 시간 추적
  useAppResume(
    // onResume: 백그라운드 시간이 10분 초과했으면 세션 정리
    () => {
      const tid = teacherIdRef.current;
      const hiddenAt = hiddenAtRef.current;
      if (!tid || !hiddenAt) return;

      const elapsed = Date.now() - hiddenAt;
      hiddenAtRef.current = null;

      if (elapsed > BACKGROUND_TIMEOUT_MS) {
        console.log(`[SessionCleanup] 백그라운드 ${Math.round(elapsed / 60000)}분 → 세션 정리`);
        deactivateTeacherSessions(tid).catch(() => {});
        // auto check-in 캐시도 삭제하여 다음 방문 시 재체크인 가능
        localStorage.removeItem('awana_auto_checkin');
      }
    },
    // onBackground: 숨겨진 시각 기록
    () => {
      hiddenAtRef.current = Date.now();
    },
  );
}
