import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { BookOpen, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Minimize2 } from 'lucide-react';
import toast from 'react-hot-toast';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ---- 상수 ----
const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
/** 드래그 진행률이 이 값을 넘으면 페이지 전환 완료 */
const CURL_COMPLETE_THRESHOLD = 0.3;
/** 자동 애니메이션 속도 (progress/ms) */
const CURL_ANIMATION_SPEED = 0.003;
/** 핀치 줌 스냅 레벨 */
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

function getTouchDistanceNative(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---- 페이지 넘기는 소리 (Web Audio API) ----
let audioCtxCache: AudioContext | null = null;
function playPageTurnSound() {
  try {
    if (!audioCtxCache) audioCtxCache = new AudioContext();
    const ctx = audioCtxCache;
    if (ctx.state === 'suspended') ctx.resume();

    const duration = 0.25;
    const sampleRate = ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      const envelope = t < 0.2 ? t / 0.2 : Math.exp(-(t - 0.2) * 6);
      const crackle = Math.random() > 0.97 ? (Math.random() - 0.5) * 3 : 0;
      data[i] = ((Math.random() * 2 - 1) + crackle) * envelope * 0.08;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 4000;
    bandpass.Q.value = 0.8;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 800;

    source.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(ctx.destination);
    source.start();
  } catch {
    // 오디오 에러 무시
  }
}

// ---- 컬 효과 기하학 계산 ----

/**
 * curlProgress: 0 = 페이지 완전히 펼쳐짐, 1 = 완전히 넘어감
 * direction: 'next' = 오른쪽에서 왼쪽으로 컬, 'prev' = 왼쪽에서 오른쪽으로 컬
 *
 * 반환값:
 * - clipPath: 현재 페이지를 자를 clip-path polygon
 * - foldX: 접힘선의 X 위치 (0~100% 기준)
 * - curlBackClip: 컬 뒷면의 clip-path
 * - curlBackTransform: 컬 뒷면의 transform
 * - shadowGradient: 접힘선 그림자 gradient
 */
function computeCurlGeometry(progress: number, direction: 'next' | 'prev') {
  // clamp
  const p = Math.max(0, Math.min(1, progress));

  if (direction === 'next') {
    // 오른쪽 가장자리에서 왼쪽으로 컬
    // foldX: 100% → 0% (progress 0→1)
    const foldX = 100 - p * 100;
    // 약간의 대각선 효과: 상단은 foldX, 하단은 foldX + skew
    const skew = Math.sin(p * Math.PI) * 8; // 최대 8% 대각선
    const topX = foldX;
    const botX = Math.min(100, foldX + skew);

    // 현재 페이지: 접힘선 왼쪽만 보임
    const clipPath = `polygon(0% 0%, ${topX}% 0%, ${botX}% 100%, 0% 100%)`;

    // 컬 뒷면: 접힘선에서 오른쪽으로 컬 너비만큼
    const curlWidth = Math.min(p * 100, 30); // 최대 30% 너비
    const curlRightTop = Math.min(100, topX + curlWidth);
    const curlRightBot = Math.min(100, botX + curlWidth);
    const curlBackClip = `polygon(${topX}% 0%, ${curlRightTop}% 0%, ${curlRightBot}% 100%, ${botX}% 100%)`;

    // 컬 뒷면의 scaleX(-1) 효과를 위한 transform-origin
    const curlBackTransform = `scaleX(-1)`;
    const curlBackOrigin = `${topX}% 50%`;

    // 그림자: 접힘선 위치에 세로 그라데이션
    const shadowGradient = `linear-gradient(to right,
      transparent ${Math.max(0, foldX - 3)}%,
      rgba(0,0,0,0.15) ${foldX}%,
      rgba(0,0,0,0.25) ${Math.min(100, foldX + 1)}%,
      rgba(0,0,0,0.1) ${Math.min(100, foldX + 4)}%,
      transparent ${Math.min(100, foldX + 8)}%)`;

    return { clipPath, foldX, curlBackClip, curlBackTransform, curlBackOrigin, shadowGradient, curlWidth };
  } else {
    // 왼쪽 가장자리에서 오른쪽으로 컬
    const foldX = p * 100;
    const skew = Math.sin(p * Math.PI) * 8;
    const topX = foldX;
    const botX = Math.max(0, foldX - skew);

    const clipPath = `polygon(${topX}% 0%, 100% 0%, 100% 100%, ${botX}% 100%)`;

    const curlWidth = Math.min(p * 100, 30);
    const curlLeftTop = Math.max(0, topX - curlWidth);
    const curlLeftBot = Math.max(0, botX - curlWidth);
    const curlBackClip = `polygon(${curlLeftTop}% 0%, ${topX}% 0%, ${botX}% 100%, ${curlLeftBot}% 100%)`;

    const curlBackTransform = `scaleX(-1)`;
    const curlBackOrigin = `${topX}% 50%`;

    const shadowGradient = `linear-gradient(to left,
      transparent ${Math.max(0, 100 - foldX - 3)}%,
      rgba(0,0,0,0.15) ${100 - foldX}%,
      rgba(0,0,0,0.25) ${Math.min(100, 100 - foldX + 1)}%,
      rgba(0,0,0,0.1) ${Math.min(100, 100 - foldX + 4)}%,
      transparent ${Math.min(100, 100 - foldX + 8)}%)`;

    return { clipPath, foldX, curlBackClip, curlBackTransform, curlBackOrigin, shadowGradient, curlWidth };
  }
}

// ---- Props ----
interface PdfViewerProps {
  fileUrl: string;
  /** 컨테이너 높이를 직접 지정 (기본: 100%) */
  height?: string;
}

export function PdfViewer({ fileUrl, height = '100%' }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [pdfError, setPdfError] = useState(false);

  // 컬 효과 상태
  const [curlProgress, setCurlProgress] = useState(0);
  const [curlDirection, setCurlDirection] = useState<'next' | 'prev' | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // 핀치
  const [isPinching, setIsPinching] = useState(false);
  const pinchRef = useRef({ startDist: 0, startScale: 1 });
  const touchRef = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    isHorizontal: null as boolean | null,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [baseWidth, setBaseWidth] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const animFrameRef = useRef<number>(0);
  const soundPlayedRef = useRef(false);

  // 컨테이너 너비 측정
  useEffect(() => {
    const measure = () => {
      if (measureRef.current) setBaseWidth(measureRef.current.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (measureRef.current) observer.observe(measureRef.current);
    return () => observer.disconnect();
  }, []);

  // fileUrl 변경 시 리셋
  useEffect(() => {
    setNumPages(0);
    setCurrentPage(1);
    setScale(1);
    setPdfError(false);
    setCurlProgress(0);
    setCurlDirection(null);
    setIsAnimating(false);
    setIsDragging(false);
  }, [fileUrl]);

  // 애니메이션 cleanup
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const handleDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
    setPdfError(false);
  }, []);

  const handleDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    setPdfError(true);
    toast.error('PDF를 불러오지 못했습니다.');
  }, []);

  // ---- 컬 애니메이션 (requestAnimationFrame) ----
  const animateCurl = useCallback((
    from: number,
    to: number,
    direction: 'next' | 'prev',
    onComplete: () => void,
  ) => {
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
  }, []);

  // ---- 페이지 전환 ----
  const changePage = useCallback((direction: 'next' | 'prev') => {
    if (isAnimating || isDragging) return;
    const nextPage = direction === 'next'
      ? Math.min(numPages, currentPage + 1)
      : Math.max(1, currentPage - 1);
    if (nextPage === currentPage) return;

    animateCurl(0, 1, direction, () => {
      setCurrentPage(nextPage);
      setCurlProgress(0);
      setCurlDirection(null);
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    });
  }, [currentPage, numPages, isAnimating, isDragging, animateCurl]);

  // ---- 터치 핸들러 ----
  const isZoomed = scale > 1;

  // Native 터치 핸들러 (passive: false로 등록해야 preventDefault 가능)
  const stateRef = useRef({
    isPinching: false,
    isDragging: false,
    isZoomed: false,
    isAnimating: false,
    scale: 1,
    currentPage: 1,
    numPages: 0,
    baseWidth: 0,
    curlProgress: 0,
    curlDirection: null as 'next' | 'prev' | null,
  });

  // stateRef 동기화
  useEffect(() => {
    stateRef.current = {
      isPinching, isDragging, isZoomed, isAnimating,
      scale, currentPage, numPages, baseWidth,
      curlProgress, curlDirection,
    };
  });

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (stateRef.current.isAnimating) return;
    if (e.touches.length === 2) {
      if (e.cancelable) e.preventDefault();
      setIsPinching(true);
      setIsDragging(false);
      setCurlProgress(0);
      setCurlDirection(null);
      pinchRef.current = { startDist: getTouchDistanceNative(e.touches), startScale: stateRef.current.scale };
      return;
    }
    if (e.touches.length === 1 && !stateRef.current.isZoomed) {
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
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const s = stateRef.current;
    if (s.isPinching && e.touches.length === 2) {
      if (e.cancelable) e.preventDefault();
      const currentDist = getTouchDistanceNative(e.touches);
      const ratio = currentDist / pinchRef.current.startDist;
      setScale(parseFloat(Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchRef.current.startScale * ratio)).toFixed(2)));
      return;
    }
    if (!s.isDragging || s.isZoomed || s.isAnimating || e.touches.length !== 1) return;

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
    const dir: 'next' | 'prev' = dx < 0 ? 'next' : 'prev';
    const atBoundary = (dir === 'prev' && s.currentPage <= 1) || (dir === 'next' && s.currentPage >= s.numPages);

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
    if (s.isPinching) {
      // 핀치 끝 → 가장 가까운 스냅 레벨로 이동
      setIsPinching(false);
      const nearest = ZOOM_LEVELS.reduce((prev, curr) =>
        Math.abs(curr - s.scale) < Math.abs(prev - s.scale) ? curr : prev
      );
      setScale(nearest);
      return;
    }
    if (!s.isDragging) return;

    const elapsed = Date.now() - touchRef.current.startTime;
    const dx = s.curlDirection === 'next' ? -s.curlProgress * s.baseWidth : s.curlProgress * s.baseWidth;
    const velocity = Math.abs(dx) / elapsed;
    const shouldComplete = s.curlProgress > CURL_COMPLETE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD;

    setIsDragging(false);

    if (shouldComplete && s.curlDirection) {
      const canGo = s.curlDirection === 'next' ? s.currentPage < s.numPages : s.currentPage > 1;
      if (canGo) {
        const dir = s.curlDirection;
        const cp = s.currentPage;
        animateCurl(s.curlProgress, 1, dir, () => {
          const nextPage = dir === 'next' ? cp + 1 : cp - 1;
          setCurrentPage(nextPage);
          setCurlProgress(0);
          setCurlDirection(null);
          if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
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
  }, [animateCurl]);

  // ---- 네이티브 터치 이벤트 등록 (passive: false) ----
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: false });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // ---- 전체화면 (네이티브 API + CSS 폴백) ----
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
      } catch { /* fallthrough to CSS */ }
      setIsFullscreen(false);
    } else {
      // 진입: 네이티브 시도 → 실패하면 CSS 폴백
      try {
        const rfs = el.requestFullscreen
          ?? (el as HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
        if (rfs) {
          await rfs.call(el);
          return; // fullscreenchange 이벤트가 상태 업데이트
        }
      } catch { /* fallthrough to CSS */ }
      // CSS 기반 전체화면 (iOS Safari 등)
      setIsFullscreen(true);
    }
  }, [isFullscreen]);

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

  // ---- 줌 (스냅 레벨) ----
  const zoomIn = () => {
    const next = ZOOM_LEVELS.find((z) => z > scale);
    setScale(next ?? MAX_SCALE);
  };
  const zoomOut = () => {
    const prev = [...ZOOM_LEVELS].reverse().find((z) => z < scale);
    setScale(prev ?? MIN_SCALE);
  };
  const resetZoom = () => setScale(1);

  const pageWidth = baseWidth > 0 ? baseWidth * scale : undefined;

  // ---- 컬 기하학 계산 (메모이즈) ----
  const curlGeometry = useMemo(() => {
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

  return (
    <div ref={containerRef} className={`flex flex-col ${isFullscreen ? 'bg-gray-900' : ''}`} style={isFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999, height: '100dvh' } : { height }}>
      {/* PDF 뷰어 영역 */}
      <div
        ref={measureRef}
        className="flex-1 min-h-0 relative overflow-hidden bg-gray-100"
      >
        <div
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-auto overscroll-contain"
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: isPinching ? 'none' : isZoomed ? 'pan-x pan-y' : 'pan-y',
          }}
        >
          {pdfError ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <BookOpen className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-sm">PDF를 불러오지 못했습니다.</p>
            </div>
          ) : (
            <div
              className="relative"
              style={{
                minWidth: isZoomed && pageWidth ? `${pageWidth}px` : undefined,
                transition: isPinching ? 'none' : 'min-width 0.3s ease-out',
              }}
            >
              {/* ===== Layer 1: 대상 페이지 (컬 아래에 보이는 페이지) ===== */}
              {isCurling && destinationPage && (
                <div
                  className="absolute inset-0"
                  style={{ zIndex: 1 }}
                >
                  <Document file={fileUrl} loading={<></>}>
                    <Page
                      pageNumber={destinationPage}
                      width={pageWidth}
                      loading={
                        <div
                          className="flex items-center justify-center py-8"
                          style={{ width: pageWidth }}
                        >
                          <div className="w-6 h-6 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                      }
                    />
                  </Document>
                </div>
              )}

              {/* ===== Layer 2: 현재 페이지 (컬 중에는 clip-path 적용) ===== */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 2,
                  clipPath: isCurling && curlGeometry ? curlGeometry.clipPath : undefined,
                  WebkitClipPath: isCurling && curlGeometry ? curlGeometry.clipPath : undefined,
                  transition: (!isDragging && !isAnimating) ? 'clip-path 0.3s ease-out' : 'none',
                  willChange: isCurling ? 'clip-path' : 'auto',
                }}
              >
                <Document
                  file={fileUrl}
                  onLoadSuccess={handleDocumentLoadSuccess}
                  onLoadError={handleDocumentLoadError}
                  loading={
                    <div className="flex items-center justify-center py-16">
                      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  }
                >
                  <Page
                    pageNumber={currentPage}
                    width={pageWidth}
                    loading={
                      <div
                        className="flex items-center justify-center py-8"
                        style={{ width: pageWidth }}
                      >
                        <div className="w-6 h-6 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    }
                    className="shadow-xl"
                  />
                </Document>
              </div>

              {/* ===== Layer 3: 컬 뒷면 (접힌 페이지의 뒷면) ===== */}
              {isCurling && curlGeometry && curlGeometry.curlWidth > 0 && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    zIndex: 3,
                    clipPath: curlGeometry.curlBackClip,
                    WebkitClipPath: curlGeometry.curlBackClip,
                    background: `linear-gradient(${
                      curlDirection === 'next' ? 'to right' : 'to left'
                    }, rgba(240,238,235,0.95), rgba(220,218,215,0.9))`,
                    willChange: 'clip-path',
                  }}
                >
                  {/* 컬 뒷면 질감: 약간의 세로줄 패턴 */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: curlDirection === 'next'
                        ? `repeating-linear-gradient(to right, transparent, transparent 3px, rgba(0,0,0,0.02) 3px, rgba(0,0,0,0.02) 4px)`
                        : `repeating-linear-gradient(to left, transparent, transparent 3px, rgba(0,0,0,0.02) 3px, rgba(0,0,0,0.02) 4px)`,
                    }}
                  />
                  {/* 원통형 컬 하이라이트/그림자 */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: curlDirection === 'next'
                        ? `linear-gradient(to right, rgba(0,0,0,0.12) 0%, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.15) 50%, rgba(0,0,0,0.05) 80%, rgba(0,0,0,0.1) 100%)`
                        : `linear-gradient(to left, rgba(0,0,0,0.12) 0%, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.15) 50%, rgba(0,0,0,0.05) 80%, rgba(0,0,0,0.1) 100%)`,
                    }}
                  />
                </div>
              )}

              {/* ===== Layer 4: 접힘선 그림자 ===== */}
              {isCurling && curlGeometry && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    zIndex: 4,
                    background: curlGeometry.shadowGradient,
                    willChange: 'background',
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* 컨트롤 바 */}
      <div className="bg-white border-t border-gray-200 px-3 py-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => changePage('prev')}
              disabled={currentPage <= 1 || isAnimating}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            <span className="text-xs font-medium text-gray-600 min-w-[52px] text-center">
              {numPages > 0 ? `${currentPage} / ${numPages}` : '-'}
            </span>
            <button
              onClick={() => changePage('next')}
              disabled={currentPage >= numPages || numPages === 0 || isAnimating}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-700" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={zoomOut}
              disabled={scale <= MIN_SCALE}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
            >
              <ZoomOut className="w-4 h-4 text-gray-700" />
            </button>
            <button
              onClick={resetZoom}
              className={`text-xs font-medium min-w-[42px] text-center px-1 py-1 rounded transition-colors ${
                isZoomed ? 'text-indigo-600 bg-indigo-50 active:bg-indigo-100' : 'text-gray-500'
              }`}
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={zoomIn}
              disabled={scale >= MAX_SCALE}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
            >
              <ZoomIn className="w-4 h-4 text-gray-700" />
            </button>
            <div className="w-px h-6 bg-gray-200 mx-0.5" />
            <button
              onClick={toggleFullscreen}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 active:bg-gray-200 transition-colors"
              title={isFullscreen ? '전체화면 해제' : '전체화면'}
            >
              {isFullscreen
                ? <Minimize2 className="w-4 h-4 text-gray-700" />
                : <Maximize2 className="w-4 h-4 text-gray-700" />
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
