import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { getToday } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { useClub } from '../../contexts/ClubContext';
import type { Teacher, TeacherAttendanceRecord } from '../../types/awana';

export default function TeacherAttendancePage() {
  const { clubs } = useClub();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filterClubId, setFilterClubId] = useState<string | null>(null);
  const [showUnassigned, setShowUnassigned] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data: teacherData } = await supabase.from('teachers').select('*').eq('active', true).order('name');
        setTeachers((teacherData as Teacher[]) || []);

        const { data: attData } = await supabase.from('teacher_attendance').select('*').eq('training_date', selectedDate);
        const attMap: Record<string, boolean> = {};
        const noteMap: Record<string, string> = {};
        for (const rec of (attData as TeacherAttendanceRecord[]) || []) {
          attMap[rec.teacher_id] = rec.present;
          noteMap[rec.teacher_id] = rec.note || '';
        }
        setAttendance(attMap);
        setNotes(noteMap);
      } catch { toast.error('데이터 로드 실패'); }
      finally { setLoading(false); }
    }
    load();
  }, [selectedDate]);

  const handleToggle = async (teacherId: string) => {
    const newPresent = !attendance[teacherId];
    setAttendance((prev) => ({ ...prev, [teacherId]: newPresent }));
    const { error } = await supabase.from('teacher_attendance').upsert(
      { teacher_id: teacherId, training_date: selectedDate, present: newPresent, note: notes[teacherId] || '' },
      { onConflict: 'teacher_id,training_date' }
    );
    if (error) toast.error('저장 실패');
  };

  const handleNote = (teacherId: string, note: string) => {
    setNotes((prev) => ({ ...prev, [teacherId]: note }));
  };

  const handleNoteBlur = async (teacherId: string) => {
    await supabase.from('teacher_attendance').upsert(
      { teacher_id: teacherId, training_date: selectedDate, present: attendance[teacherId] ?? false, note: notes[teacherId] || '' },
      { onConflict: 'teacher_id,training_date' }
    );
  };

  const filteredTeachers = teachers.filter((t) => {
    if (showUnassigned) return !t.club_id;
    if (filterClubId) return t.club_id === filterClubId;
    return true;
  });

  const presentCount = filteredTeachers.filter((t) => attendance[t.id]).length;

  const clubMap = new Map(clubs.map((c) => [c.id, c.name]));

  const isAllActive = !filterClubId && !showUnassigned;

  const activeClass = 'px-3 py-1.5 rounded-full text-sm font-medium bg-indigo-600 text-white';
  const inactiveClass = 'px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200';

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">교사 출석부</h1>
          <p className="text-sm text-gray-500 mt-1">출석: {presentCount}/{filteredTeachers.length}</p>
        </div>
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => { setFilterClubId(null); setShowUnassigned(false); }}
          className={isAllActive ? activeClass : inactiveClass}
        >
          모두
        </button>
        {clubs.map((club) => (
          <button
            key={club.id}
            onClick={() => { setFilterClubId(club.id); setShowUnassigned(false); }}
            className={filterClubId === club.id ? activeClass : inactiveClass}
          >
            {club.name}
          </button>
        ))}
        <button
          onClick={() => { setFilterClubId(null); setShowUnassigned(true); }}
          className={showUnassigned ? activeClass : inactiveClass}
        >
          그 외
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">직책</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-20">출석</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">비고</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredTeachers.map((teacher) => (
              <tr key={teacher.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={teacher.name} src={teacher.avatar_url} size="sm" />
                    <div>
                      <span className="text-sm font-medium text-gray-900">{teacher.name}</span>
                      {isAllActive && (
                        <p className="text-xs text-gray-400">
                          {teacher.club_id ? clubMap.get(teacher.club_id) ?? '알 수 없음' : '미배정'}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600">
                    {teacher.position ?? '-'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => handleToggle(teacher.id)} className={`w-8 h-8 rounded-full text-sm font-bold ${attendance[teacher.id] ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {attendance[teacher.id] ? '✓' : '✗'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <input type="text" value={notes[teacher.id] || ''} onChange={(e) => handleNote(teacher.id, e.target.value)} onBlur={() => handleNoteBlur(teacher.id)} placeholder="비고" className="w-full text-sm border-0 border-b border-transparent focus:border-gray-300 focus:ring-0 py-1" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
