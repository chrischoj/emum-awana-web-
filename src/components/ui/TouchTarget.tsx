import { type HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface TouchTargetProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function TouchTarget({ className, children, ...props }: TouchTargetProps) {
  return (
    <div
      className={cn('min-h-[44px] min-w-[44px] flex items-center justify-center', className)}
      {...props}
    >
      {children}
    </div>
  );
}
