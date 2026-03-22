import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { getTouchDistanceNative } from '../utils/touchUtils';
import { MIN_SCALE, MAX_SCALE } from '../constants';

// ---- 상수 ----
const RUBBER_BAND = 0.25;
const SPRING = 'transform 0.32s cubic-bezier(0.2, 0.82, 0.3, 1.06)';
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
const DOUBLE_TAP_SCALE = 2.5;

function touchCenter(t: TouchList) {
  return {
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2,
  };
}

function rubberBand(s: number) {
  if (s > MAX_SCALE) return MAX_SCALE + (s - MAX_SCALE) * RUBBER_BAND;
  if (s < MIN_SCALE) return MIN_SCALE - (MIN_SCALE - s) * RUBBER_BAND;
  return s;
}

function clamp(s: number) {
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
 * 갤러리 수준 핀치 줌.
 *
 * PDF는 항상 baseWidth로 렌더하고, 줌은 전적으로 CSS transform으로 처리한다.
 * 핀치 중에는 `translate + scale`을 DOM에 직접 적용하고,
 * 핀치 끝에는 translate를 scroll로 전환한 뒤 setScale만 호출한다.
 * **transform 제거 단계가 없으므로 깜박임이 원천 제거된다.**
 */
export function usePinchZoom({
  containerRef,
  contentRef,
  scale,
  setScale,
  enabled,
}: PinchZoomOptions) {
  const [isPinching, setIsPinching] = useState(false);

  const ps = useRef({
    active: false,
    settling: false,
    startDist: 0,
    startScale: 1,
    // 화면 좌표 기준 시작 중심
    startCX: 0,
    startCY: 0,
    // 컨테이너 내부 좌표 (origin용)
    originX: 0,
    originY: 0,
    // 현재 누적값
    visualScale: 1,
    tx: 0,
    ty: 0,
  });

  const scaleRef = useRef(scale);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  // ---- 핀치 → scroll 전환 유틸 ----
  const commitTransform = useCallback((
    finalScale: number,
    tx: number,
    ty: number,
    animated: boolean,
  ) => {
    const content = contentRef.current;
    const scroll = containerRef.current;
    if (!content || !scroll) {
      setScale(clamp(finalScale));
      setIsPinching(false);
      return;
    }

    const clamped = clamp(finalScale);
    const needsBounce = animated && (finalScale !== clamped);

    if (needsBounce) {
      // 러버밴드 → 클램프로 스프링 바운스
      const bouncedRelative = clamped / ps.current.startScale;
      ps.current.settling = true;
      content.style.transition = SPRING;
      content.style.transform = `translate(${tx}px, ${ty}px) scale(${bouncedRelative})`;
      content.style.transformOrigin = `${ps.current.originX}px ${ps.current.originY}px`;

      const done = () => {
        content.removeEventListener('transitionend', done);
        clearTimeout(fb);
        finalize(clamped, tx, ty, content, scroll);
      };
      content.addEventListener('transitionend', done, { once: true });
      const fb = setTimeout(done, 380);
    } else {
      finalize(clamped, tx, ty, content, scroll);
    }
  }, [containerRef, contentRef, setScale]);

  const finalize = useCallback((
    finalScale: number,
    tx: number,
    ty: number,
    content: HTMLDivElement,
    scroll: HTMLDivElement,
  ) => {
    // translate를 scroll 위치로 전환 (동기 → 깜박임 없음)
    content.style.transition = 'none';
    content.style.transform = `scale(${finalScale})`;
    content.style.transformOrigin = '0 0';
    content.style.willChange = '';

    // 핀치 중심점이 같은 화면 위치에 유지되도록 스크롤 조정
    scroll.scrollLeft = Math.max(0, scroll.scrollLeft - tx);
    scroll.scrollTop = Math.max(0, scroll.scrollTop - ty);

    ps.current.settling = false;
    setScale(finalScale);
    setIsPinching(false);
  }, [setScale]);

  // ---- 핀치 시작 ----
  const onPinchStart = useCallback((e: TouchEvent) => {
    if (!enabledRef.current || ps.current.settling) return;
    if (e.touches.length !== 2) return;
    if (e.cancelable) e.preventDefault();

    const p = ps.current;
    p.startDist = getTouchDistanceNative(e.touches);
    p.startScale = scaleRef.current;
    p.active = true;
    p.visualScale = 1;
    p.tx = 0;
    p.ty = 0;

    const c = touchCenter(e.touches);
    p.startCX = c.x;
    p.startCY = c.y;

    const el = containerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      p.originX = c.x - r.left + el.scrollLeft;
      p.originY = c.y - r.top + el.scrollTop;
    }

    setIsPinching(true);
  }, [containerRef]);

  // ---- 핀치 이동 ----
  const onPinchMove = useCallback((e: TouchEvent) => {
    const p = ps.current;
    if (!p.active || e.touches.length !== 2) return;
    if (e.cancelable) e.preventDefault();

    const dist = getTouchDistanceNative(e.touches);
    const ratio = dist / p.startDist;
    const target = p.startScale * ratio;
    const elastic = rubberBand(target);
    p.visualScale = elastic / p.startScale;

    // 핀치 중 팬: 중심점 이동 추적
    const c = touchCenter(e.touches);
    p.tx = c.x - p.startCX;
    p.ty = c.y - p.startCY;

    const el = contentRef.current;
    if (el) {
      el.style.transform = `translate(${p.tx}px, ${p.ty}px) scale(${p.visualScale})`;
      el.style.transformOrigin = `${p.originX}px ${p.originY}px`;
      el.style.transition = 'none';
      el.style.willChange = 'transform';
    }
  }, [contentRef]);

  // ---- 핀치 끝 ----
  const onPinchEnd = useCallback(() => {
    const p = ps.current;
    if (!p.active) return;
    p.active = false;

    const raw = p.startScale * p.visualScale;
    commitTransform(raw, p.tx, p.ty, true);
  }, [commitTransform]);

  // ---- 더블탭 줌 ----
  const onDoubleTap = useCallback((e: TouchEvent) => {
    if (!enabledRef.current || ps.current.settling || ps.current.active) return;
    if (e.touches.length !== 1) return;

    const now = Date.now();
    const t = e.touches[0];
    const lt = lastTap.current;
    const dt = now - lt.t;
    const dd = Math.sqrt((t.clientX - lt.x) ** 2 + (t.clientY - lt.y) ** 2);

    lastTap.current = { t: now, x: t.clientX, y: t.clientY };
    if (dt > DOUBLE_TAP_MS || dd > DOUBLE_TAP_PX) return;

    // 더블탭 감지
    if (e.cancelable) e.preventDefault();
    lastTap.current = { t: 0, x: 0, y: 0 };

    const content = contentRef.current;
    const scroll = containerRef.current;
    if (!content || !scroll) return;

    const cur = scaleRef.current;
    const target = cur > 1.05 ? 1 : DOUBLE_TAP_SCALE;
    const rect = scroll.getBoundingClientRect();

    // 탭 위치의 컨테이너 내부 좌표
    const ox = t.clientX - rect.left + scroll.scrollLeft;
    const oy = t.clientY - rect.top + scroll.scrollTop;

    ps.current.startScale = cur;
    ps.current.originX = ox;
    ps.current.originY = oy;
    ps.current.settling = true;

    const relScale = target / cur;
    content.style.transformOrigin = `${ox}px ${oy}px`;
    content.style.transition = SPRING;
    content.style.transform = `scale(${relScale})`;
    setIsPinching(true);

    const done = () => {
      content.removeEventListener('transitionend', done);
      clearTimeout(fb);
      // 스크롤 조정: 탭 위치가 같은 화면 좌표에 유지
      const newScrollLeft = ox * target / cur - (t.clientX - rect.left);
      const newScrollTop = oy * target / cur - (t.clientY - rect.top);

      content.style.transition = 'none';
      content.style.transform = `scale(${target})`;
      content.style.transformOrigin = '0 0';
      scroll.scrollLeft = Math.max(0, newScrollLeft);
      scroll.scrollTop = Math.max(0, newScrollTop);
      ps.current.settling = false;
      setScale(target);
      setIsPinching(false);
    };
    content.addEventListener('transitionend', done, { once: true });
    const fb = setTimeout(done, 380);
  }, [containerRef, contentRef, setScale]);

  // ---- 이벤트 등록 ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) onPinchStart(e);
      else if (e.touches.length === 1) onDoubleTap(e);
    };
    const move = (e: TouchEvent) => {
      if (ps.current.active) onPinchMove(e);
    };
    const end = () => {
      if (ps.current.active) onPinchEnd();
    };

    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [containerRef, onPinchStart, onPinchMove, onPinchEnd, onDoubleTap]);

  return { isPinching };
}
