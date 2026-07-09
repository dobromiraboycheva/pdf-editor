import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Progress value, 0-100. */
  value: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ value, className, ...props }, ref) => {
    const clamped = Math.max(0, Math.min(100, value));
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          'relative h-2 w-full overflow-hidden rounded-full bg-brand-100',
          className,
        )}
        {...props}
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-200 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    );
  },
);
Progress.displayName = 'Progress';

export { Progress };
