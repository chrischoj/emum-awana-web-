export interface ReflowBlock {
  type: 'heading' | 'paragraph' | 'divider';
  text: string;
  level?: number;
  pageNum: number;
}

export interface PdfViewerProps {
  fileUrl: string;
  /** 컨테이너 높이를 직접 지정 (기본: 100%) */
  height?: string;
  /** 전체화면 상태 변경 콜백 */
  onFullscreenChange?: (isFullscreen: boolean) => void;
  /** 기본 보기 모드 (관리자 설정). 'reflow' = 텍스트 모드, 'original' = 원본보기 */
  defaultViewMode?: 'reflow' | 'original';
}

export interface PdfViewerHandle {
  toggleFullscreen: () => void;
}

export type CurlDirection = 'next' | 'prev';

export interface CurlGeometry {
  clipPath: string;
  foldX: number;
  curlBackClip: string;
  curlBackTransform: string;
  curlBackOrigin: string;
  shadowGradient: string;
  curlWidth: number;
}
