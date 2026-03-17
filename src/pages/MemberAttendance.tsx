import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? '',
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
);

interface Member {
  id: string;
  name: string;
  club_id: string;
}

interface Attendance {
  id: string;
  member_id: string;
  training_date: string;
  present: boolean;
  note: string;
}

const MemberAttendance = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedClub, setSelectedClub] = useState<string>('all');

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        let query = supabase
          .from('members')
          .select('*')
          .eq('active', true);

        if (selectedClub !== 'all') {
          query = query.eq('club_id', selectedClub);
        }

        const { data, error } = await query;

        if (error) throw error;
        setMembers(data || []);

        // Fetch attendance for selected date
        const { data: attendanceData } = await supabase
          .from('member_attendance')
          .select('*')
          .eq('training_date', selectedDate);

        const attendanceMap: Record<string, boolean> = {};
        const notesMap: Record<string, string> = {};
        
        attendanceData?.forEach((record: Attendance) => {
          attendanceMap[record.member_id] = record.present;
          notesMap[record.member_id] = record.note;
        });

        setAttendance(attendanceMap);
        setNotes(notesMap);
      } catch (error) {
        console.error('Error fetching members:', error);
        toast.error('클럽원 목록을 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, [selectedDate, selectedClub]);

  const handleAttendanceChange = async (memberId: string, present: boolean) => {
    try {
      const { error } = await supabase
        .from('member_attendance')
        .upsert({
          member_id: memberId,
          training_date: selectedDate,
          present,
          note: notes[memberId] || ''
        });

      if (error) throw error;

      setAttendance(prev => ({
        ...prev,
        [memberId]: present
      }));

      // Calculate and update dalant points
      if (present) {
        await supabase.from('dalant_transactions').insert({
          member_id: memberId,
          amount: 1000, // Base attendance points
          description: '출석 포인트',
          transaction_date: selectedDate
        });
      }

      toast.success('출석이 기록되었습니다.');
    } catch (error) {
      console.error('Error updating attendance:', error);
      toast.error('출석 기록에 실패했습니다.');
    }
  };

  const handleNoteChange = async (memberId: string, note: string) => {
    setNotes(prev => ({
      ...prev,
      [memberId]: note
    }));
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-bold mb-8">클럽원 출석부</h1>

      <div className="flex space-x-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            날짜 선택
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            클럽 선택
          </label>
          <select
            value={selectedClub}
            onChange={(e) => setSelectedClub(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="all">전체</option>
            <option value="sparks">스팍스</option>
            <option value="tnt">티앤티</option>
          </select>
        </div>
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                이름
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                출석
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                비고
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {members.map((member) => (
              <tr key={member.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {member.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={attendance[member.id] || false}
                      onChange={(e) => handleAttendanceChange(member.id, e.target.checked)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="text"
                    value={notes[member.id] || ''}
                    onChange={(e) => handleNoteChange(member.id, e.target.value)}
                    onBlur={() => handleAttendanceChange(member.id, attendance[member.id] || false)}
                    className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 w-full"
                    placeholder="비고"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MemberAttendance;