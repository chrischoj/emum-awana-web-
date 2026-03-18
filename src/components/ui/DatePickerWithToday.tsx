import { getToday, cn } from '../../lib/utils';

interface DatePickerWithTodayProps {
  value: string;
  onChange: (date: string) => void;
  className?: string;
}

export function DatePickerWithToday({ value, onChange, className }: DatePickerWithTodayProps) {
  const today = getToday();
  const isToday = value === today;

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('text-sm border border-gray-300 rounded-lg px-3 py-2', className)}
      />
      <button
        type="button"
        onClick={() => onChange(today)}
        className={cn(
          'text-xs font-medium px-2.5 py-1.5 rounded-full transition-all duration-200 whitespace-nowrap',
          'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 active:scale-95',
          isToday ? 'opacity-0 pointer-events-none scale-90' : 'opacity-100 scale-100'
        )}
      >
        오늘
      </button>
    </div>
  );
}
