import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { QRCodeCard } from '../../components/QRCodeCard';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import type { Room } from '../../types/awana';

export default function RoomManagement() {
  const { currentClub } = useClub();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);

  const loadRooms = async () => {
    if (!currentClub) return;
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('club_id', currentClub.id)
      .order('name');
    if (error) toast.error('교실 로드 실패');
    setRooms((data as Room[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadRooms();
  }, [currentClub]);

  const handleCreate = async () => {
    if (!currentClub || !newRoomName.trim()) return;
    setCreating(true);
    try {
      const qrData = `${window.location.origin}/qr/${crypto.randomUUID()}`;
      const { error } = await supabase.from('rooms').insert({
        club_id: currentClub.id,
        name: newRoomName.trim(),
        qr_code_data: qrData,
      });
      if (error) throw error;
      toast.success('교실 생성 완료');
      setShowCreate(false);
      setNewRoomName('');
      await loadRooms();
    } catch {
      toast.error('교실 생성 실패');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (room: Room) => {
    const { error } = await supabase
      .from('rooms')
      .update({ active: !room.active })
      .eq('id', room.id);
    if (error) toast.error('상태 변경 실패');
    else await loadRooms();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">교실 관리</h1>
        <Button onClick={() => setShowCreate(true)}>교실 추가</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map((room) => (
          <div
            key={room.id}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">{room.name}</h3>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  room.active
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {room.active ? '활성' : '비활성'}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedRoom(room)}
                className="flex-1 py-2 bg-indigo-50 text-indigo-700 text-sm rounded-lg font-medium hover:bg-indigo-100"
              >
                QR 코드
              </button>
              <button
                onClick={() => handleToggleActive(room)}
                className="flex-1 py-2 bg-gray-50 text-gray-700 text-sm rounded-lg font-medium hover:bg-gray-100"
              >
                {room.active ? '비활성화' : '활성화'}
              </button>
            </div>
          </div>
        ))}
        {rooms.length === 0 && (
          <p className="text-gray-500 col-span-full text-center py-10">
            등록된 교실이 없습니다. "교실 추가" 버튼으로 시작하세요.
          </p>
        )}
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="교실 추가">
        <input
          type="text"
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          placeholder="교실 이름 (예: Sparks A반)"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
          autoFocus
        />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">
            취소
          </Button>
          <Button onClick={handleCreate} isLoading={creating} className="flex-1">
            생성
          </Button>
        </div>
      </Modal>

      {/* QR modal */}
      <Modal
        open={!!selectedRoom}
        onClose={() => setSelectedRoom(null)}
        title={selectedRoom?.name ?? ''}
        className="max-w-lg"
      >
        {selectedRoom?.qr_code_data && (
          <QRCodeCard
            value={selectedRoom.qr_code_data}
            title={selectedRoom.name}
            size={250}
          />
        )}
      </Modal>
    </div>
  );
}
