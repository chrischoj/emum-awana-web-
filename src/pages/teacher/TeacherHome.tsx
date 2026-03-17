import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';

export default function TeacherHome() {
  const { teacher } = useAuth();
  const { currentClub, members, teams } = useClub();

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">
        안녕하세요, {teacher?.name}님
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {currentClub?.name ?? '클럽 미선택'} · {new Date().toLocaleDateString('ko-KR')}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">클럽원</p>
          <p className="text-2xl font-bold text-gray-900">{members.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">팀 수</p>
          <p className="text-2xl font-bold text-gray-900">{teams.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">오늘의 할 일</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <span className="text-amber-600 font-medium text-sm">출석 입력</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <span className="text-blue-600 font-medium text-sm">점수 입력</span>
          </div>
        </div>
      </div>
    </div>
  );
}
