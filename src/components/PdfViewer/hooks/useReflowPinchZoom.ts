import { useRef, useEffect, useCallback, type RefObject } from 'react';
import { getTouchDistanceNative } from '../utils/touchUtils';
import { MIN_SCALE, MAX_SCALE } from '../constants';

const DOUBLE_TAP_DELAY = 300;
const DOUBLE_TAP_DISTANCE = 30;
const SETTLE_MS = 350;
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
 * - 놓을 때: transform → scale(1) 애니메이션 + font-size 전환 동시 실행
 *   → 시각적으로 부드럽게 글자 크기가 변하면서 리플로우 (네이버 시리즈 스타일)
 * - 더블탭: 1x ↔ 2x 토글 (font-size transition으로 부드럽게)
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
    if (targetScale > MAX_SCALE) {
      visualRatio = (MAX_SCALE + (targetScale - MAX_SCALE) * RUBBER_BAND) / ps.startScale;
    } else if (targetScale < MIN_SCALE) {
      visualRatio = (MIN_SCALE - (MIN_SCALE - targetScale) * RUBBER_BAND) / ps.startScale;
    }

    ps.currentRatio = visualRatio;
    const wrapper = transformRef.current;
    if (wrapper) {
      wrapper.style.transform = `scale(${visualRatio})`;
    }
  }, [transformRef]);

  // --- 핀치 끝 ---
  const handlePinchEnd = useCallback(() => {
    const ps = pinchRef.current;
    if (!ps.active) return;
    ps.active = false;

    const wrapper = transformRef.current;
    if (!wrapper) {
      setScale(clamp(ps.startScale * ps.currentRatio, MIN_SCALE, MAX_SCALE));
      return;
    }

    const finalScale = clamp(
      Math.round(ps.startScale * ps.currentRatio * 20) / 20,
      MIN_SCALE,
      MAX_SCALE,
    );

    settlingRef.current = true;
    const curve = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

    // transform wrapper: scale → 1 애니메이션
    wrapper.style.transition = `transform ${SETTLE_MS}ms ${curve}`;
    wrapper.style.transform = 'scale(1)';

    // scale 업데이트 → font-size transition 동시 실행 (시각적으로 상쇄)
    setScale(finalScale);

    const cleanup = () => {
      wrapper.removeEventListener('transitionend', onEnd);
      clearTimeout(fb);
      wrapper.style.transform = '';
      wrapper.style.transformOrigin = '';
      wrapper.style.transition = '';
      wrapper.style.willChange = '';
      settlingRef.current = false;
    };
    const onEnd = (ev: TransitionEvent) => {
      if (ev.target === wrapper) cleanup();
    };
    wrapper.addEventListener('transitionend', onEnd);
    const fb = setTimeout(cleanup, SETTLE_MS + 50);
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
