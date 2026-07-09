import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

export interface ToolShellProps {
  title: string;
  tagline: string;
  children: ReactNode;
  sidebar: ReactNode;
  onStartOver?: () => void;
  className?: string;
}

export function ToolShell({
  title,
  tagline,
  children,
  sidebar,
  onStartOver,
  className,
}: ToolShellProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('mx-auto w-full max-w-6xl px-4 py-8 sm:px-6', className)}>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
          </h1>
          <p className="mt-1 text-sm text-ink-muted sm:text-base">{tagline}</p>
        </div>
        {onStartOver && (
          <Button variant="secondary" size="sm" onClick={onStartOver}>
            <RotateCcw className="h-4 w-4" />
            {t('common.startOver')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0">{children}</main>
        <aside className="min-w-0">
          <div className="min-[900px]:sticky min-[900px]:top-24">{sidebar}</div>
        </aside>
      </div>
    </div>
  );
}

export default ToolShell;
