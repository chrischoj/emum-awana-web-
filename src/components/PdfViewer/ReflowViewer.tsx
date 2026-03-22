import { useRef, useLayoutEffect, useEffect, useImperativeHandle, forwardRef, Fragment } from 'react';
import { Document } from 'react-pdf';
import { FileImage } from 'lucide-react';
import { useReflowExtractor } from './hooks';
import { useReflowPinchZoom } from './hooks/useReflowPinchZoom';

export interface ReflowViewerHandle {
  scrollToPage: (page: number) => void;
  scrollByPage: (delta: number) => void;
  scrollToPdfPage: (pageNum: number) => void;
}

interface ReflowViewerProps {
  fileUrl: string;
  pdfDoc: any;
  numPages: number;
  scale: number;
  setScale: (s: number) => void;
  onDocumentLoadSuccess: (pdf: any) => void;
  onDocumentLoadError: (error: Error) => void;
  onReflowPageInfo?: (info: { current: number; total: number; pdfPage: number }) => void;
  /** 캔버스 모드에서 보던 PDF 페이지 (마운트 시 해당 위치로 스크롤) */
  initialPdfPage?: number;
  /** 검색 하이라이트용 쿼리 */
  searchQuery?: string;
}

/** 검색어 하이라이트 + 개행 렌더링 */
function renderText(text: string, query?: string) {
  if (!query?.trim()) {
    // 하이라이트 없음 → 기존 개행 처리만
    const parts = text.split('\n');
    if (parts.length === 1) return text;
    return parts.map((part, i) => (
      <Fragment key={i}>
        {i > 0 && <br />}
        {part}
      </Fragment>
    ));
  }

  // 검색어 하이라이트
  const q = query.toLowerCase();
  const result: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const idx = remaining.toLowerCase().indexOf(q);
    if (idx === -1) {
      result.push(<Fragment key={key}>{remaining}</Fragment>);
      break;
    }
    if (idx > 0) {
      result.push(<Fragment key={key}>{remaining.slice(0, idx)}</Fragment>);
      key++;
    }
    result.push(
      <mark key={key} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">
        {remaining.slice(idx, idx + q.length)}
      </mark>,
    );
    key++;
    remaining = remaining.slice(idx + q.length);
  }

  return result;
}

