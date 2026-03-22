import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Document, Page } from 'react-pdf';
import { BookOpen } from 'lucide-react';
import { usePinchZoom, useCurlEffect } from './hooks';
import type { CurlDirection } from './types';

// ---------- Public handle (Facade에서 ref로 접근) ----------
export interface CanvasViewerHandle {
  changePage: (direction: CurlDirection) => void;
}

// ---------- Props ----------
interface CanvasViewerProps {
  fileUrl: string;
  currentPage: number;
  numPages: number;
  scale: number;
  setScale: (s: number) => void;
  isZoomed: boolean;
  baseWidth: number;
  onPageChange: (page: number) => void;
  onDocumentLoadSuccess: (pdf: any) => void;
  onDocumentLoadError: (error: Error) => void;
  pdfError: boolean;
  onAnimatingChange?: (animating: boolean) => void;
}

// ---------- Component ----------
export const CanvasViewer = forwardRef<CanvasViewerHandle, CanvasViewerProps>(
  function CanvasViewer(props, ref) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // ---- 핀치 줌 (transform 기반) ----
    const { isPinching } = usePinchZoom({
      containerRef: scrollContainerRef,
      contentRef,
      scale: props.scale,
      setScale: props.setScale,
      enabled: true,
    });

    // ---- 컬 효과 + 페이지 넘기기 터치 ----
    const curl = useCurlEffect({
      containerRef: scrollContainerRef,
      currentPage: props.currentPage,
      numPages: props.numPages,
      baseWidth: props.baseWidth,
      isZoomed: props.isZoomed,
      isPinching,
      onPageChange: (page) => {
        props.onPageChange(page);
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
      },
    });

    // ---- ref로 changePage 노출 ----
    useImperativeHandle(ref, () => ({
      changePage: curl.changePage,
    }), [curl.changePage]);

    // ---- isAnimating 변경 시 부모에 알림 ----
    useEffect(() => {
      props.onAnimatingChange?.(curl.isAnimating);
    }, [curl.isAnimating, props.onAnimatingChange]);

    const pageWidth = props.baseWidth > 0 ? props.baseWidth * props.scale : undefined;

    const {
      isCurling,
      curlGeometry,
      curlDirection,
      destinationPage,
      isDragging,
      isAnimating,
    } = curl;

    return (
      <div
        ref={scrollContainerRef}
        className="absolute inset-0 overflow-auto overscroll-contain"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: isPinching ? 'none' : props.isZoomed ? 'pan-x pan-y' : 'pan-y',
        }}
      >
        {props.pdfError ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <BookOpen className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm">PDF를 불러오지 못했습니다.</p>
          </div>
        ) : (
          <div
            ref={contentRef}
            className="relative"
            style={{
              minWidth: props.isZoomed && pageWidth ? `${pageWidth}px` : undefined,
              transition: isPinching ? 'none' : 'min-width 0.3s ease-out',
              // GPU 레이어 프로모션: 핀치 줌 시 합성(compositing) 레이어로 승격
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {/* ===== Layer 1: 대상 페이지 (컬 아래에 보이는 페이지) ===== */}
            {isCurling && destinationPage && (
              <div
                className="absolute inset-0"
                style={{ zIndex: 1 }}
              >
                <Document file={props.fileUrl} loading={<></>}>
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
                file={props.fileUrl}
                onLoadSuccess={props.onDocumentLoadSuccess}
                onLoadError={props.onDocumentLoadError}
                loading={
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                }
              >
                <Page
                  pageNumber={props.currentPage}
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
    );
  },
);
