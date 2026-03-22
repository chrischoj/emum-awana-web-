import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';

/**
 * PDF Document 로딩 관리 훅.
 * react-pdf의 Document onLoadSuccess/onLoadError 콜백을 캡슐화하고,
 * pdfDoc을 state로 관리하여 Document 재로드 시 리렌더를 보장한다.
 */
export function usePdfDocument() {
  const [numPages, setNumPages] = useState(0);
  const [pdfError, setPdfError] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<any>(null);

  const handleDocumentLoadSuccess = useCallback((pdf: any) => {
    setNumPages(pdf.numPages);
    setPdfError(false);
    setPdfDoc(pdf);
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
    setPdfDoc(null);
  }, []);

  return {
    pdfDoc,
    numPages,
    pdfError,
    handleDocumentLoadSuccess,
    handleDocumentLoadError,
    resetDocument,
  };
}
