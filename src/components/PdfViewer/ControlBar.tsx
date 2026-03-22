import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  AlignLeft,
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
  scale: number;
  isZoomed: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  reflowCurrentPage?: number;
  reflowTotalPages?: number;
}

export function ControlBar(props: ControlBarProps) {
  return (
    <div className="bg-white border-t border-gray-200 px-3 py-2 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {props.isReflowMode ? (
            <span className="text-xs font-medium text-indigo-600 px-2">
              리플로우 {props.reflowCurrentPage ?? 1} / {props.reflowTotalPages ?? 1}
            </span>
          ) : (
            <>
              <button
                onClick={props.onPrev}
                disabled={props.currentPage <= 1 || props.isAnimating}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </button>
              <span className="text-xs font-medium text-gray-600 min-w-[52px] text-center">
                {props.numPages > 0 ? `${props.currentPage} / ${props.numPages}` : '-'}
              </span>
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
            disabled={props.scale >= MAX_SCALE}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200 transition-colors"
          >
            <ZoomIn className="w-4 h-4 text-gray-700" />
          </button>
          <div className="w-px h-6 bg-gray-200 mx-0.5" />
          <button
            onClick={props.onToggleReflow}
            className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
              props.isReflowMode ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-700 active:bg-gray-200'
            }`}
            title={props.isReflowMode ? '원본 보기' : '리플로우 보기'}
          >
            <AlignLeft className="w-4 h-4" />
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