export const ReflowViewer = forwardRef<ReflowViewerHandle, ReflowViewerProps>(
  function ReflowViewer(props, ref) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevScaleRef = useRef(props.scale);
  const onReflowPageInfoRef = useRef(props.onReflowPageInfo);
  onReflowPageInfoRef.current = props.onReflowPageInfo;

  // 외부에서 특정 가상 페이지로 스크롤 이동
  useImperativeHandle(ref, () => ({
    scrollToPage: (page: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const total = Math.max(1, Math.ceil(el.scrollHeight / el.clientHeight));
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0 || total <= 1) return;
      const ratio = (page - 1) / (total - 1);
      el.scrollTo({ top: ratio * maxScroll, behavior: 'smooth' });
    },
    scrollByPage: (delta: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const viewportH = el.clientHeight;
      el.scrollBy({ top: delta * viewportH * 0.9, behavior: 'smooth' });
    },
    scrollToPdfPage: (pageNum: number) => {
      const el = scrollRef.current;
      if (!el) return;
      if (pageNum <= 1) {
        el.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const divider = el.querySelector(`[data-pdf-page="${pageNum}"]`);
      if (divider) {
        (divider as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
  }));

  const { reflowBlocks, isExtracting } = useReflowExtractor(
    props.pdfDoc,
    props.numPages,
    true,
  );

  // 마운트 시 캔버스에서 보던 PDF 페이지 위치로 스크롤
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    if (reflowBlocks.length === 0) return;
    if (!props.initialPdfPage || props.initialPdfPage <= 1) {
      didInitialScrollRef.current = true;
      return;
    }
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    // 목표 페이지의 구분선이 DOM에 렌더링될 때까지 대기
    const divider = scrollEl.querySelector(`[data-pdf-page="${props.initialPdfPage}"]`);
    if (!divider) return; // 아직 추출 안 됨 → reflowBlocks 업데이트 시 재시도

    didInitialScrollRef.current = true;
    requestAnimationFrame(() => {
      (divider as HTMLElement).scrollIntoView({ block: 'start' });
    });
  }, [reflowBlocks.length, props.initialPdfPage]);

  useReflowPinchZoom({
    scrollRef,
    transformRef,
    scale: props.scale,
    setScale: props.setScale,
    enabled: !isExtracting && reflowBlocks.length > 0,
  });

  // 스크롤 비율 실시간 추적 (줌 시 읽던 위치 복원용)
  const scrollRatioRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const track = () => {
      const max = el.scrollHeight - el.clientHeight;
      scrollRatioRef.current = max > 0 ? el.scrollTop / max : 0;
    };
    el.addEventListener('scroll', track, { passive: true });
    return () => el.removeEventListener('scroll', track);
  }, []);

  // 줌 변경 시 리플로우 중 글자 크기 변화를 감추고, 완료 후 표시
  useLayoutEffect(() => {
    if (prevScaleRef.current === props.scale) return;
    prevScaleRef.current = props.scale;

    const content = contentRef.current;
    const scrollEl = scrollRef.current;
    const wrapper = transformRef.current;
    if (!content) return;

    const savedRatio = scrollRatioRef.current;

    content.style.opacity = '0';
    if (wrapper) {
      wrapper.style.transition = 'none';
      wrapper.style.transform = '';
      wrapper.style.transformOrigin = '';
      wrapper.style.willChange = '';
    }

    requestAnimationFrame(() => {
      // 읽던 위치 복원
      if (scrollEl) {
        const max = scrollEl.scrollHeight - scrollEl.clientHeight;
        if (max > 0) scrollEl.scrollTop = savedRatio * max;
      }
      content.style.opacity = '1';
    });
  }, [props.scale]);

  // 스크롤 위치 기반 가상 페이지 추적
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || isExtracting || reflowBlocks.length === 0) return;

    let rafPending = false;

    const update = () => {
      rafPending = false;
      const vh = scrollEl.clientHeight;
      const sh = scrollEl.scrollHeight;
      const st = scrollEl.scrollTop;
      if (vh <= 0) return;
      const total = Math.max(1, Math.ceil(sh / vh));
      const maxScroll = sh - vh;
      const current = maxScroll <= 0
        ? 1
        : Math.min(total, Math.floor((st / maxScroll) * (total - 1)) + 1);

      // 현재 보이는 원본 PDF 페이지 추적 (구분선 기준)
      let pdfPage = 1;
      const dividers = scrollEl.querySelectorAll<HTMLElement>('[data-pdf-page]');
      const midY = scrollEl.getBoundingClientRect().top + vh * 0.3;
      for (const div of dividers) {
        if (div.getBoundingClientRect().top <= midY) {
          pdfPage = parseInt(div.dataset.pdfPage!, 10);
        }
      }
      onReflowPageInfoRef.current?.({ current, total, pdfPage });
    };

    const throttled = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(update);
    };

    // 스케일 변경 후 리플로우 완료 대기
    let initRafId = requestAnimationFrame(() => {
      initRafId = requestAnimationFrame(update);
    });

    scrollEl.addEventListener('scroll', throttled, { passive: true });
    const observer = new ResizeObserver(throttled);
    if (transformRef.current) observer.observe(transformRef.current);

    return () => {
      cancelAnimationFrame(initRafId);
      scrollEl.removeEventListener('scroll', throttled);
      observer.disconnect();
    };
  }, [isExtracting, reflowBlocks.length, props.scale]);

  return (
    <div
      ref={scrollRef}
      className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-white"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {isExtracting ? (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">텍스트 추출 중...</p>
        </div>
      ) : reflowBlocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
          <FileImage className="w-10 h-10 text-gray-300 mb-2" />
          <p className="text-sm">추출할 텍스트가 없습니다.</p>
          <p className="text-xs text-gray-400 mt-1">이미지 기반 PDF일 수 있습니다.</p>
        </div>
      ) : (
        <div ref={transformRef}>
          <div
            ref={contentRef}
            className="px-4 py-5 max-w-none"
            style={{
              fontSize: `${Math.round(16 * props.scale)}px`,
              lineHeight: 1.8,
            }}
          >
            {reflowBlocks.map((block, i) => {
              if (block.type === 'divider') {
                return (
                  <div key={i} data-pdf-page={block.pageNum} className="my-6 flex items-center gap-3">
                    <div className="flex-1 border-t border-gray-200" />
                    <span className="text-xs text-gray-400 shrink-0">페이지 {block.pageNum}</span>
                    <div className="flex-1 border-t border-gray-200" />
                  </div>
                );
              }
              if (block.type === 'heading') {
                return block.level === 1 ? (
                  <h2 key={i} className="font-bold mt-5 mb-2" style={{ fontSize: '1.4em' }}>
                    {renderText(block.text, props.searchQuery)}
                  </h2>
                ) : (
                  <h3 key={i} className="font-semibold mt-4 mb-1.5" style={{ fontSize: '1.15em' }}>
                    {renderText(block.text, props.searchQuery)}
                  </h3>
                );
              }
              return (
                <p key={i} className="mb-3 text-gray-800 break-keep whitespace-pre-line">
                  {renderText(block.text, props.searchQuery)}
                </p>
              );
            })}
          </div>
        </div>
      )}
      {/* 리플로우 모드에서도 Document를 숨겨서 로드 -> pdfDoc 유지 */}
      <div className="hidden">
        <Document
          file={props.fileUrl}
          onLoadSuccess={props.onDocumentLoadSuccess}
          onLoadError={props.onDocumentLoadError}
        />
      </div>
    </div>
  );
});
