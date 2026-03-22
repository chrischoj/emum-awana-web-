import { useState, useCallback, useEffect, type RefObject } from 'react';

/**
 * 풀스크린 토글 훅.
 * 네이티브 Fullscreen API를 우선 시도하고,
 * 지원하지 않는 환경(iOS Safari 등)에서는 CSS 기반 폴백으로 동작한다.
 */
export function useFullscreen(containerRef: RefObject<HTMLDivElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    if (isFullscreen) {
      // 해제
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
          return; // fullscreenchange 이벤트가 상태 업데이트
        }
      } catch {
        /* fallthrough to CSS */
      }
      setIsFullscreen(false);
    } else {
      // 진입: 네이티브 시도 -> 실패하면 CSS 폴백
      try {
        const rfs =
          el.requestFullscreen ??
          (el as HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> })
            .webkitRequestFullscreen;
        if (rfs) {
          await rfs.call(el);
          return; // fullscreenchange 이벤트가 상태 업데이트
        }
      } catch {
        /* fallthrough to CSS */
      }
      // CSS 기반 전체화면 (iOS Safari 등)
      setIsFullscreen(true);
    }
  }, [isFullscreen, containerRef]);

  // 네이티브 fullscreenchange 이벤트 리스너
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  return {
    isFullscreen,
    toggleFullscreen,
  };
}
