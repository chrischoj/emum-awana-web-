import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { getTouchDistanceNative } from '../utils/touchUtils';
import { MIN_SCALE, MAX_SCALE } from '../constants';

// ---- 상수 ----
/** 경계 초과 시 탄성 저항 */
const RUBBER = 0.2;
/** 스프링 바운스 백 */
const SPRING = 'transform 0.32s cubic-bezier(0.2, 0.82, 0.3, 1.06)';
/** 더블탭 감지 */
const DBL_TAP_MS = 300;
const DBL_TAP_PX = 30;
const DBL_TAP_SCALE = 2.5;

function center(t: TouchList) {
  return {
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2,
  };
}

/** 경계 초과 시 러버밴드 */
function rubber(s: number) {
  if (s > MAX_SCALE) return MAX_SCALE + (s - MAX_SCALE) * RUBBER;
  if (s < MIN_SCALE) return MIN_SCALE - (MIN_SCALE - s) * RUBBER;
  return s;
}

function clamp(s: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

interface Options {
  containerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  scale: number;
  setScale: (s: number) => void;
  enabled: boolean;
}

/**
 * 갤러리 수준 핀치 줌.
 *
 * **핵심 수학**: 항상 `transform-origin: 0 0`을 유지하고,
 * translate로 포커스 포인트가 손가락 아래에 고정되도록 보정한다.
 *
 * 스크롤 좌표계에서 핀치 중심의 위치를 `L`이라 하면 (L = screenPos - rect + scroll):
 *   tx = L * (1 - S1/S0) + panX
 *   ty = L * (1 - S1/S0) + panY
 *
 * 이 공식으로 핀치 중심 아래 콘텐츠가 정확히 손가락을 따라간다.
 * finalize 시 `scroll -= tx`로 translate를 scroll에 흡수하면 시각 변화 제로.
 */
export function usePinchZoom({
  containerRef,
  contentRef,
  scale,
  setScale,
  enabled,
}: Options) {
  const [isPinching, setIsPinching] = useState(false);

  const ps = useRef({
    active: false,
    settling: false,
    startDist: 0,
    startScale: 1,
    // 핀치 시작 시 스크롤 좌표계 위치 (= screenPos - rect + scroll)
    localX: 0,
    localY: 0,
    // 현재 핀치 상태
    totalScale: 1,
    tx: 0,
    ty: 0,
    // 화면 좌표 기준 시작 중심 (팬 계산용)
    startScreenX: 0,
    startScreenY: 0,
  });

  const scaleRef = useRef(scale);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  // ---- finalize: translate → scroll 전환 ----
  const finalize = useCallback((
    finalScale: number,
    tx: number,
    ty: number,
  ) => {
    const content = contentRef.current;
    const scroll = containerRef.current;
    if (!content || !scroll) {
      setScale(clamp(finalScale));
      setIsPinching(false);
      return;
    }

    const clamped = clamp(finalScale);

    // translate를 scroll 위치로 흡수 (동기 → 시각 변화 제로)
    content.style.transition = 'none';
    content.style.transform = `scale(${clamped})`;
    content.style.transformOrigin = '0 0';
    content.style.willChange = '';

    // 핀치 중심이 같은 화면 위치에 유지되도록 스크롤 보정
    // finalScale 기준의 tx를 재계산 (러버밴드로 인해 clamped와 다를 수 있음)
    const p = ps.current;
    const clampedTx = p.localX * (1 - clamped / p.startScale) + (p.tx - p.localX * (1 - p.totalScale / p.startScale));
    const clampedTy = p.localY * (1 - clamped / p.startScale) + (p.ty - p.localY * (1 - p.totalScale / p.startScale));

    scroll.scrollLeft = Math.max(0, scroll.scrollLeft - clampedTx);
    scroll.scrollTop = Math.max(0, scroll.scrollTop - clampedTy);

    ps.current.settling = false;
    setScale(clamped);
    setIsPinching(false);
  }, [containerRef, contentRef, setScale]);

  // ---- 핀치 시작 ----
  const onStart = useCallback((e: TouchEvent) => {
    if (!enabledRef.current || ps.current.settling) return;
    if (e.touches.length !== 2) return;
    if (e.cancelable) e.preventDefault();

    const p = ps.current;
    p.startDist = getTouchDistanceNative(e.touches);
    p.startScale = scaleRef.current;
    p.active = true;
    p.totalScale = p.startScale;
    p.tx = 0;
    p.ty = 0;

    const c = center(e.touches);
    p.startScreenX = c.x;
    p.startScreenY = c.y;

    // 스크롤 좌표계에서의 핀치 중심 위치
    const el = containerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      p.localX = c.x - r.left + el.scrollLeft;
      p.localY = c.y - r.top + el.scrollTop;
    }

    setIsPinching(true);
  }, [containerRef]);

  // ---- 핀치 이동 ----
  const onMove = useCallback((e: TouchEvent) => {
    const p = ps.current;
    if (!p.active || e.touches.length !== 2) return;
    if (e.cancelable) e.preventDefault();

    const dist = getTouchDistanceNative(e.touches);
    const ratio = dist / p.startDist;
    const raw = p.startScale * ratio;
    const elastic = rubber(raw);
    p.totalScale = elastic;

    // 팬: 핀치 중심 화면 이동량
    const c = center(e.touches);
    const panX = c.x - p.startScreenX;
    const panY = c.y - p.startScreenY;

    // 핵심 공식: 핀치 중심이 손가락 아래에 고정되도록 translate 계산
    // tx = localX * (1 - S1/S0) + panX
    p.tx = p.localX * (1 - elastic / p.startScale) + panX;
    p.ty = p.localY * (1 - elastic / p.startScale) + panY;

    // GPU 가속 transform 직접 조작 (origin 항상 0,0)
    const el = contentRef.current;
    if (el) {
      el.style.transform = `translate(${p.tx}px, ${p.ty}px) scale(${elastic})`;
      el.style.transformOrigin = '0 0';
      el.style.transition = 'none';
      el.style.willChange = 'transform';
    }
  }, [contentRef]);

  // ---- 핀치 끝 ----
  const onEnd = useCallback(() => {
    const p = ps.current;
    if (!p.active) return;
    p.active = false;

    const clamped = clamp(p.totalScale);
    const needsBounce = p.totalScale !== clamped;

    if (needsBounce) {
      // 러버밴드에서 경계로 스프링 바운스
      const content = contentRef.current;
      if (!content) { finalize(p.totalScale, p.tx, p.ty); return; }

      ps.current.settling = true;
      const bounceTx = p.localX * (1 - clamped / p.startScale) + (p.tx - p.localX * (1 - p.totalScale / p.startScale));
      const bounceTy = p.localY * (1 - clamped / p.startScale) + (p.ty - p.localY * (1 - p.totalScale / p.startScale));

      content.style.transition = SPRING;
      content.style.transform = `translate(${bounceTx}px, ${bounceTy}px) scale(${clamped})`;

      const done = () => {
        content.removeEventListener('transitionend', done);
        clearTimeout(fb);
        // 바운스 완료 후 최종 translate를 사용하여 finalize
        p.totalScale = clamped;
        p.tx = bounceTx;
        p.ty = bounceTy;
        finalize(clamped, bounceTx, bounceTy);
      };
      content.addEventListener('transitionend', done, { once: true });
      const fb = setTimeout(done, 380);
    } else {
      finalize(p.totalScale, p.tx, p.ty);
    }
  }, [contentRef, finalize]);

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
    if (dt > DBL_TAP_MS || dd > DBL_TAP_PX) return;

    // 더블탭 감지!
    if (e.cancelable) e.preventDefault();
    lastTap.current = { t: 0, x: 0, y: 0 };

    const content = contentRef.current;
    const scroll = containerRef.current;
    if (!content || !scroll) return;

    const cur = scaleRef.current;
    const target = cur > 1.05 ? 1 : DBL_TAP_SCALE;
    const rect = scroll.getBoundingClientRect();

    // 탭 위치의 스크롤 좌표계 위치
    const lx = t.clientX - rect.left + scroll.scrollLeft;
    const ly = t.clientY - rect.top + scroll.scrollTop;

    // 같은 수학: 탭 포인트가 화면 고정되도록 translate 계산
    const tx = lx * (1 - target / cur);
    const ty = ly * (1 - target / cur);

    ps.current.startScale = cur;
    ps.current.settling = true;

    content.style.transformOrigin = '0 0';
    content.style.transition = SPRING;
    content.style.transform = `translate(${tx}px, ${ty}px) scale(${target})`;
    setIsPinching(true);

    const done = () => {
      content.removeEventListener('transitionend', done);
      clearTimeout(fb);

      content.style.transition = 'none';
      content.style.transform = `scale(${target})`;
      content.style.willChange = '';

      // 탭 위치가 같은 화면 좌표에 유지되도록 스크롤 조정
      scroll.scrollLeft = Math.max(0, scroll.scrollLeft - tx);
      scroll.scrollTop = Math.max(0, scroll.scrollTop - ty);

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
      if (e.touches.length === 2) onStart(e);
      else if (e.touches.length === 1) onDoubleTap(e);
    };
    const move = (e: TouchEvent) => { if (ps.current.active) onMove(e); };
    const end = () => { if (ps.current.active) onEnd(); };

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
  }, [containerRef, onStart, onMove, onEnd, onDoubleTap]);

  return { isPinching };
}
