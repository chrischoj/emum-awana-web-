import { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  FileImage,
  Type,
} from 'lucide-react';
import { MIN_SCALE, MAX_SCALE } from './constants';

interface ControlBarProps {
  isReflowMode: boolean;
  onToggleReflow: () => void;
  currentPage: number;
  numPages: number;
  isAnimating: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPageJump?: (page: number) => void;
  scale: number;
  isZoomed: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  reflowCurrentPage?: number;
  reflowTotalPages?: number;
  maxScale?: number;
}

/** 탭하면 인라인 입력으로 전환되는 페이지 인디케이터 */
function PageIndicator({
  current,
  total,
  onJump,
  className,
}: {
  current: number;
  total: number;
  onJump?: (page: number) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (total <= 0) {
    return <span className={className}>-</span>;
  }

  const submit = () => {
    const page = parseInt(value, 10);
    if (!isNaN(page) && page >= 1 && page <= total) {
      onJump?.(page);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="flex items-center gap-0.5"
      >
        <input
          ref={inputRef}
          type="number"
          min={1}
          max={total}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={submit}
          className="w-10 h-6 text-xs text-center font-medium border border-indigo-300 rounded bg-white outline-none focus:ring-1 focus:ring-indigo-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          inputMode="numeric"
        />
        <span className="text-xs text-gray-400">/ {total}</span>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setValue(String(current));
        setEditing(true);
      }}
      className={`${className} active:bg-gray-100 rounded px-1 py-0.5`}
      title="페이지 이동"
    >
      {current} / {total}
    </button>
  );
}

export function ControlBar(props: ControlBarProps) {
  return (
    <div className="bg-white border-t border-gray-200 px-3 py-2 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {props.isReflowMode ? (
            <PageIndicator
              current={props.reflowCurrentPage ?? 1}
              total={props.reflowTotalPages ?? 1}
              onJump={props.onPageJump}
              className="text-xs font-medium text-indigo-600 px-1"
            />
          ) : (
            <>
              <button
                onClick={props.onPrev}
                disabled={props.currentPage <= 1 || props.isAnimating}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </button>
              <PageIndicator
                current={props.currentPage}
                total={props.numPages}
                onJump={props.onPageJump}
                className="text-xs font-medium text-gray-600 min-w-[52px] text-center"
              />
              <button
                onClick={props.onNext}
                disabled={props.currentPage >= props.numPages || props.numPages === 0 || props.isAnimating}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-700" />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={props.onZoomOut}
            disabled={props.scale <= MIN_SCALE}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
          >
            <ZoomOut className="w-4 h-4 text-gray-700" />
          </button>
          <button
            onClick={props.onResetZoom}
            className={`text-xs font-medium min-w-[42px] text-center px-1 py-1 rounded transition-colors ${
              props.isZoomed ? 'text-indigo-600 bg-indigo-50 active:bg-indigo-100' : 'text-gray-500'
            }`}
          >
            {Math.round(props.scale * 100)}%
          </button>
          <button
            onClick={props.onZoomIn}
            disabled={props.scale >= (props.maxScale ?? MAX_SCALE)}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
          >
            <ZoomIn className="w-4 h-4 text-gray-700" />
          </button>
          <div className="w-px h-6 bg-gray-200 mx-0.5" />
          <button
            onClick={props.onToggleReflow}
            className={`flex items-center gap-1 px-2.5 h-9 rounded-lg text-xs font-medium transition-colors ${
              props.isReflowMode
                ? 'bg-gray-100 text-gray-600 active:bg-gray-200'
                : 'bg-indigo-50 text-indigo-600 active:bg-indigo-100'
            }`}
            title={props.isReflowMode ? 'PDF 원본 보기' : '텍스트 보기'}
          >
            {props.isReflowMode ? (
              <>
                <FileImage className="w-3.5 h-3.5" />
                <span>원본</span>
              </>
            ) : (
              <>
                <Type className="w-3.5 h-3.5" />
                <span>텍스트</span>
              </>
            )}
          </button>
          <button
            onClick={props.onToggleFullscreen}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 active:bg-gray-200 transition-colors"
            title={props.isFullscreen ? '전체화면 해제' : '전체화면'}
          >
            {props.isFullscreen
              ? <Minimize2 className="w-4 h-4 text-gray-700" />
              : <Maximize2 className="w-4 h-4 text-gray-700" />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
