import { useEffect, useRef } from 'react';

/**
 * 모바일 백그라운드 ↔ 포그라운드 전환 감지 hook.
 * visibilitychange 이벤트 사용.
 *
 * - onResume: 백그라운드→포그라운드 복귀 시 호출
 * - onBackground: 포그라운드→백그라운드 전환 시 호출 (flush 등)
 */
export function useAppResume(
  onResume: () => void,
  onBackground?: () => void,
) {
  const onResumeRef = useRef(onResume);
  const onBackgroundRef = useRef(onBackground);

  onResumeRef.current = onResume;
  onBackgroundRef.current = onBackground;

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        onResumeRef.current();
      } else if (document.visibilityState === 'hidden') {
        onBackgroundRef.current?.();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
}
