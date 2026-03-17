import { cn } from '../../lib/utils';

interface ScoreChipProps {
  label: string;
  points: number;
  active: boolean;
  multiplier?: number;
  onClick: () => void;
  className?: string;
}

export function ScoreChip({ label, points, active, multiplier, onClick, className }: ScoreChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center rounded-lg px-3 py-2 min-w-[60px] transition-all',
        'active:scale-95 select-none touch-manipulation',
        active
          ? 'bg-green-100 text-green-800 border-2 border-green-400'
          : 'bg-gray-100 text-gray-500 border-2 border-transparent',
        className
      )}
    >
      <span className="text-[10px] font-medium leading-tight">{label}</span>
      <span className="text-base font-bold leading-tight">{points}</span>
      {multiplier !== undefined && multiplier > 1 && (
        <span className="text-[10px] font-medium text-indigo-600">x{multiplier}</span>
      )}
    </button>
  );
}
