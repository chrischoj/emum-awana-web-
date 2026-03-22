import { useState, useEffect } from 'react';
import { BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PdfViewer } from '../../components/PdfViewer';
import toast from 'react-hot-toast';
import type { ClubHandbook } from '../../types/awana';

export default function HandbookPage() {
  const { teacher } = useAuth();
  const [handbooks, setHandbooks] = useState<ClubHandbook[]>([]);
  const [selectedHandbookId, setSelectedHandbookId] = useState<string | null>(null);
  const [loadingHandbooks, setLoadingHandbooks] = useState(true);

  useEffect(() => {
    const fetchHandbooks = async () => {
      if (!teacher?.club_id) { setLoadingHandbooks(false); return; }
      setLoadingHandbooks(true);
      try {
        const { data, error } = await supabase
          .from('club_handbooks')
          .select('*')
          .eq('club_id', teacher.club_id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setHandbooks(data ?? []);
        if (data && data.length > 0) setSelectedHandbookId(data[0].id);
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

  // 빈 상태
  if (!teacher?.club_id) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <BookOpen className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500 text-base">배정된 클럽이 없습니다</p>
      </div>
    );
  }
  if (loadingHandbooks) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (handbooks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <BookOpen className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500 text-base">등록된 핸드북이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col -mx-4 -mt-4" style={{ height: 'calc(100dvh - 56px - 64px)' }}>
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 shrink-0">
        {handbooks.length > 1 ? (
          <select
            value={selectedHandbookId ?? ''}
            onChange={(e) => setSelectedHandbookId(e.target.value)}
            className="w-full text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {handbooks.map((h) => (
              <option key={h.id} value={h.id}>{h.title}</option>
            ))}
          </select>
        ) : (
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-500 shrink-0" />
            <h1 className="text-sm font-semibold text-gray-800 truncate">{selectedHandbook?.title}</h1>
          </div>
        )}
      </header>

      {/* 공통 PDF 뷰어 */}
      {selectedHandbook && (
        <PdfViewer fileUrl={selectedHandbook.file_url} height="100%" />
      )}
    </div>
  );
}
