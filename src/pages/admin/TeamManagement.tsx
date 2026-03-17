import { useClub } from '../../contexts/ClubContext';

export default function TeamManagement() {
  const { teams, members } = useClub();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">팀 관리</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {teams.map((team) => {
          const teamMembers = members.filter((m) => m.team_id === team.id);
          return (
            <div key={team.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: team.color }} />
                <h3 className="font-bold text-lg">{team.name}</h3>
              </div>
              <p className="text-sm text-gray-500">{teamMembers.length}명</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
