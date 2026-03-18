import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { checkInTeacherToRoom } from '../../services/checkInService';

export default function QRLandingPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { session, teacher } = useAuth();
  const [checking, setChecking] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);

  const handleCheckIn = async () => {
    if (!session || !teacher || !roomId) {
      toast.error('로그인이 필요합니다');
      navigate('/login');
      return;
    }

    setChecking(true);
    try {
      // Find room by QR data (the URL itself is the qr_code_data)
      const qrUrl = `${window.location.origin}/qr/${roomId}`;
      const { data: room } = await supabase
        .from('rooms')
        .select('id')
        .eq('qr_code_data', qrUrl)
        .single();

      if (!room) {
        toast.error('교실을 찾을 수 없습니다');
        return;
      }

      await checkInTeacherToRoom(room.id, teacher.id);
      setCheckedIn(true);
      toast.success('체크인 완료!');
    } catch {
      toast.error('체크인 실패');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (session && teacher && !checkedIn) {
      handleCheckIn();
    }
  }, [session, teacher]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-sm w-full text-center">
        <img src="/eeum-logo.png" alt="이음교회" className="h-12 mx-auto mb-3 object-contain" />
        <h1 className="text-2xl font-bold text-indigo-600 mb-2">이음 AWANA 체크인</h1>

        {!session ? (
          <>
            <p className="text-gray-500 mb-6">교사 로그인 또는 클럽원 회원가입을 해주세요.</p>
            <Button onClick={() => navigate(`/login?redirect=/qr/${roomId}`)} className="w-full">
              로그인
            </Button>
            <p className="text-xs text-gray-400 my-3">또는</p>
            <Button onClick={() => navigate(`/signup?roomId=${roomId}`)} variant="outline" className="w-full">
              클럽원 회원가입
            </Button>
          </>
        ) : checkedIn ? (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <p className="text-green-700 font-medium mb-4">체크인 완료!</p>
            <Button onClick={() => navigate('/teacher/scoring')} className="w-full">
              점수 입력으로 이동
            </Button>
          </>
        ) : (
          <>
            <p className="text-gray-500 mb-4">체크인 중...</p>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto" />
          </>
        )}
      </div>
    </div>
  );
}
