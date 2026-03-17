import { cn } from '../../lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
}

export function Switch({ checked, onChange, disabled = false, size = 'md', className, label }: SwitchProps) {
  const trackSizes = {
    sm: 'w-8 h-[18px]',
    md: 'w-10 h-[22px]',
  };

  const thumbSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-[18px] h-[18px]',
  };

  const translateX = {
    sm: 'translate-x-[14px]',
    md: 'translate-x-[18px]',
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
        trackSizes[size],
        checked ? 'bg-green-500' : 'bg-gray-300',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out',
          thumbSizes[size],
          checked ? translateX[size] : 'translate-x-0.5',
          // 수직 중앙 정렬
          'mt-[2px]'
        )}
      />
    </button>
  );
}
