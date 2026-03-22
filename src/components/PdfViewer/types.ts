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
