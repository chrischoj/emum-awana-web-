import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { BookOpen, Upload, Trash2, RefreshCw, FileText, Eye, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { useAuth } from '../../contexts/AuthContext';
import { PdfViewer } from '../../components/PdfViewer';
import type { ClubHandbook } from '../../types/awana';

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

  useEffect(() => { loadHandbooks(); }, []);

  // ============================================
  // Upload Handler
  // ============================================
  const handleUpload = async (clubId: string, file: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf') { toast.error('PDF 파일만 업로드 가능합니다'); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error('파일 크기는 50MB 이하여야 합니다'); return; }

    setUploading(clubId);
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${clubId}/${Date.now()}_${sanitizedName}`;

      const { error: uploadError } = await supabase.storage.from('handbooks').upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('handbooks').getPublicUrl(path);
      const title = file.name.replace(/\.pdf$/i, '');

      const { error: insertError } = await supabase.from('club_handbooks').insert({
        club_id: clubId, title, file_url: publicUrl, file_name: file.name,
        file_size: file.size, uploaded_by: teacher?.id ?? null,
      });
      if (insertError) throw insertError;

      toast.success('핸드북이 업로드되었습니다');
      await loadHandbooks();
    } catch {
      toast.error('업로드에 실패했습니다');
    } finally {
      setUploading(null);
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
      const url = new URL(handbook.file_url);
      const pathParts = url.pathname.split('/handbooks/');
      if (pathParts.length >= 2) await supabase.storage.from('handbooks').remove([pathParts[1]]);

      const { error } = await supabase.from('club_handbooks').delete().eq('id', handbook.id);
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
  // Replace Handler
  // ============================================
  const handleReplace = async (handbook: ClubHandbook, file: File) => {
    if (file.type !== 'application/pdf') { toast.error('PDF 파일만 업로드 가능합니다'); return; }
    setUploading(handbook.club_id);
    try {
      const url = new URL(handbook.file_url);
      const pathParts = url.pathname.split('/handbooks/');
      if (pathParts.length >= 2) await supabase.storage.from('handbooks').remove([pathParts[1]]);

      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${handbook.club_id}/${Date.now()}_${sanitizedName}`;

      const { error: uploadError } = await supabase.storage.from('handbooks').upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('handbooks').getPublicUrl(path);
      const title = file.name.replace(/\.pdf$/i, '');

      const { error: updateError } = await supabase.from('club_handbooks').update({
        title, file_url: publicUrl, file_name: file.name, file_size: file.size,
        uploaded_by: teacher?.id ?? null, updated_at: new Date().toISOString(),
      }).eq('id', handbook.id);
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
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-500" />
                  {club.name}
                  <span className="text-xs font-normal text-gray-400">({clubHandbooks.length}개)</span>
                </h2>
                <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  isUploadingThisClub ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}>
                  {isUploadingThisClub ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" />업로드 중...</>
                  ) : (
                    <><Upload className="w-3.5 h-3.5" />PDF 업로드</>
                  )}
                  <input
                    ref={(el) => { fileInputRefs.current[club.id] = el; }}
                    type="file" accept="application/pdf" className="hidden"
                    disabled={isUploadingThisClub} onChange={handleFileChange(club.id)}
                  />
                </label>
              </div>

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
                        <div className="flex-shrink-0 w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-red-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <a href={handbook.file_url} target="_blank" rel="noopener noreferrer"
                            className="text-sm font-semibold text-gray-800 hover:text-indigo-600 transition-colors truncate block">
                            {handbook.title}
                          </a>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400 truncate">{handbook.file_name}</span>
                            {handbook.file_size != null && (
                              <><span className="text-gray-300">·</span>
                              <span className="text-xs text-gray-400 flex-shrink-0">{formatFileSize(handbook.file_size)}</span></>
                            )}
                            <span className="text-gray-300">·</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {new Date(handbook.created_at).toLocaleDateString('ko-KR')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => setPreviewHandbook(handbook)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="미리보기">
                            <Eye className="w-4 h-4" />
                          </button>
                          <label className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isReplacingThis ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                          }`} title="교체">
                            <Upload className="w-4 h-4" />
                            <input type="file" accept="application/pdf" className="hidden" disabled={isReplacingThis}
                              onChange={async (e) => { const file = e.target.files?.[0]; if (file) await handleReplace(handbook, file); e.target.value = ''; }} />
                          </label>
                          <button onClick={() => handleDelete(handbook)} disabled={isDeletingThis || isReplacingThis}
                            className={`p-1.5 rounded-lg transition-colors ${isDeletingThis ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`} title="삭제">
                            {isDeletingThis ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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

      {/* PDF 미리보기 모달 (공통 PdfViewer 사용) */}
      {previewHandbook && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60">
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="w-5 h-5 text-indigo-500 shrink-0" />
              <h2 className="text-sm font-semibold text-gray-800 truncate">{previewHandbook.title}</h2>
            </div>
            <button onClick={() => setPreviewHandbook(null)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
          <PdfViewer fileUrl={previewHandbook.file_url} height="100%" />
        </div>
      )}
    </div>
  );
}
