import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { BookOpen, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface ClubHandbook {
  id: string;
  club_id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

function getTouchDistance(touches: React.TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function HandbookPage() {
  const { teacher } = useAuth();
  const [handbooks, setHandbooks] = useState<ClubHandbook[]>([]);
  const [selectedHandbookId, setSelectedHandbookId] = useState<string | null>(null);
  const [loadingHandbooks, setLoadingHandbooks] = useState(true);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [pdfError, setPdfError] = useState(false);

  // 페이지 전환 애니메이션
  const [animating, setAnimating] = useState(false);
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null);

  // 스와이프 상태
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // 핀치 줌 상태
  const [isPinching, setIsPinching] = useState(false);
  const pinchRef = useRef({ startDist: 0, startScale: 1 });

  const touchRef = useRef({ startX: 0, startY: 0, startTime: 0, isHorizontal: null as boolean | null });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [baseWidth, setBaseWidth] = useState(0);

  // 컨테이너 기본 너비 측정
  useEffect(() => {
    const measure = () => {
      if (measureRef.current) {
        setBaseWidth(measureRef.current.clientWidth);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (measureRef.current) observer.observe(measureRef.current);
    return () => observer.disconnect();
  }, []);

  // 핸드북 목록 불러오기
  useEffect(() => {
    const fetchHandbooks = async () => {
      if (!teacher?.club_id) {
        setLoadingHandbooks(false);
        return;
      }
      setLoadingHandbooks(true);
      try {
        const { data, error } = await supabase
          .from('club_handbooks')
          .select('*')
          .eq('club_id', teacher.club_id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setHandbooks(data ?? []);
        if (data && data.length > 0) setSelectedHandbookId(data[0].id);
      } catch (err) {
        console.error(err);
        toast.error('핸드북을 불러오지 못했습니다.');
      } finally {
        setLoadingHandbooks(false);
      }
    };
    fetchHandbooks();
  }, [teacher?.club_id]);

  const selectedHandbook = handbooks.find((h) => h.id === selectedHandbookId) ?? null;

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

  // ---- 페이지 전환 ----
  const changePage = useCallback((direction: 'prev' | 'next') => {
    if (animating) return;
    const nextPage = direction === 'prev'
      ? Math.max(1, currentPage - 1)
      : Math.min(numPages, currentPage + 1);
    if (nextPage === currentPage) return;

    setAnimating(true);
    setExitDirection(direction === 'next' ? 'left' : 'right');

    setTimeout(() => {
      setCurrentPage(nextPage);
      setExitDirection(null);
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
      setTimeout(() => setAnimating(false), 300);
    }, 250);
  }, [currentPage, numPages, animating]);

  // ---- 터치 핸들러 (스와이프 + 핀치) ----
  const isZoomed = scale > 1;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (animating) return;

    // 핀치 줌 시작 (2손가락)
    if (e.touches.length === 2) {
      e.preventDefault();
      setIsPinching(true);
      setIsDragging(false);
      setDragX(0);
      pinchRef.current = {
        startDist: getTouchDistance(e.touches),
        startScale: scale,
      };
      return;
    }

    // 스와이프 (1손가락, 줌 안 된 상태만)
    if (e.touches.length === 1 && !isZoomed) {
      const touch = e.touches[0];
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        isHorizontal: null,
      };
      setIsDragging(true);
      setDragX(0);
    }
  }, [isZoomed, animating, scale]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // 핀치 줌 진행
    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      const currentDist = getTouchDistance(e.touches);
      const ratio = currentDist / pinchRef.current.startDist;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchRef.current.startScale * ratio));
      setScale(parseFloat(newScale.toFixed(2)));
      return;
    }

    // 스와이프 진행
    if (!isDragging || isZoomed || animating || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchRef.current.startX;
    const dy = touch.clientY - touchRef.current.startY;

    if (touchRef.current.isHorizontal === null) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        touchRef.current.isHorizontal = Math.abs(dx) > Math.abs(dy);
      }
      return;
    }
    if (!touchRef.current.isHorizontal) return;

    e.preventDefault();
    const atStart = currentPage <= 1 && dx > 0;
    const atEnd = currentPage >= numPages && dx < 0;
    setDragX((atStart || atEnd) ? dx * 0.3 : dx);
  }, [isDragging, isPinching, isZoomed, animating, currentPage, numPages]);

  const handleTouchEnd = useCallback(() => {
    // 핀치 종료
    if (isPinching) {
      setIsPinching(false);
      return;
    }

    // 스와이프 종료
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

  const handleHandbookChange = (id: string) => {
    setSelectedHandbookId(id);
    setCurrentPage(1);
    setNumPages(0);
    setPdfError(false);
  };

  // ---- 빈 상태들 ----
  if (!teacher?.club_id) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <BookOpen className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500 text-base">배정된 클럽이 없습니다</p>
      </div>
    );
  }

  if (loadingHandbooks) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (handbooks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <BookOpen className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500 text-base">등록된 핸드북이 없습니다</p>
      </div>
    );
  }

  const pageWidth = baseWidth > 0 ? baseWidth * scale : undefined;

  // 페이지 전환 스타일
  const getPageStyle = (): React.CSSProperties => {
    if (isDragging && dragX !== 0) {
      const rotate = dragX * 0.02;
      const opacity = 1 - Math.abs(dragX) / (baseWidth * 0.8);
      return {
        transform: `translateX(${dragX}px) rotate(${rotate}deg)`,
        opacity: Math.max(0.4, opacity),
        transition: 'none',
      };
    }
    if (exitDirection) {
      const x = exitDirection === 'left' ? -baseWidth * 0.4 : baseWidth * 0.4;
      const rotate = exitDirection === 'left' ? -3 : 3;
      return {
        transform: `translateX(${x}px) rotate(${rotate}deg)`,
        opacity: 0,
        transition: 'transform 250ms ease-in, opacity 250ms ease-in',
      };
    }
    return {
      transform: 'translateX(0) rotate(0deg)',
      opacity: 1,
      transition: animating ? 'transform 300ms ease-out, opacity 300ms ease-out' : 'none',
    };
  };

  return (
    <div className="flex flex-col -mx-4 -mt-4" style={{ height: 'calc(100dvh - 56px - 64px)' }}>
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 shrink-0">
        {handbooks.length > 1 ? (
          <select
            value={selectedHandbookId ?? ''}
            onChange={(e) => handleHandbookChange(e.target.value)}
            className="w-full text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {handbooks.map((h) => (
              <option key={h.id} value={h.id}>{h.title}</option>
            ))}
          </select>
        ) : (
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-500 shrink-0" />
            <h1 className="text-sm font-semibold text-gray-800 truncate">
              {selectedHandbook?.title}
            </h1>
          </div>
        )}
      </header>

      {/* PDF 뷰어 영역 */}
      <div ref={measureRef} className="flex-1 min-h-0 relative overflow-hidden bg-gray-100">
        <div
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: isPinching ? 'none' : isZoomed ? 'pan-x pan-y' : 'pan-y' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {selectedHandbook && (
            <>
              {pdfError ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <BookOpen className="w-10 h-10 text-gray-300 mb-2" />
                  <p className="text-sm">PDF를 불러오지 못했습니다.</p>
                </div>
              ) : (
                <div
                  style={{
                    ...getPageStyle(),
                    minWidth: isZoomed ? `${pageWidth}px` : undefined,
                    transformOrigin: 'center top',
                    willChange: isDragging || animating || isPinching ? 'transform, opacity' : 'auto',
                  }}
                >
                  <Document
                    file={selectedHandbook.file_url}
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
                        <div className="flex items-center justify-center py-8" style={{ width: pageWidth }}>
                          <div className="w-6 h-6 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                      }
                      className="shadow-lg"
                    />
                  </Document>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 푸터 */}
      <footer className="bg-white border-t border-gray-200 px-3 py-2 shrink-0">
        <div className="flex items-center justify-between">
          {/* 페이지 이동 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => changePage('prev')}
              disabled={currentPage <= 1 || animating}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
              aria-label="이전 페이지"
            >
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            <span className="text-xs font-medium text-gray-600 min-w-[52px] text-center">
              {numPages > 0 ? `${currentPage} / ${numPages}` : '-'}
            </span>
            <button
              onClick={() => changePage('next')}
              disabled={currentPage >= numPages || numPages === 0 || animating}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
              aria-label="다음 페이지"
            >
              <ChevronRight className="w-5 h-5 text-gray-700" />
            </button>
          </div>

          {/* 줌 컨트롤 */}
          <div className="flex items-center gap-1">
            <button
              onClick={zoomOut}
              disabled={scale <= MIN_SCALE}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
              aria-label="축소"
            >
              <ZoomOut className="w-4 h-4 text-gray-700" />
            </button>
            <button
              onClick={resetZoom}
              className={`text-xs font-medium min-w-[42px] text-center px-1 py-1 rounded transition-colors ${
                isZoomed ? 'text-indigo-600 bg-indigo-50 active:bg-indigo-100' : 'text-gray-500'
              }`}
              title="원래 크기로"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={zoomIn}
              disabled={scale >= MAX_SCALE}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
              aria-label="확대"
            >
              <ZoomIn className="w-4 h-4 text-gray-700" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
