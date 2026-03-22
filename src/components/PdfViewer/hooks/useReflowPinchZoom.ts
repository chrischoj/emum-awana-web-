import { useRef, useEffect, useCallback, type RefObject } from 'react';
import { getTouchDistanceNative } from '../utils/touchUtils';
import { MIN_SCALE, REFLOW_REFLOW_MAX_SCALE } from '../constants';

const DOUBLE_TAP_DELAY = 300;
const DOUBLE_TAP_DISTANCE = 30;
const RUBBER_BAND = 0.25;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

interface ReflowPinchOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  transformRef: RefObject<HTMLDivElement | null>;
  scale: number;
  setScale: (s: number) => void;
  enabled: boolean;
}

/**
 * 리플로우 모드 전용 핀치 줌.
 *
 * - 핀치 중: transform wrapper에 CSS scale (60fps, 리플로우 없음)
 * - 놓을 때: 즉시 숨김 → transform 제거 + font-size 변경 → 페이드 인
 *   (부모 ReflowViewer의 scale 변경 감지 useEffect가 페이드 처리)
 * - 더블탭: 1x ↔ 2x 토글
 */
export function useReflowPinchZoom({
  scrollRef,
  transformRef,
  scale,
  setScale,
  enabled,
}: ReflowPinchOptions) {
  const scaleRef = useRef(scale);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const pinchRef = useRef({
    active: false,
    startDist: 0,
    startScale: 1,
    currentRatio: 1,
  });

  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const settlingRef = useRef(false);

  // --- 더블탭: 1x ↔ 2x 토글 ---
  const handleDoubleTap = useCallback((e: TouchEvent) => {
    if (!enabledRef.current || settlingRef.current) return;
    if (e.touches.length !== 1) return;

    const now = Date.now();
    const t = e.touches[0];
    const last = lastTapRef.current;
    const dt = now - last.time;
    const dist = Math.hypot(t.clientX - last.x, t.clientY - last.y);
    lastTapRef.current = { time: now, x: t.clientX, y: t.clientY };

    if (dt > DOUBLE_TAP_DELAY || dist > DOUBLE_TAP_DISTANCE) return;
    if (e.cancelable) e.preventDefault();
    lastTapRef.current = { time: 0, x: 0, y: 0 };

    setScale(scaleRef.current > 1.05 ? 1 : 2);
  }, [setScale]);

  // --- 핀치 시작 ---
  const handlePinchStart = useCallback((e: TouchEvent) => {
    if (!enabledRef.current || settlingRef.current) return;
    if (e.touches.length !== 2) return;
    if (e.cancelable) e.preventDefault();

    const ps = pinchRef.current;
    ps.active = true;
    ps.startDist = getTouchDistanceNative(e.touches);
    ps.startScale = scaleRef.current;
    ps.currentRatio = 1;

    const wrapper = transformRef.current;
    if (wrapper) {
      wrapper.style.transition = 'none';
      wrapper.style.willChange = 'transform';
      wrapper.style.transformOrigin = 'center top';
    }
  }, [transformRef]);

  // --- 핀치 이동 ---
  const handlePinchMove = useCallback((e: TouchEvent) => {
    const ps = pinchRef.current;
    if (!ps.active || e.touches.length !== 2) return;
    if (e.cancelable) e.preventDefault();

    const dist = getTouchDistanceNative(e.touches);
    const ratio = dist / ps.startDist;
    const targetScale = ps.startScale * ratio;

    // 경계 밖 러버밴드
    let visualRatio = ratio;
    if (targetScale > REFLOW_MAX_SCALE) {
      visualRatio = (REFLOW_MAX_SCALE + (targetScale - REFLOW_MAX_SCALE) * RUBBER_BAND) / ps.startScale;
    } else if (targetScale < MIN_SCALE) {
      visualRatio = (MIN_SCALE - (MIN_SCALE - targetScale) * RUBBER_BAND) / ps.startScale;
    }

    ps.currentRatio = visualRatio;
    const wrapper = transformRef.current;
    if (wrapper) {
      wrapper.style.transform = `scale(${visualRatio})`;
    }
  }, [transformRef]);

  // --- 핀치 끝: 즉시 숨김 → 스케일 반영 → 부모가 페이드 인 ---
  const handlePinchEnd = useCallback(() => {
    const ps = pinchRef.current;
    if (!ps.active) return;
    ps.active = false;

    const wrapper = transformRef.current;
    const finalScale = clamp(
      Math.round(ps.startScale * ps.currentRatio * 20) / 20,
      MIN_SCALE,
      REFLOW_MAX_SCALE,
    );

    if (!wrapper) {
      setScale(finalScale);
      return;
    }

    settlingRef.current = true;

    // transform 즉시 제거 (useLayoutEffect가 content opacity로 플래시 방지)
    wrapper.style.transition = 'none';
    wrapper.style.transform = '';
    wrapper.style.transformOrigin = '';
    wrapper.style.willChange = '';

    // scale 반영 → ReflowViewer useLayoutEffect가 숨김→리플로우→표시
    setScale(finalScale);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        settlingRef.current = false;
      });
    });
  }, [transformRef, setScale]);

  // --- 이벤트 등록 ---
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) handlePinchStart(e);
      else if (e.touches.length === 1) handleDoubleTap(e);
    };
    const onMove = (e: TouchEvent) => {
      if (pinchRef.current.active) handlePinchMove(e);
    };
    const onEnd = () => {
      if (pinchRef.current.active) handlePinchEnd();
    };

    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('touchcancel', onEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [scrollRef, handlePinchStart, handlePinchMove, handlePinchEnd, handleDoubleTap]);
}
