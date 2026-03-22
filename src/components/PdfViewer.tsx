import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { BookOpen, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import toast from 'react-hot-toast';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ---- 상수 ----
const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

function getTouchDistance(touches: React.TouchList): number {
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

// ---- CSS 3D 페이지 플립 keyframes ----
const FLIP_STYLES = `
@keyframes flipToLeft {
  0% { transform: perspective(1500px) rotateY(0deg); }
  100% { transform: perspective(1500px) rotateY(-180deg); }
}
@keyframes flipToRight {
  0% { transform: perspective(1500px) rotateY(0deg); }
  100% { transform: perspective(1500px) rotateY(180deg); }
}
@keyframes fadeInFromRight {
  0% { opacity: 0; transform: perspective(1500px) rotateY(30deg); }
  100% { opacity: 1; transform: perspective(1500px) rotateY(0deg); }
}
@keyframes fadeInFromLeft {
  0% { opacity: 0; transform: perspective(1500px) rotateY(-30deg); }
  100% { opacity: 1; transform: perspective(1500px) rotateY(0deg); }
}
`;

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

  // 3D 플립
  const [flipping, setFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev' | null>(null);
  const [flipPhase, setFlipPhase] = useState<'exit' | 'enter' | null>(null);
  const [displayPage, setDisplayPage] = useState(1);

  // 스와이프
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // 핀치
  const [isPinching, setIsPinching] = useState(false);
  const pinchRef = useRef({ startDist: 0, startScale: 1 });
  const touchRef = useRef({ startX: 0, startY: 0, startTime: 0, isHorizontal: null as boolean | null });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [baseWidth, setBaseWidth] = useState(0);

  // 스타일시트 주입 (한 번만)
  useEffect(() => {
    const id = 'pdf-viewer-flip-styles';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = FLIP_STYLES;
      document.head.appendChild(style);
    }
  }, []);

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
    setDisplayPage(1);
    setScale(1);
    setPdfError(false);
    setFlipping(false);
    setFlipPhase(null);
    setFlipDirection(null);
  }, [fileUrl]);

  const handleDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
    setDisplayPage(1);
    setPdfError(false);
  }, []);

  const handleDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    setPdfError(true);
    toast.error('PDF를 불러오지 못했습니다.');
  }, []);

  // ---- 3D 페이지 전환 ----
  const changePage = useCallback((direction: 'next' | 'prev') => {
    if (flipping) return;
    const nextPage = direction === 'prev'
      ? Math.max(1, currentPage - 1)
      : Math.min(numPages, currentPage + 1);
    if (nextPage === currentPage) return;

    playPageTurnSound();
    setFlipping(true);
    setFlipDirection(direction);
    setFlipPhase('exit');

    setTimeout(() => {
      setCurrentPage(nextPage);
      setDisplayPage(nextPage);
      setFlipPhase('enter');
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;

      setTimeout(() => {
        setFlipping(false);
        setFlipDirection(null);
        setFlipPhase(null);
      }, 350);
    }, 350);
  }, [currentPage, numPages, flipping]);

  // ---- 터치 핸들러 ----
  const isZoomed = scale > 1;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (flipping) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      setIsPinching(true);
      setIsDragging(false);
      setDragX(0);
      pinchRef.current = { startDist: getTouchDistance(e.touches), startScale: scale };
      return;
    }
    if (e.touches.length === 1 && !isZoomed) {
      const touch = e.touches[0];
      touchRef.current = { startX: touch.clientX, startY: touch.clientY, startTime: Date.now(), isHorizontal: null };
      setIsDragging(true);
      setDragX(0);
    }
  }, [isZoomed, flipping, scale]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      const currentDist = getTouchDistance(e.touches);
      const ratio = currentDist / pinchRef.current.startDist;
      setScale(parseFloat(Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchRef.current.startScale * ratio)).toFixed(2)));
      return;
    }
    if (!isDragging || isZoomed || flipping || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchRef.current.startX;
    const dy = touch.clientY - touchRef.current.startY;
    if (touchRef.current.isHorizontal === null) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) touchRef.current.isHorizontal = Math.abs(dx) > Math.abs(dy);
      return;
    }
    if (!touchRef.current.isHorizontal) return;
    e.preventDefault();
    const atStart = currentPage <= 1 && dx > 0;
    const atEnd = currentPage >= numPages && dx < 0;
    setDragX((atStart || atEnd) ? dx * 0.3 : dx);
  }, [isDragging, isPinching, isZoomed, flipping, currentPage, numPages]);

  const handleTouchEnd = useCallback(() => {
    if (isPinching) { setIsPinching(false); return; }
    if (!isDragging) return;
    const elapsed = Date.now() - touchRef.current.startTime;
    const velocity = Math.abs(dragX) / elapsed;
    const shouldChange = Math.abs(dragX) > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD;
    if (shouldChange && dragX !== 0) {
      const direction = dragX < 0 ? 'next' : 'prev';
      const canGo = direction === 'next' ? currentPage < numPages : currentPage > 1;
      if (canGo) changePage(direction);
    }
    setIsDragging(false);
    setDragX(0);
  }, [isDragging, isPinching, dragX, currentPage, numPages, changePage]);

  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, parseFloat((s + 0.25).toFixed(2))));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, parseFloat((s - 0.25).toFixed(2))));
  const resetZoom = () => setScale(1);

  const pageWidth = baseWidth > 0 ? baseWidth * scale : undefined;

  // 드래그 중 3D 기울기
  const getDragStyle = (): React.CSSProperties => {
    if (isDragging && dragX !== 0) {
      const maxRotate = 25;
      const rotateY = -(dragX / baseWidth) * maxRotate;
      const opacity = 1 - Math.abs(dragX) / (baseWidth * 0.8);
      return {
        transform: `perspective(1500px) rotateY(${rotateY}deg) translateX(${dragX * 0.3}px)`,
        opacity: Math.max(0.3, opacity),
        transition: 'none',
        transformOrigin: dragX < 0 ? 'left center' : 'right center',
      };
    }
    return {};
  };

  // 플립 애니메이션 스타일
  const getFlipStyle = (): React.CSSProperties => {
    if (flipPhase === 'exit') {
      const animName = flipDirection === 'next' ? 'flipToLeft' : 'flipToRight';
      return { animation: `${animName} 350ms ease-in forwards`, transformOrigin: flipDirection === 'next' ? 'left center' : 'right center' };
    }
    if (flipPhase === 'enter') {
      const animName = flipDirection === 'next' ? 'fadeInFromRight' : 'fadeInFromLeft';
      return { animation: `${animName} 350ms ease-out forwards`, transformOrigin: flipDirection === 'next' ? 'left center' : 'right center' };
    }
    if (!isDragging) {
      return { transform: 'perspective(1500px) rotateY(0deg)', opacity: 1, transition: 'transform 300ms ease-out, opacity 300ms ease-out' };
    }
    return {};
  };

  const combinedStyle: React.CSSProperties = {
    ...getFlipStyle(),
    ...getDragStyle(),
    minWidth: isZoomed ? `${pageWidth}px` : undefined,
    willChange: isDragging || flipping || isPinching ? 'transform, opacity' : 'auto',
    backfaceVisibility: 'hidden' as const,
  };

  return (
    <div className="flex flex-col" style={{ height }}>
      {/* PDF 뷰어 영역 */}
      <div ref={measureRef} className="flex-1 min-h-0 relative overflow-hidden bg-gray-100" style={{ perspective: '1500px' }}>
        <div
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: isPinching ? 'none' : isZoomed ? 'pan-x pan-y' : 'pan-y' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {pdfError ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <BookOpen className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-sm">PDF를 불러오지 못했습니다.</p>
            </div>
          ) : (
            <div style={combinedStyle}>
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
                  pageNumber={displayPage}
                  width={pageWidth}
                  loading={
                    <div className="flex items-center justify-center py-8" style={{ width: pageWidth }}>
                      <div className="w-6 h-6 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  }
                  className="shadow-xl"
                />
              </Document>
            </div>
          )}
        </div>

        {/* 넘김 중 그림자 */}
        {flipping && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: flipPhase === 'exit'
                ? `linear-gradient(${flipDirection === 'next' ? 'to left' : 'to right'}, transparent 30%, rgba(0,0,0,0.15) 100%)`
                : 'transparent',
              transition: 'background 350ms ease',
            }}
          />
        )}
      </div>

      {/* 컨트롤 바 */}
      <div className="bg-white border-t border-gray-200 px-3 py-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => changePage('prev')}
              disabled={currentPage <= 1 || flipping}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            <span className="text-xs font-medium text-gray-600 min-w-[52px] text-center">
              {numPages > 0 ? `${currentPage} / ${numPages}` : '-'}
            </span>
            <button
              onClick={() => changePage('next')}
              disabled={currentPage >= numPages || numPages === 0 || flipping}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-700" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={zoomOut} disabled={scale <= MIN_SCALE}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors">
              <ZoomOut className="w-4 h-4 text-gray-700" />
            </button>
            <button onClick={resetZoom}
              className={`text-xs font-medium min-w-[42px] text-center px-1 py-1 rounded transition-colors ${
                isZoomed ? 'text-indigo-600 bg-indigo-50 active:bg-indigo-100' : 'text-gray-500'
              }`}>
              {Math.round(scale * 100)}%
            </button>
            <button onClick={zoomIn} disabled={scale >= MAX_SCALE}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors">
              <ZoomIn className="w-4 h-4 text-gray-700" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
