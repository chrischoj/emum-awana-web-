import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { BookOpen, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface ClubHandbook {
  id: string;
  club_id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export default function HandbookPage() {
  const { teacher } = useAuth();
  const [handbooks, setHandbooks] = useState<ClubHandbook[]>([]);
  const [selectedHandbookId, setSelectedHandbookId] = useState<string | null>(null);
  const [loadingHandbooks, setLoadingHandbooks] = useState(true);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // 컨테이너 너비 측정
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 핸드북 목록 불러오기
  useEffect(() => {
    const fetchHandbooks = async () => {
      if (!teacher?.club_id) {
        setLoadingHandbooks(false);
        return;
      }
      setLoadingHandbooks(true);
      try {
        const { data, error } = await supabase
          .from('club_handbooks')
          .select('*')
          .eq('club_id', teacher.club_id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setHandbooks(data ?? []);
        if (data && data.length > 0) {
          setSelectedHandbookId(data[0].id);
        }
      } catch (err) {
        console.error(err);
        toast.error('핸드북을 불러오지 못했습니다.');
      } finally {
        setLoadingHandbooks(false);
      }
    };

    fetchHandbooks();
  }, [teacher?.club_id]);

  const selectedHandbook = handbooks.find((h) => h.id === selectedHandbookId) ?? null;

  const handleDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
    setPdfLoading(false);
    setPdfError(false);
  }, []);

  const handleDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    setPdfLoading(false);
    setPdfError(true);
    toast.error('PDF를 불러오지 못했습니다.');
  }, []);

  const goToPrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goToNextPage = () => setCurrentPage((p) => Math.min(numPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(3, parseFloat((s + 0.2).toFixed(1))));
  const zoomOut = () => setScale((s) => Math.max(0.5, parseFloat((s - 0.2).toFixed(1))));

  const handleHandbookChange = (id: string) => {
    setSelectedHandbookId(id);
    setCurrentPage(1);
    setNumPages(0);
    setPdfError(false);
    setPdfLoading(true);
  };

  // 클럽 미배정
  if (!teacher?.club_id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
        <BookOpen className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500 text-base">배정된 클럽이 없습니다</p>
      </div>
    );
  }

  // 로딩 중
  if (loadingHandbooks) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 핸드북 없음
  if (handbooks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
        <BookOpen className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500 text-base">등록된 핸드북이 없습니다</p>
      </div>
    );
  }

  const pageWidth = containerWidth > 0 ? containerWidth * scale : undefined;

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      {/* 헤더 - 핸드북 선택 */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        {handbooks.length > 1 ? (
          <select
            value={selectedHandbookId ?? ''}
            onChange={(e) => handleHandbookChange(e.target.value)}
            className="w-full text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {handbooks.map((h) => (
              <option key={h.id} value={h.id}>
                {h.title}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-500 shrink-0" />
            <h1 className="text-base font-semibold text-gray-800 truncate">
              {selectedHandbook?.title}
            </h1>
          </div>
        )}
      </header>

      {/* PDF 뷰어 영역 */}
      <main
        ref={containerRef}
        className="flex-1 overflow-auto flex flex-col items-center bg-gray-100 py-4 px-2"
      >
        {selectedHandbook && (
          <>
            {pdfError ? (
              <div className="flex flex-col items-center justify-center flex-1 py-16 text-gray-500">
                <BookOpen className="w-10 h-10 text-gray-300 mb-2" />
                <p className="text-sm">PDF를 불러오지 못했습니다.</p>
              </div>
            ) : (
              <Document
                file={selectedHandbook.file_url}
                onLoadSuccess={handleDocumentLoadSuccess}
                onLoadError={handleDocumentLoadError}
                loading={
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                }
                className="flex flex-col items-center"
              >
                <Page
                  pageNumber={currentPage}
                  width={pageWidth}
                  loading={
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  }
                  className="shadow-md"
                />
              </Document>
            )}
          </>
        )}
      </main>

      {/* 푸터 - 페이지 네비게이션 + 줌 컨트롤 */}
      <footer className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-3 sticky bottom-0 z-10">
        {/* 페이지 이동 */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className="flex items-center justify-center w-11 h-11 rounded-lg bg-gray-100 disabled:opacity-40 active:bg-gray-200 transition-colors"
            aria-label="이전 페이지"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>

          <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">
            {numPages > 0 ? `${currentPage} / ${numPages}` : '-'}
          </span>

          <button
            onClick={goToNextPage}
            disabled={currentPage >= numPages || numPages === 0}
            className="flex items-center justify-center w-11 h-11 rounded-lg bg-gray-100 disabled:opacity-40 active:bg-gray-200 transition-colors"
            aria-label="다음 페이지"
          >
            <ChevronRight className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        {/* 줌 컨트롤 */}
        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="flex items-center justify-center w-11 h-11 rounded-lg bg-gray-100 disabled:opacity-40 active:bg-gray-200 transition-colors"
            aria-label="축소"
          >
            <ZoomOut className="w-5 h-5 text-gray-700" />
          </button>

          <span className="text-sm font-medium text-gray-700 min-w-[46px] text-center">
            {Math.round(scale * 100)}%
          </span>

          <button
            onClick={zoomIn}
            disabled={scale >= 3}
            className="flex items-center justify-center w-11 h-11 rounded-lg bg-gray-100 disabled:opacity-40 active:bg-gray-200 transition-colors"
            aria-label="확대"
          >
            <ZoomIn className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </footer>
    </div>
  );
}
