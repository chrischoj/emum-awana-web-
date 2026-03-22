import { useRef } from 'react';
import { Document } from 'react-pdf';
import { FileImage } from 'lucide-react';
import { useReflowExtractor } from './hooks';

interface ReflowViewerProps {
  fileUrl: string;
  pdfDoc: any;
  numPages: number;
  scale: number;
  onDocumentLoadSuccess: (pdf: any) => void;
  onDocumentLoadError: (error: Error) => void;
}

export function ReflowViewer(props: ReflowViewerProps) {
  const reflowScrollRef = useRef<HTMLDivElement>(null);
  const { reflowBlocks, isExtracting } = useReflowExtractor(
    props.pdfDoc,
    props.numPages,
    true,
  );

  return (
    <div
      ref={reflowScrollRef}
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
        <div
          className="px-4 py-5 max-w-none"
          style={{ fontSize: `${Math.round(16 * props.scale)}px`, lineHeight: 1.8 }}
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
                  {block.text}
                </h2>
              ) : (
                <h3 key={i} className="font-semibold mt-4 mb-1.5" style={{ fontSize: '1.15em' }}>
                  {block.text}
                </h3>
              );
            }
            return (
              <p key={i} className="mb-3 text-gray-800 break-keep">
                {block.text}
              </p>
            );
          })}
        </div>
      )}
      {/* 리플로우 모드에서도 Document를 숨겨서 로드 -> pdfDocRef 유지 */}
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
