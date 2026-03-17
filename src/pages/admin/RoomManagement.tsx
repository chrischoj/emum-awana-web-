import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { QRCodeCard } from '../../components/QRCodeCard';
import { Badge } from '../../components/ui/Badge';
import { Switch } from '../../components/ui/Switch';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import type { Room, Team } from '../../types/awana';

export default function RoomManagement() {
  const { clubs } = useClub();
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterClubId, setFilterClubId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomClubId, setNewRoomClubId] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [generatingQR, setGeneratingQR] = useState(false);

  const loadRooms = async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('name');
    if (error) toast.error('교실 로드 실패');
    setAllRooms((data as Room[]) || []);
    setLoading(false);
  };

  const loadTeams = async () => {
    const { data } = await supabase.from('teams').select('*');
    setAllTeams((data as Team[]) || []);
  };

  useEffect(() => {
    loadRooms();
    loadTeams();
  }, []);

  // 클럽 목록이 로드되면 새 교실 생성 시 기본 클럽 설정
  useEffect(() => {
    if (clubs.length > 0 && !newRoomClubId) {
      setNewRoomClubId(clubs[0].id);
    }
  }, [clubs]);

  const teamMap = new Map(allTeams.map((t) => [t.id, t]));

  const filteredRooms = filterClubId
    ? allRooms.filter((r) => r.club_id === filterClubId)
    : allRooms;

  const handleCreate = async () => {
    if (!newRoomClubId || !newRoomName.trim() || !selectedTeamId) return;
    setCreating(true);
    try {
      const { data: inserted, error } = await supabase
        .from('rooms')
        .insert({
          club_id: newRoomClubId,
          name: newRoomName.trim(),
          team_id: selectedTeamId || null,
          qr_code_data: null,
        })
        .select()
        .single();
      if (error) throw error;
      // 생성 직후 room.id 기반으로 QR 데이터 설정
      const qrData = `${window.location.origin}/qr/${(inserted as Room).id}`;
      await supabase
        .from('rooms')
        .update({ qr_code_data: qrData })
        .eq('id', (inserted as Room).id);
      toast.success('교실 생성 완료');
      setShowCreate(false);
      setNewRoomName('');
      setSelectedTeamId('');
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

  const handleGenerateQR = async (room: Room) => {
    setGeneratingQR(true);
    try {
      const qrData = `${window.location.origin}/qr/${room.id}`;
      const { error } = await supabase
        .from('rooms')
        .update({ qr_code_data: qrData })
        .eq('id', room.id);
      if (error) throw error;
      toast.success('QR 코드 생성 완료');
      await loadRooms();
      setSelectedRoom({ ...room, qr_code_data: qrData });
    } catch {
      toast.error('QR 코드 생성 실패');
    } finally {
      setGeneratingQR(false);
    }
  };

  const openCreateModal = () => {
    if (clubs.length > 0) setNewRoomClubId(clubs[0].id);
    setNewRoomName('');
    setSelectedTeamId('');
    setShowCreate(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // 클럽별 섹션 렌더 (모두 보기일 때)
  const renderAllSections = () => {
    if (clubs.length === 0) {
      return (
        <p className="text-gray-500 text-center py-10">등록된 클럽이 없습니다.</p>
      );
    }
    return clubs.map((club) => {
      const clubRooms = allRooms.filter((r) => r.club_id === club.id);
      return (
        <div key={club.id} className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-base font-semibold text-gray-700">{club.name}</h2>
            <span className="text-xs text-gray-400">({clubRooms.length}개 교실)</span>
            <div className="flex-1 h-px bg-gray-200 ml-1" />
          </div>
          {clubRooms.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 pl-2">이 클럽에 등록된 교실이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clubRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  teamMap={teamMap}
                  showClubBadge={false}
                  clubName={club.name}
                  onQR={() => setSelectedRoom(room)}
                  onToggle={() => handleToggleActive(room)}
                />
              ))}
            </div>
          )}
        </div>
      );
    });
  };

  // 클럽 필터 선택 시 단순 그리드
  const renderFilteredGrid = () => {
    const selectedClub = clubs.find((c) => c.id === filterClubId);
    return (
      <div>
        {filteredRooms.length === 0 ? (
          <p className="text-gray-500 text-center py-10">
            등록된 교실이 없습니다. "교실 추가" 버튼으로 시작하세요.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                teamMap={teamMap}
                showClubBadge={false}
                clubName={selectedClub?.name ?? ''}
                onQR={() => setSelectedRoom(room)}
                onToggle={() => handleToggleActive(room)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">교실 관리</h1>
        <Button onClick={openCreateModal}>교실 추가</Button>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilterClubId(null)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filterClubId === null
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          모두
        </button>
        {clubs.map((club) => (
          <button
            key={club.id}
            onClick={() => setFilterClubId(club.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterClubId === club.id
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {club.name}
          </button>
        ))}
      </div>

      {/* 교실 목록 */}
      {filterClubId === null ? renderAllSections() : renderFilteredGrid()}

      {/* 교실 추가 모달 */}
      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          setSelectedTeamId('');
        }}
        title="교실 추가"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">클럽 선택</label>
            <select
              value={newRoomClubId}
              onChange={(e) => { setNewRoomClubId(e.target.value); setSelectedTeamId(''); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">교실 이름</label>
            <input
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="교실 이름 (예: RED 룸)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">배정 팀</label>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">팀 선택 (필수)</option>
              {allTeams.filter(t => t.club_id === newRoomClubId).map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreate(false);
                setSelectedTeamId('');
              }}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              onClick={handleCreate}
              isLoading={creating}
              className="flex-1"
              disabled={!newRoomName.trim() || !newRoomClubId || !selectedTeamId}
            >
              생성
            </Button>
          </div>
        </div>
      </Modal>

      {/* QR 코드 모달 */}
      <Modal
        open={!!selectedRoom}
        onClose={() => setSelectedRoom(null)}
        title={selectedRoom?.name ?? ''}
        className="max-w-lg"
      >
        {selectedRoom?.qr_code_data ? (
          <QRCodeCard
            value={selectedRoom.qr_code_data}
            title={selectedRoom.name}
            size={250}
          />
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">이 교실에 QR 코드가 아직 생성되지 않았습니다.</p>
            <Button
              onClick={() => selectedRoom && handleGenerateQR(selectedRoom)}
              isLoading={generatingQR}
            >
              QR 코드 생성
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---- 교실 카드 컴포넌트 ----

interface RoomCardProps {
  room: Room;
  teamMap: Map<string, Team>;
  showClubBadge: boolean;
  clubName: string;
  onQR: () => void;
  onToggle: () => void;
}

function RoomCard({ room, teamMap, onQR, onToggle }: RoomCardProps) {
  const team = room.team_id ? teamMap.get(room.team_id) : null;
  const teamColor = team?.color || '#6B7280';

  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-all duration-200 ${
      room.active
        ? 'border-gray-200 shadow-sm'
        : 'border-gray-100 opacity-50 grayscale hover:opacity-70 hover:grayscale-0'
    }`}>
      {/* 팀 색상 상단 바 */}
      <div className="h-1.5" style={{ backgroundColor: teamColor }} />
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: teamColor }}
            />
            <div>
              <h3 className="font-semibold text-gray-900">{room.name}</h3>
              {team && (
                <p className="text-xs mt-0.5" style={{ color: teamColor }}>
                  {team.name} 팀
                </p>
              )}
              {!team && (
                <p className="text-xs text-gray-400 mt-0.5">팀 미지정</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={room.active ? 'success' : 'absent'}>
              {room.active ? '활성' : '비활성'}
            </Badge>
            <Switch
              checked={room.active}
              onChange={() => onToggle()}
              size="sm"
              label={room.active ? '비활성화' : '활성화'}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onQR}
            className="flex-1 py-2 bg-indigo-50 text-indigo-700 text-sm rounded-lg font-medium hover:bg-indigo-100 transition-colors"
          >
            QR 코드
          </button>
        </div>
      </div>
    </div>
  );
}
