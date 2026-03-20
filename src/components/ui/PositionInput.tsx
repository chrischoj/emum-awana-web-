import { POSITION_PRESETS } from '../../constants/positions';

interface PositionInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function PositionInput({ value, onChange, disabled, className }: PositionInputProps) {
  return (
    <div className={className}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        placeholder="직책을 입력하거나 아래에서 선택"
      />
      <div className="flex flex-wrap gap-1.5 mt-2">
        {POSITION_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            disabled={disabled}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              value === preset
                ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}
