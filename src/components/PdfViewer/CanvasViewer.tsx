import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Document, Page } from 'react-pdf';
import { BookOpen } from 'lucide-react';
import { usePinchZoom, useCurlEffect } from './hooks';
import type { CurlDirection } from './types';

export interface CanvasViewerHandle {
  changePage: (direction: CurlDirection) => void;
}

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

export const CanvasViewer = forwardRef<CanvasViewerHandle, CanvasViewerProps>(
  function CanvasViewer(props, ref) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [naturalHeight, setNaturalHeight] = useState(0);

    // PDF 렌더 너비: 항상 baseWidth (줌과 무관하게 고정 → 캔버스 재렌더 없음)
    const renderWidth = props.baseWidth > 0 ? props.baseWidth : undefined;

    // 콘텐츠 자연 높이 측정 (스크롤 영역 계산용)
    useEffect(() => {
      const el = contentRef.current;
      if (!el) return;
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setNaturalHeight(entry.contentRect.height);
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    // ---- 핀치 줌 (transform 기반, 리렌더 제로) ----
    const { isPinching } = usePinchZoom({
      containerRef: scrollContainerRef,
      contentRef,
      scale: props.scale,
      setScale: props.setScale,
      enabled: true,
    });

    // ---- 컬 효과 + 페이지 넘기기 ----
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

    useImperativeHandle(ref, () => ({
      changePage: curl.changePage,
    }), [curl.changePage]);

    useEffect(() => {
      props.onAnimatingChange?.(curl.isAnimating);
    }, [curl.isAnimating, props.onAnimatingChange]);

    // ---- 영구 CSS transform 관리 ----
    // 핀치 중이 아닐 때만 React에서 transform 설정 (핀치 중에는 DOM 직접 조작이 우선)
    useEffect(() => {
      const el = contentRef.current;
      if (!el || isPinching) return;
      el.style.transform = `scale(${props.scale})`;
      el.style.transformOrigin = '0 0';
    }, [props.scale, isPinching]);

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
          /* Sizer: 줌 스케일에 맞는 스크롤 영역 제공 */
          <div
            style={{
              width: renderWidth ? `${renderWidth * props.scale}px` : undefined,
              height: naturalHeight > 0 && props.scale > 1
                ? `${naturalHeight * props.scale}px`
                : undefined,
              position: 'relative',
              minHeight: '100%',
            }}
          >
            {/* Content: CSS transform으로 시각적 줌 (PDF 캔버스는 항상 baseWidth) */}
            <div
              ref={contentRef}
              className="relative"
              style={{
                width: renderWidth ? `${renderWidth}px` : undefined,
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
              {/* ===== Layer 1: 대상 페이지 (컬 아래에 보이는 페이지) ===== */}
              {isCurling && destinationPage && (
                <div className="absolute inset-0" style={{ zIndex: 1 }}>
                  <Document file={props.fileUrl} loading={<></>}>
                    <Page
                      pageNumber={destinationPage}
                      width={renderWidth}
                      loading={
                        <div className="flex items-center justify-center py-8" style={{ width: renderWidth }}>
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
                    width={renderWidth}
                    loading={
                      <div className="flex items-center justify-center py-8" style={{ width: renderWidth }}>
                        <div className="w-6 h-6 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    }
                    className="shadow-xl"
                  />
                </Document>
              </div>

              {/* ===== Layer 3: 컬 뒷면 ===== */}
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
                  <div
                    className="absolute inset-0"
                    style={{
                      background: curlDirection === 'next'
                        ? 'repeating-linear-gradient(to right, transparent, transparent 3px, rgba(0,0,0,0.02) 3px, rgba(0,0,0,0.02) 4px)'
                        : 'repeating-linear-gradient(to left, transparent, transparent 3px, rgba(0,0,0,0.02) 3px, rgba(0,0,0,0.02) 4px)',
                    }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background: curlDirection === 'next'
                        ? 'linear-gradient(to right, rgba(0,0,0,0.12) 0%, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.15) 50%, rgba(0,0,0,0.05) 80%, rgba(0,0,0,0.1) 100%)'
                        : 'linear-gradient(to left, rgba(0,0,0,0.12) 0%, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.15) 50%, rgba(0,0,0,0.05) 80%, rgba(0,0,0,0.1) 100%)',
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
          </div>
        )}
      </div>
    );
  },
);
