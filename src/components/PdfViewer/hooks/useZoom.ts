import { useState, useCallback } from 'react';
import { ZOOM_LEVELS, MIN_SCALE, MAX_SCALE } from '../constants';

/**
 * 버튼 기반 줌 상태 관리 훅.
 * ZOOM_LEVELS 배열을 기반으로 스냅 줌인/줌아웃을 제공한다.
 */
export function useZoom(initialScale = 1) {
  const [scale, setScale] = useState(initialScale);

  const isZoomed = scale > 1;

  const zoomIn = useCallback(() => {
    setScale((prev) => {
      const next = ZOOM_LEVELS.find((z) => z > prev);
      return next ?? MAX_SCALE;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => {
      const next = [...ZOOM_LEVELS].reverse().find((z) => z < prev);
      return next ?? MIN_SCALE;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
  }, []);

  return {
    scale,
    setScale,
    isZoomed,
    zoomIn,
    zoomOut,
    resetZoom,
  };
}
