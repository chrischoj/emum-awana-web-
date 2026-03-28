import { useState, useEffect } from 'react';
import type { ReflowBlock } from '../types';
import { extractPageReflow } from '../utils/reflowParser';

/**
 * 점진적 텍스트 추출 훅.
 *
 * enabled가 true일 때(리플로우 모드 진입 시) pdfDoc에서 페이지별로
 * 텍스트를 추출하여 ReflowBlock 배열을 생성한다.
 * 첫 페이지 추출이 완료되면 즉시 isExtracting을 false로 전환하여
 * 사용자가 대기 없이 콘텐츠를 볼 수 있도록 한다(점진적 렌더링).
 */
export function useReflowExtractor(
  pdfDoc: any,
  numPages: number,
  enabled: boolean,
) {
  const [reflowBlocks, setReflowBlocks] = useState<ReflowBlock[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionDone, setExtractionDone] = useState(false);

  useEffect(() => {
    if (!enabled || !pdfDoc || numPages === 0) return;
    let cancelled = false;
    setIsExtracting(true);
    setExtractionDone(false);
    setReflowBlocks([]);

    (async () => {
      for (let i = 1; i <= numPages; i++) {
        if (cancelled) return;
        try {
          const pageBlocks = await extractPageReflow(pdfDoc, i);
          if (cancelled) return;
          setReflowBlocks((prev) => {
            const next = [...prev];
            if (i > 1) next.push({ type: 'divider', text: '', pageNum: i });
            next.push(...pageBlocks);
            return next;
          });
          // 첫 페이지 추출 완료 -> 스피너 제거, 바로 보여줌
          if (i === 1) setIsExtracting(false);
        } catch {
          // 개별 페이지 실패는 건너뜀
        }
      }
      if (!cancelled) {
        setIsExtracting(false);
        setExtractionDone(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, pdfDoc, numPages]);

  return {
    reflowBlocks,
    isExtracting,
    extractionDone,
  };
}
