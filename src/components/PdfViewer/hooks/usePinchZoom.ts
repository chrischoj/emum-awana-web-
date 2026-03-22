import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { getTouchDistanceNative } from '../utils/touchUtils';
import { MIN_SCALE, MAX_SCALE } from '../constants';

/** 러버밴드 탄성 계수 (경계 초과 시 저항) */
const RUBBER_BAND_FACTOR = 0.25;
/** 스프링 바운스 백 타이밍 */
const SPRING_TRANSITION = 'transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.05)';
/** 더블탭 감지 시간 (ms) */
const DOUBLE_TAP_DELAY = 300;
/** 더블탭 거리 허용치 (px) */
const DOUBLE_TAP_DISTANCE = 30;
/** 더블탭 줌 레벨 */
const DOUBLE_TAP_SCALE = 2;

function getTouchCenter(touches: TouchList) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

/** 경계를 벗어날 때 러버밴드 적용 */
function applyRubberBand(targetScale: number): number {
  if (targetScale > MAX_SCALE) {
    const over = targetScale - MAX_SCALE;
    return MAX_SCALE + over * RUBBER_BAND_FACTOR;
  }
  if (targetScale < MIN_SCALE) {
    const under = MIN_SCALE - targetScale;
    return MIN_SCALE - under * RUBBER_BAND_FACTOR;
  }
  return targetScale;
}

/** 경계 내로 클램프 */
function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

interface PinchZoomOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  scale: number;
  setScale: (s: number) => void;
  enabled: boolean;
}

/**
 * 갤러리 수준 핀치 줌 훅.
 *
 * - 핀치 중: CSS transform 직접 조작 (리렌더 제로)
 * - 핀치+팬: translate + scale 동시 적용
 * - 러버밴드: min/max 경계에서 탄성 저항
 * - 스프링: 놓을 때 물리 기반 바운스 애니메이션
 * - 더블탭: 1x ↔ 2x 줌 토글
 * - 연속 줌: 스냅 없이 정확한 스케일 유지
 */
