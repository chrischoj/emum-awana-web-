import { useState } from 'react';
import { useClub } from '../../contexts/ClubContext';

export default function ScoringOverview() {
  const { clubs, currentClub, setCurrentClub, teams } = useClub();
  const [selectedDate] = useState(new Date().toISOString().split('T')[0]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">점수 총괄</h1>
        <div className="flex gap-2">
          {clubs.map((club) => (
            <button
              key={club.id}
              onClick={() => setCurrentClub(club)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                currentClub?.id === club.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {club.name}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-gray-500">날짜: {selectedDate}</p>
        <div className="mt-4 grid grid-cols-4 gap-4">
          {teams.map((team) => (
            <div key={team.id} className="text-center p-4 rounded-lg" style={{ backgroundColor: team.color + '20' }}>
              <p className="font-bold" style={{ color: team.color }}>{team.name}</p>
              <p className="text-2xl font-bold mt-2">0</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
