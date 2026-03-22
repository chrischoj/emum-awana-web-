import { useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';

/**
 * PDF Document 로딩 관리 훅.
 * react-pdf의 Document onLoadSuccess/onLoadError 콜백을 캡슐화하고,
 * 내부적으로 pdfDoc ref를 유지하여 리플로우 텍스트 추출 등에 활용할 수 있도록 한다.
 */
export function usePdfDocument() {
  const [numPages, setNumPages] = useState(0);
  const [pdfError, setPdfError] = useState(false);
  const pdfDocRef = useRef<any>(null);

  const handleDocumentLoadSuccess = useCallback((pdf: any) => {
    setNumPages(pdf.numPages);
    setPdfError(false);
    pdfDocRef.current = pdf;
  }, []);

  const handleDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    setPdfError(true);
    toast.error('PDF를 불러오지 못했습니다.');
  }, []);

  /** fileUrl이 변경될 때 호출하여 상태 리셋 */
  const resetDocument = useCallback(() => {
    setNumPages(0);
    setPdfError(false);
    pdfDocRef.current = null;
  }, []);

  return {
    /** 로드된 pdfjs Document 객체 (리플로우 추출용) */
    pdfDoc: pdfDocRef.current,
    numPages,
    pdfError,
    handleDocumentLoadSuccess,
    handleDocumentLoadError,
    resetDocument,
  };
}