export function usePinchZoom({
  containerRef,
  contentRef,
  scale,
  setScale,
  enabled,
}: PinchZoomOptions) {
  const [isPinching, setIsPinching] = useState(false);

  const pinchRef = useRef({
    active: false,
    startDist: 0,
    startScale: 1,
    // 핀치 시작 시 화면 좌표 기준 중심점
    startCenterX: 0,
    startCenterY: 0,
    // 컨테이너 기준 좌표 (transformOrigin용)
    originX: 0,
    originY: 0,
    // 현재 상대 스케일 & 이동
    currentVisualScale: 1,
    translateX: 0,
    translateY: 0,
  });

  const scaleRef = useRef(scale);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // 더블탭 감지
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const settlingRef = useRef(false);

  // --- 트랜지션 안착 유틸 ---
  const settleTransform = useCallback((
    content: HTMLDivElement,
    finalScale: number,
    animated: boolean,
    onDone?: () => void,
  ) => {
    settlingRef.current = true;
    const snapScale = clampScale(finalScale);
    const relativeScale = snapScale / pinchRef.current.startScale;

    if (animated) {
      content.style.transition = SPRING_TRANSITION;
      content.style.transform = `translate(${pinchRef.current.translateX}px, ${pinchRef.current.translateY}px) scale(${relativeScale})`;

      const cleanup = () => {
        content.removeEventListener('transitionend', cleanup);
        clearTimeout(fallback);
        content.style.transform = '';
        content.style.transformOrigin = '';
        content.style.transition = '';
        settlingRef.current = false;
        setScale(snapScale);
        setIsPinching(false);
        onDone?.();
      };
      content.addEventListener('transitionend', cleanup, { once: true });
      const fallback = setTimeout(cleanup, 400);
    } else {
      content.style.transform = '';
      content.style.transformOrigin = '';
      content.style.transition = '';
      settlingRef.current = false;
      setScale(snapScale);
      setIsPinching(false);
      onDone?.();
    }
  }, [setScale]);

  // --- 핀치 시작 ---
  const handlePinchStart = useCallback((e: TouchEvent) => {
    if (!enabledRef.current || settlingRef.current) return;
    if (e.touches.length !== 2) return;
    if (e.cancelable) e.preventDefault();

    const ps = pinchRef.current;
    ps.startDist = getTouchDistanceNative(e.touches);
    ps.startScale = scaleRef.current;
    ps.active = true;
    ps.currentVisualScale = 1;
    ps.translateX = 0;
    ps.translateY = 0;

    const center = getTouchCenter(e.touches);
    ps.startCenterX = center.x;
    ps.startCenterY = center.y;

    // 컨테이너 기준 좌표 (transformOrigin)
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      ps.originX = center.x - rect.left + container.scrollLeft;
      ps.originY = center.y - rect.top + container.scrollTop;
    }

    setIsPinching(true);
  }, [containerRef]);

  // --- 핀치 이동 ---
  const handlePinchMove = useCallback((e: TouchEvent) => {
    const ps = pinchRef.current;
    if (!ps.active || e.touches.length !== 2) return;
    if (e.cancelable) e.preventDefault();

    const currentDist = getTouchDistanceNative(e.touches);
    const ratio = currentDist / ps.startDist;
    const targetScale = ps.startScale * ratio;

    // 러버밴드 적용 (경계 초과 시 탄성 저항)
    const elasticScale = applyRubberBand(targetScale);
    const visualScale = elasticScale / ps.startScale;
    ps.currentVisualScale = visualScale;

    // 핀치 중 팬: 두 손가락 중심점 이동량 추적
    const center = getTouchCenter(e.touches);
    ps.translateX = center.x - ps.startCenterX;
    ps.translateY = center.y - ps.startCenterY;

    // GPU 가속 CSS transform 직접 조작 (리렌더 제로)
    const content = contentRef.current;
    if (content) {
      content.style.transform = `translate(${ps.translateX}px, ${ps.translateY}px) scale(${visualScale})`;
      content.style.transformOrigin = `${ps.originX}px ${ps.originY}px`;
      content.style.transition = 'none';
      content.style.willChange = 'transform';
    }
  }, [contentRef]);

  // --- 핀치 끝 ---
  const handlePinchEnd = useCallback(() => {
    const ps = pinchRef.current;
    if (!ps.active) return;
    ps.active = false;

    const finalScale = ps.startScale * ps.currentVisualScale;
    const content = contentRef.current;
    if (!content) {
      setScale(clampScale(finalScale));
      setIsPinching(false);
      return;
    }

    content.style.willChange = '';

    // 경계를 초과했으면 스프링으로 바운스 백
    const needsBounce = finalScale > MAX_SCALE || finalScale < MIN_SCALE;
    settleTransform(content, finalScale, needsBounce || Math.abs(ps.translateX) > 5 || Math.abs(ps.translateY) > 5);
  }, [contentRef, setScale, settleTransform]);

  // --- 더블탭 줌 ---
  const handleDoubleTap = useCallback((e: TouchEvent) => {
    if (!enabledRef.current || settlingRef.current) return;
    if (e.touches.length !== 1) return;

    const now = Date.now();
    const touch = e.touches[0];
    const last = lastTapRef.current;
    const timeDiff = now - last.time;
    const dist = Math.sqrt((touch.clientX - last.x) ** 2 + (touch.clientY - last.y) ** 2);

    // 현재 탭 기록
    lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };

    if (timeDiff > DOUBLE_TAP_DELAY || dist > DOUBLE_TAP_DISTANCE) return;

    // 더블탭 감지됨
    if (e.cancelable) e.preventDefault();
    lastTapRef.current = { time: 0, x: 0, y: 0 }; // 리셋

    const content = contentRef.current;
    const container = containerRef.current;
    if (!content || !container) return;

    const currentScale = scaleRef.current;
    const targetScale = currentScale > 1.05 ? 1 : DOUBLE_TAP_SCALE;

    // 탭 위치 기준으로 줌
    const rect = container.getBoundingClientRect();
    const originX = touch.clientX - rect.left + container.scrollLeft;
    const originY = touch.clientY - rect.top + container.scrollTop;

    const ps = pinchRef.current;
    ps.startScale = currentScale;
    ps.originX = originX;
    ps.originY = originY;
    ps.translateX = 0;
    ps.translateY = 0;

    content.style.transformOrigin = `${originX}px ${originY}px`;
    const relativeScale = targetScale / currentScale;
    content.style.transition = SPRING_TRANSITION;
    content.style.transform = `scale(${relativeScale})`;

    setIsPinching(true);
    settlingRef.current = true;

    const cleanup = () => {
      content.removeEventListener('transitionend', cleanup);
      clearTimeout(fallback);
      content.style.transform = '';
      content.style.transformOrigin = '';
      content.style.transition = '';
      settlingRef.current = false;
      setScale(targetScale);
      setIsPinching(false);
    };
    content.addEventListener('transitionend', cleanup, { once: true });
    const fallback = setTimeout(cleanup, 400);
  }, [containerRef, contentRef, setScale]);

  // --- 이벤트 등록 ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        handlePinchStart(e);
      } else if (e.touches.length === 1) {
        handleDoubleTap(e);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (pinchRef.current.active) handlePinchMove(e);
    };
    const onTouchEnd = () => {
      if (pinchRef.current.active) handlePinchEnd();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [containerRef, handlePinchStart, handlePinchMove, handlePinchEnd, handleDoubleTap]);

  return { isPinching };
}
