import { useState, useEffect, useRef, useCallback } from 'react';
import { pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import type { PdfViewerProps } from './types';
import { usePdfDocument, useZoom, useFullscreen } from './hooks';
import { CanvasViewer, type CanvasViewerHandle } from './CanvasViewer';
import { ReflowViewer, type ReflowViewerHandle } from './ReflowViewer';
import { ControlBar } from './ControlBar';
import { REFLOW_MAX_SCALE, MAX_SCALE, ZOOM_LEVELS } from './constants';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PdfViewer({ fileUrl, height = '100%' }: PdfViewerProps) {
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

  return (
    <div
      ref={containerRef}
      className={`flex flex-col ${isFullscreen ? 'bg-gray-900' : ''}`}
      style={isFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999, height: '100dvh' } : { height }}
    >
      {/* PDF 뷰어 영역 */}
      <div ref={measureRef} className="flex-1 min-h-0 relative overflow-hidden bg-gray-100">
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
              // 리플로우 → 캔버스: 보고 있던 PDF 페이지로 이동
              setCurrentPage(reflowPageInfo.pdfPage);
            }
            return !prev;
          });
        }}
        currentPage={currentPage}
        numPages={numPages}
        isAnimating={isCanvasAnimating}
        onPrev={() => canvasViewerRef.current?.changePage('prev')}
        onNext={() => canvasViewerRef.current?.changePage('next')}
        onPageJump={handlePageJump}
        scale={scale}
        isZoomed={isZoomed}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        maxScale={effectiveMaxScale}
        onResetZoom={resetZoom}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        reflowCurrentPage={reflowPageInfo.current}
        reflowTotalPages={reflowPageInfo.total}
      />
    </div>
  );
}
