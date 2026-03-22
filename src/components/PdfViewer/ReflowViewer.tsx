import { useRef, Fragment } from 'react';
import { Document } from 'react-pdf';
import { FileImage } from 'lucide-react';
import { useReflowExtractor } from './hooks';
import { useReflowPinchZoom } from './hooks/useReflowPinchZoom';

interface ReflowViewerProps {
  fileUrl: string;
  pdfDoc: any;
  numPages: number;
  scale: number;
  setScale: (s: number) => void;
  onDocumentLoadSuccess: (pdf: any) => void;
  onDocumentLoadError: (error: Error) => void;
}

/** \n을 <br/>로 변환하여 개행 렌더링 */
function renderTextWithBreaks(text: string) {
  const parts = text.split('\n');
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {part}
    </Fragment>
  ));
}

const FONT_TRANSITION = 'font-size 350ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';

export function ReflowViewer(props: ReflowViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<HTMLDivElement>(null);

  const { reflowBlocks, isExtracting } = useReflowExtractor(
    props.pdfDoc,
    props.numPages,
    true,
  );

  useReflowPinchZoom({
    scrollRef,
    transformRef,
    scale: props.scale,
    setScale: props.setScale,
    enabled: !isExtracting && reflowBlocks.length > 0,
  });

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
            className="px-4 py-5 max-w-none"
            style={{
              fontSize: `${Math.round(16 * props.scale)}px`,
              lineHeight: 1.8,
              transition: FONT_TRANSITION,
            }}
          >
            {reflowBlocks.map((block, i) => {
              if (block.type === 'divider') {
                return (
                  <div key={i} className="my-6 flex items-center gap-3">
                    <div className="flex-1 border-t border-gray-200" />
                    <span className="text-xs text-gray-400 shrink-0">페이지 {block.pageNum}</span>
                    <div className="flex-1 border-t border-gray-200" />
                  </div>
                );
              }
              if (block.type === 'heading') {
                return block.level === 1 ? (
                  <h2 key={i} className="font-bold mt-5 mb-2" style={{ fontSize: '1.4em' }}>
                    {renderTextWithBreaks(block.text)}
                  </h2>
                ) : (
                  <h3 key={i} className="font-semibold mt-4 mb-1.5" style={{ fontSize: '1.15em' }}>
                    {renderTextWithBreaks(block.text)}
                  </h3>
                );
              }
              return (
                <p key={i} className="mb-3 text-gray-800 break-keep whitespace-pre-line">
                  {block.text}
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
}
