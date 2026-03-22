import { useState, useCallback, useRef, useEffect, useMemo, type RefObject } from 'react';
import type { CurlDirection, CurlGeometry } from '../types';
import { computeCurlGeometry } from '../utils/curlGeometry';
import { playPageTurnSound } from '../utils/audioFeedback';
import {
  CURL_COMPLETE_THRESHOLD,
  CURL_ANIMATION_SPEED,
  SWIPE_VELOCITY_THRESHOLD,
} from '../constants';

interface CurlEffectOptions {
  /** 터치 이벤트를 등록할 스크롤 컨테이너 */
  containerRef: RefObject<HTMLDivElement | null>;
  currentPage: number;
  numPages: number;
  baseWidth: number;
  isZoomed: boolean;
  /** 핀치 중이면 컬 비활성화 */
  isPinching: boolean;
  onPageChange: (page: number) => void;
}

/**
 * 컬 효과 + 페이지 넘기기 터치 훅.
 *
 * 1손가락 수평 스와이프를 감지하여 페이지 컬 애니메이션을 구동하고,
 * 스와이프 완료 시 onPageChange를 호출한다.
 * 2손가락(핀치)은 무시하며 usePinchZoom이 처리한다.
 */
export function useCurlEffect(options: CurlEffectOptions) {
  const {
    containerRef,
    currentPage,
    numPages,
    baseWidth,
    isZoomed,
    isPinching,
    onPageChange,
  } = options;

  const [curlProgress, setCurlProgress] = useState(0);
  const [curlDirection, setCurlDirection] = useState<CurlDirection | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const animFrameRef = useRef<number>(0);
  const soundPlayedRef = useRef(false);

  const touchRef = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    isHorizontal: null as boolean | null,
  });

  // 콜백 내부에서 최신 상태 참조용 ref
  const stateRef = useRef({
    isPinching: false,
    isDragging: false,
    isZoomed: false,
    isAnimating: false,
    currentPage: 1,
    numPages: 0,
    baseWidth: 0,
    curlProgress: 0,
    curlDirection: null as CurlDirection | null,
  });

  // stateRef 동기화
  useEffect(() => {
    stateRef.current = {
      isPinching,
      isDragging,
      isZoomed,
      isAnimating,
      currentPage,
      numPages,
      baseWidth,
      curlProgress,
      curlDirection,
    };
  });

  // 애니메이션 cleanup
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // ---- 컬 애니메이션 (requestAnimationFrame) ----
  const animateCurl = useCallback(
    (from: number, to: number, direction: CurlDirection, onComplete: () => void) => {
      setIsAnimating(true);
      setCurlDirection(direction);
      soundPlayedRef.current = false;
      let lastTime = performance.now();
      let current = from;

      const step = (now: number) => {
        const dt = now - lastTime;
        lastTime = now;
        const delta = CURL_ANIMATION_SPEED * dt;

        if (to > from) {
          current = Math.min(to, current + delta);
        } else {
          current = Math.max(to, current - delta);
        }

        // 중간 지점에서 소리 재생
        if (!soundPlayedRef.current && current > 0.3) {
          playPageTurnSound();
          soundPlayedRef.current = true;
        }

        setCurlProgress(current);

        if ((to > from && current < to) || (to < from && current > to)) {
          animFrameRef.current = requestAnimationFrame(step);
        } else {
          setIsAnimating(false);
          onComplete();
        }
      };

      animFrameRef.current = requestAnimationFrame(step);
    },
    [],
  );

  // ---- 페이지 전환 (버튼 클릭용) ----
  const changePage = useCallback(
    (direction: CurlDirection) => {
      if (isAnimating || isDragging) return;
      const nextPage =
        direction === 'next'
          ? Math.min(numPages, currentPage + 1)
          : Math.max(1, currentPage - 1);
      if (nextPage === currentPage) return;

      animateCurl(0, 1, direction, () => {
        onPageChange(nextPage);
        setCurlProgress(0);
        setCurlDirection(null);
      });
    },
    [currentPage, numPages, isAnimating, isDragging, animateCurl, onPageChange],
  );

  // ---- 터치 핸들러 ----
  const handleTouchStart = useCallback((e: TouchEvent) => {
    const s = stateRef.current;
    if (s.isAnimating) return;
    // 2손가락은 무시 (핀치줌은 usePinchZoom이 처리)
    if (e.touches.length !== 1) return;
    if (s.isZoomed || s.isPinching) return;

    const touch = e.touches[0];
    touchRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      isHorizontal: null,
    };
    setIsDragging(true);
    setCurlProgress(0);
    setCurlDirection(null);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const s = stateRef.current;
    if (!s.isDragging || s.isZoomed || s.isAnimating || s.isPinching) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const dx = touch.clientX - touchRef.current.startX;
    const dy = touch.clientY - touchRef.current.startY;

    // 방향 결정 (한 번만)
    if (touchRef.current.isHorizontal === null) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        touchRef.current.isHorizontal = Math.abs(dx) > Math.abs(dy);
      }
      return;
    }
    if (!touchRef.current.isHorizontal) return;
    if (e.cancelable) e.preventDefault();

    // 드래그 방향 결정
    const dir: CurlDirection = dx < 0 ? 'next' : 'prev';
    const atBoundary =
      (dir === 'prev' && s.currentPage <= 1) || (dir === 'next' && s.currentPage >= s.numPages);

    // progress 계산: 드래그 거리 / 컨테이너 너비
    const absDx = Math.abs(dx);
    let progress = s.baseWidth > 0 ? absDx / s.baseWidth : 0;

    // 경계에서는 rubber-band 효과
    if (atBoundary) {
      progress = progress * 0.15;
    }

    progress = Math.min(1, Math.max(0, progress));

    setCurlDirection(dir);
    setCurlProgress(progress);
  }, []);

  const handleTouchEnd = useCallback(() => {
    const s = stateRef.current;
    if (s.isPinching) return;
    if (!s.isDragging) return;

    const elapsed = Date.now() - touchRef.current.startTime;
    const dx =
      s.curlDirection === 'next' ? -s.curlProgress * s.baseWidth : s.curlProgress * s.baseWidth;
    const velocity = Math.abs(dx) / elapsed;
    const shouldComplete =
      s.curlProgress > CURL_COMPLETE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD;

    setIsDragging(false);

    if (shouldComplete && s.curlDirection) {
      const canGo =
        s.curlDirection === 'next' ? s.currentPage < s.numPages : s.currentPage > 1;
      if (canGo) {
        const dir = s.curlDirection;
        const cp = s.currentPage;
        animateCurl(s.curlProgress, 1, dir, () => {
          const nextPage = dir === 'next' ? cp + 1 : cp - 1;
          onPageChange(nextPage);
          setCurlProgress(0);
          setCurlDirection(null);
        });
        return;
      }
    }

    // 스냅백 애니메이션
    if (s.curlProgress > 0 && s.curlDirection) {
      const dir = s.curlDirection;
      animateCurl(s.curlProgress, 0, dir, () => {
        setCurlProgress(0);
        setCurlDirection(null);
      });
    } else {
      setCurlProgress(0);
      setCurlDirection(null);
    }
  }, [animateCurl, onPageChange]);

  // ---- 네이티브 터치 이벤트 등록 (passive: false) ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: false });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerRef, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // ---- 컬 기하학 계산 (메모이즈) ----
  const curlGeometry: CurlGeometry | null = useMemo(() => {
    if (curlProgress <= 0 || !curlDirection) return null;
    return computeCurlGeometry(curlProgress, curlDirection);
  }, [curlProgress, curlDirection]);

  // 대상 페이지 번호 (컬 아래에 보일 페이지)
  const destinationPage = useMemo(() => {
    if (!curlDirection) return null;
    if (curlDirection === 'next' && currentPage < numPages) return currentPage + 1;
    if (curlDirection === 'prev' && currentPage > 1) return currentPage - 1;
    return null;
  }, [curlDirection, currentPage, numPages]);

  // 컬 활성 상태
  const isCurling = curlProgress > 0 && curlDirection !== null;

  /** fileUrl 변경 시 상태 리셋용 */
  const resetCurl = useCallback(() => {
    setCurlProgress(0);
    setCurlDirection(null);
    setIsAnimating(false);
    setIsDragging(false);
  }, []);

  return {
    curlProgress,
    curlDirection,
    isAnimating,
    isDragging,
    isCurling,
    curlGeometry,
    destinationPage,
    changePage,
    resetCurl,
  };
}
