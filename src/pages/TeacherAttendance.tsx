import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

interface Teacher {
  id: string;
  name: string;
  club_id: string;
}

interface Attendance {
  id: string;
  teacher_id: string;
  training_date: string;
  present: boolean;
  note: string;
}

const TeacherAttendance = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeachers = async () => {
      try {
        const { data, error } = await supabase
          .from('teachers')
          .select('*')
          .eq('active', true);

        if (error) throw error;
        setTeachers(data || []);

        // Fetch attendance for selected date
        const { data: attendanceData } = await supabase
          .from('teacher_attendance')
          .select('*')
          .eq('training_date', selectedDate);

        const attendanceMap: Record<string, boolean> = {};
        const notesMap: Record<string, string> = {};
        
        attendanceData?.forEach((record: Attendance) => {
          attendanceMap[record.teacher_id] = record.present;
          notesMap[record.teacher_id] = record.note;
        });

        setAttendance(attendanceMap);
        setNotes(notesMap);
      } catch (error) {
        console.error('Error fetching teachers:', error);
        toast.error('교사 목록을 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchTeachers();
  }, [selectedDate]);

  const handleAttendanceChange = async (teacherId: string, present: boolean) => {
    try {
      const { error } = await supabase
        .from('teacher_attendance')
        .upsert({
          teacher_id: teacherId,
          training_date: selectedDate,
          present,
          note: notes[teacherId] || ''
        });

      if (error) throw error;

      setAttendance(prev => ({
        ...prev,
        [teacherId]: present
      }));

      toast.success('출석이 기록되었습니다.');
    } catch (error) {
      console.error('Error updating attendance:', error);
      toast.error('출석 기록에 실패했습니다.');
    }
  };

  const handleNoteChange = async (teacherId: string, note: string) => {
    setNotes(prev => ({
      ...prev,
      [teacherId]: note
    }));
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-bold mb-8">교사 출석부</h1>

      <div className="mb-6">
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
            {teachers.map((teacher) => (
              <tr key={teacher.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {teacher.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={attendance[teacher.id] || false}
                      onChange={(e) => handleAttendanceChange(teacher.id, e.target.checked)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="text"
                    value={notes[teacher.id] || ''}
                    onChange={(e) => handleNoteChange(teacher.id, e.target.value)}
                    onBlur={() => handleAttendanceChange(teacher.id, attendance[teacher.id] || false)}
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

export default TeacherAttendance;