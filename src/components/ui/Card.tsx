import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  footer?: ReactNode;
}

export function Card({ className, header, footer, children, ...props }: CardProps) {
  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 shadow-sm', className)} {...props}>
      {header && (
        <div className="px-4 py-3 border-b border-gray-100 font-medium text-gray-900">
          {header}
        </div>
      )}
      <div className="p-4">{children}</div>
      {footer && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          {footer}
        </div>
      )}
    </div>
  );
}
