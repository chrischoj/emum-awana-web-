import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import type { PdfViewerProps, PdfViewerHandle } from './types';
import { usePdfDocument, useZoom, useFullscreen, useTextSearch } from './hooks';
import { CanvasViewer, type CanvasViewerHandle } from './CanvasViewer';
import { ReflowViewer, type ReflowViewerHandle } from './ReflowViewer';
import { ControlBar } from './ControlBar';
import { Minimize2 } from 'lucide-react';
import { REFLOW_MAX_SCALE, MAX_SCALE, ZOOM_LEVELS } from './constants';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(
  function PdfViewer({ fileUrl, height = '100%', onFullscreenChange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const canvasViewerRef = useRef<CanvasViewerHandle>(null);
  const reflowViewerRef = useRef<ReflowViewerHandle>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [isReflowMode, setIsReflowMode] = useState(true);
  const [baseWidth, setBaseWidth] = useState(0);
  const [isCanvasAnimating, setIsCanvasAnimating] = useState(false);
  const [reflowPageInfo, setReflowPageInfo] = useState({ current: 1, total: 1, pdfPage: 1 });

  const {
    pdfDoc, numPages, pdfError,
    handleDocumentLoadSuccess, handleDocumentLoadError,
    resetDocument,
  } = usePdfDocument();
  const { scale, setScale, isZoomed, zoomIn, zoomOut, resetZoom } = useZoom();
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);
  const search = useTextSearch(pdfDoc, numPages);

  // 전체화면 상태를 외부로 전달
  useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  // ref로 toggleFullscreen 노출
  useImperativeHandle(ref, () => ({
    toggleFullscreen,
  }));

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
    setCurrentPage(1);
    setScale(1);
    resetDocument();
  }, [fileUrl, setScale, resetDocument]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // 리플로우 모드에서는 줌 상한 제한
  const effectiveMaxScale = isReflowMode ? REFLOW_MAX_SCALE : MAX_SCALE;

  const handleZoomIn = useCallback(() => {
    setScale((prev) => {
      const next = ZOOM_LEVELS.find((z) => z > prev);
      if (!next || next > effectiveMaxScale) return prev;
      return next;
    });
  }, [effectiveMaxScale, setScale]);

  const handleZoomOut = useCallback(() => {
    zoomOut();
  }, [zoomOut]);

  const handlePageJump = useCallback((page: number) => {
    if (isReflowMode) {
      reflowViewerRef.current?.scrollToPage(page);
    } else {
      setCurrentPage(page);
    }
  }, [isReflowMode]);

  // 검색 결과 이동: 캔버스→페이지 이동, 리플로우→해당 PDF 페이지로 스크롤
  const navigateToMatch = useCallback((match: { pageNum: number } | null) => {
    if (!match) return;
    if (isReflowMode) {
      reflowViewerRef.current?.scrollToPdfPage(match.pageNum);
    } else {
      setCurrentPage(match.pageNum);
    }
  }, [isReflowMode]);

  const handleSearchNext = useCallback(() => {
    search.nextMatch();
    if (search.matches.length === 0) return;
    const nextIdx = (search.currentIndex + 1) % search.matches.length;
    navigateToMatch(search.matches[nextIdx]);
  }, [search, navigateToMatch]);

  const handleSearchPrev = useCallback(() => {
    search.prevMatch();
    if (search.matches.length === 0) return;
    const prevIdx = (search.currentIndex - 1 + search.matches.length) % search.matches.length;
    navigateToMatch(search.matches[prevIdx]);
  }, [search, navigateToMatch]);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col ${isFullscreen ? 'bg-gray-900' : ''}`}
      style={isFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999, height: '100dvh' } : { height }}
    >
      {/* PDF 뷰어 영역 */}
      <div ref={measureRef} className="flex-1 min-h-0 relative overflow-hidden bg-gray-100">
        {/* 전체화면 해제 버튼 (전체화면일 때만) */}
        {isFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-2 right-2 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-black/15 text-gray-400 active:bg-black/30 active:text-gray-600 transition-colors"
            title="전체화면 해제"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        )}
        {isReflowMode ? (
          <ReflowViewer
            ref={reflowViewerRef}
            fileUrl={fileUrl}
            pdfDoc={pdfDoc}
            numPages={numPages}
            scale={scale}
            setScale={setScale}
            initialPdfPage={currentPage}
            onDocumentLoadSuccess={handleDocumentLoadSuccess}
            onDocumentLoadError={handleDocumentLoadError}
            onReflowPageInfo={setReflowPageInfo}
            searchQuery={search.isSearchOpen ? search.query : undefined}
          />
        ) : (
          <CanvasViewer
            ref={canvasViewerRef}
            fileUrl={fileUrl}
            currentPage={currentPage}
            numPages={numPages}
            scale={scale}
            setScale={setScale}
            isZoomed={isZoomed}
            baseWidth={baseWidth}
            onPageChange={handlePageChange}
            onDocumentLoadSuccess={handleDocumentLoadSuccess}
            onDocumentLoadError={handleDocumentLoadError}
            pdfError={pdfError}
            onAnimatingChange={setIsCanvasAnimating}
          />
        )}
      </div>

      {/* 컨트롤 바 */}
      <ControlBar
        isReflowMode={isReflowMode}
        onToggleReflow={() => {
          setIsReflowMode((prev) => {
            if (prev) {
              setCurrentPage(reflowPageInfo.pdfPage);
            }
            return !prev;
          });
        }}
        currentPage={currentPage}
        numPages={numPages}
        isAnimating={isCanvasAnimating}
        onPrev={() => {
          if (isReflowMode) {
            reflowViewerRef.current?.scrollByPage(-1);
          } else {
            canvasViewerRef.current?.changePage('prev');
          }
        }}
        onNext={() => {
          if (isReflowMode) {
            reflowViewerRef.current?.scrollByPage(1);
          } else {
            canvasViewerRef.current?.changePage('next');
          }
        }}
        onPageJump={handlePageJump}
        scale={scale}
        isZoomed={isZoomed}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        maxScale={effectiveMaxScale}
        onResetZoom={resetZoom}
        reflowCurrentPage={reflowPageInfo.current}
        reflowTotalPages={reflowPageInfo.total}
        reflowPdfPage={reflowPageInfo.pdfPage}
        isSearchOpen={search.isSearchOpen}
        onToggleSearch={search.toggleSearch}
        searchQuery={search.query}
        onSearchQueryChange={search.setQuery}
        searchTotalCount={search.totalCount}
        searchCurrentIndex={search.currentIndex}
        onSearchPrev={handleSearchPrev}
        onSearchNext={handleSearchNext}
      />
    </div>
  );
});
