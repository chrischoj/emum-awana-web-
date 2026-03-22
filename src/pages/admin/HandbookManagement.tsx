import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import toast from 'react-hot-toast';
import { BookOpen, Upload, Trash2, RefreshCw, FileText, Eye, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { useAuth } from '../../contexts/AuthContext';
import type { ClubHandbook } from '../../types/awana';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ---- PDF 미리보기 모달 ----
function PdfPreviewModal({ handbook, onClose }: { handbook: ClubHandbook | null; onClose: () => void }) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!handbook) return;
    setNumPages(0);
    setCurrentPage(1);
    setScale(1);
  }, [handbook]);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [handbook]);

  if (!handbook) return null;

  const pageWidth = containerWidth > 0 ? containerWidth * scale : undefined;
  const isZoomed = scale > 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="w-5 h-5 text-indigo-500 shrink-0" />
          <h2 className="text-sm font-semibold text-gray-800 truncate">{handbook.title}</h2>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* PDF 영역 */}
      <div ref={containerRef} className="flex-1 min-h-0 relative bg-gray-100">
        <div
          className="absolute inset-0 overflow-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <Document
            file={handbook.file_url}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            onLoadError={() => toast.error('PDF를 불러오지 못했습니다.')}
            loading={
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
              width={pageWidth}
              loading={
                <div className="flex items-center justify-center py-8" style={{ width: pageWidth }}>
                  <div className="w-6 h-6 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                </div>
              }
              className="shadow-lg"
            />
          </Document>
        </div>
      </div>

      {/* 컨트롤 바 */}
      <div className="bg-white border-t px-3 py-2 shrink-0">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200"
            >
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            <span className="text-xs font-medium text-gray-600 min-w-[52px] text-center">
              {numPages > 0 ? `${currentPage} / ${numPages}` : '-'}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200"
            >
              <ChevronRight className="w-5 h-5 text-gray-700" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setScale((s) => Math.max(0.5, parseFloat((s - 0.25).toFixed(2))))}
              disabled={scale <= 0.5}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200"
            >
              <ZoomOut className="w-4 h-4 text-gray-700" />
            </button>
            <button
              onClick={() => setScale(1)}
              className={`text-xs font-medium min-w-[42px] text-center px-1 py-1 rounded ${
                isZoomed ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500'
              }`}
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={() => setScale((s) => Math.min(3, parseFloat((s + 0.25).toFixed(2))))}
              disabled={scale >= 3}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 disabled:opacity-30 active:bg-gray-200"
            >
              <ZoomIn className="w-4 h-4 text-gray-700" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function HandbookManagement() {
  const { clubs } = useClub();
  const { teacher } = useAuth();

  const [handbooks, setHandbooks] = useState<ClubHandbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewHandbook, setPreviewHandbook] = useState<ClubHandbook | null>(null);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ============================================
  // Data Loading
  // ============================================
  const loadHandbooks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('club_handbooks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHandbooks(data ?? []);
    } catch {
      toast.error('핸드북 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHandbooks();
  }, []);

  // ============================================
  // Upload Handler
  // ============================================
  const handleUpload = async (clubId: string, file: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('PDF 파일만 업로드 가능합니다');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('파일 크기는 50MB 이하여야 합니다');
      return;
    }

    setUploading(clubId);
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${clubId}/${Date.now()}_${sanitizedName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('handbooks')
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('handbooks')
        .getPublicUrl(path);

      // Derive title from filename (without extension)
      const title = file.name.replace(/\.pdf$/i, '');

      // Insert record into club_handbooks
      const { error: insertError } = await supabase
        .from('club_handbooks')
        .insert({
          club_id: clubId,
          title,
          file_url: publicUrl,
          file_name: file.name,
          file_size: file.size,
          uploaded_by: teacher?.id ?? null,
        });

      if (insertError) throw insertError;

      toast.success('핸드북이 업로드되었습니다');
      await loadHandbooks();
    } catch {
      toast.error('업로드에 실패했습니다');
    } finally {
      setUploading(null);
      // Reset file input
      const input = fileInputRefs.current[clubId];
      if (input) input.value = '';
    }
  };

  const handleFileChange = (clubId: string) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleUpload(clubId, file);
  };

  // ============================================
  // Delete Handler
  // ============================================
  const handleDelete = async (handbook: ClubHandbook) => {
    if (!confirm(`"${handbook.title}" 핸드북을 삭제하시겠습니까?`)) return;

    setDeleting(handbook.id);
    try {
      // Extract storage path from URL
      // publicUrl format: .../storage/v1/object/public/handbooks/{club_id}/{filename}
      const url = new URL(handbook.file_url);
      const pathParts = url.pathname.split('/handbooks/');
      if (pathParts.length >= 2) {
        const storagePath = pathParts[1];
        await supabase.storage.from('handbooks').remove([storagePath]);
      }

      // Delete DB record
      const { error } = await supabase
        .from('club_handbooks')
        .delete()
        .eq('id', handbook.id);

      if (error) throw error;

      toast.success('핸드북이 삭제되었습니다');
      await loadHandbooks();
    } catch {
      toast.error('삭제에 실패했습니다');
    } finally {
      setDeleting(null);
    }
  };

  // ============================================
  // Replace Handler (delete old + upload new)
  // ============================================
  const handleReplace = async (handbook: ClubHandbook, file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('PDF 파일만 업로드 가능합니다');
      return;
    }

    setUploading(handbook.club_id);
    try {
      // Remove old file from storage
      const url = new URL(handbook.file_url);
      const pathParts = url.pathname.split('/handbooks/');
      if (pathParts.length >= 2) {
        await supabase.storage.from('handbooks').remove([pathParts[1]]);
      }

      // Upload new file
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${handbook.club_id}/${Date.now()}_${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from('handbooks')
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('handbooks')
        .getPublicUrl(path);

      const title = file.name.replace(/\.pdf$/i, '');

      const { error: updateError } = await supabase
        .from('club_handbooks')
        .update({
          title,
          file_url: publicUrl,
          file_name: file.name,
          file_size: file.size,
          uploaded_by: teacher?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', handbook.id);

      if (updateError) throw updateError;

      toast.success('핸드북이 교체되었습니다');
      await loadHandbooks();
    } catch {
      toast.error('교체에 실패했습니다');
    } finally {
      setUploading(null);
    }
  };

  // ============================================
  // Render
  // ============================================
  return (
    <div>
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">핸드북 관리</h1>
        </div>
        <button
          onClick={loadHandbooks}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 클럽별 핸드북 섹션 */}
      <div className="space-y-6">
        {clubs.map((club) => {
          const clubHandbooks = handbooks.filter((h) => h.club_id === club.id);
          const isUploadingThisClub = uploading === club.id;

          return (
            <section key={club.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {/* 섹션 헤더 */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-500" />
                  {club.name}
                  <span className="text-xs font-normal text-gray-400">({clubHandbooks.length}개)</span>
                </h2>
                {/* 업로드 버튼 */}
                <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  isUploadingThisClub
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}>
                  {isUploadingThisClub ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      업로드 중...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      PDF 업로드
                    </>
                  )}
                  <input
                    ref={(el) => { fileInputRefs.current[club.id] = el; }}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    disabled={isUploadingThisClub}
                    onChange={handleFileChange(club.id)}
                  />
                </label>
              </div>

              {/* 핸드북 목록 */}
              <div className="divide-y divide-gray-100">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                  </div>
                ) : clubHandbooks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
                    <FileText className="w-8 h-8" />
                    <p className="text-sm">핸드북이 없습니다</p>
                  </div>
                ) : (
                  clubHandbooks.map((handbook) => {
                    const isDeletingThis = deleting === handbook.id;
                    const isReplacingThis = uploading === handbook.club_id;

                    return (
                      <div key={handbook.id} className="flex items-center gap-3 px-4 py-3">
                        {/* 아이콘 */}
                        <div className="flex-shrink-0 w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-red-500" />
                        </div>

                        {/* 정보 */}
                        <div className="flex-1 min-w-0">
                          <a
                            href={handbook.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-gray-800 hover:text-indigo-600 transition-colors truncate block"
                          >
                            {handbook.title}
                          </a>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400 truncate">{handbook.file_name}</span>
                            {handbook.file_size != null && (
                              <>
                                <span className="text-gray-300">·</span>
                                <span className="text-xs text-gray-400 flex-shrink-0">
                                  {formatFileSize(handbook.file_size)}
                                </span>
                              </>
                            )}
                            <span className="text-gray-300">·</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {new Date(handbook.created_at).toLocaleDateString('ko-KR')}
                            </span>
                          </div>
                        </div>

                        {/* 액션 버튼 */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* 미리보기 버튼 */}
                          <button
                            onClick={() => setPreviewHandbook(handbook)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="미리보기"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* 교체 버튼 */}
                          <label className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isReplacingThis
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                          }`} title="교체">
                            <Upload className="w-4 h-4" />
                            <input
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              disabled={isReplacingThis}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) await handleReplace(handbook, file);
                                e.target.value = '';
                              }}
                            />
                          </label>

                          {/* 삭제 버튼 */}
                          <button
                            onClick={() => handleDelete(handbook)}
                            disabled={isDeletingThis || isReplacingThis}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isDeletingThis
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                            }`}
                            title="삭제"
                          >
                            {isDeletingThis ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}

        {clubs.length === 0 && !loading && (
          <div className="text-center py-16 text-gray-400">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">등록된 클럽이 없습니다</p>
          </div>
        )}
      </div>

      {/* PDF 미리보기 모달 */}
      <PdfPreviewModal
        handbook={previewHandbook}
        onClose={() => setPreviewHandbook(null)}
      />
    </div>
  );
}
