import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

export interface ProcessButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function ProcessButton({
  label,
  onClick,
  disabled = false,
  loading = false,
  className,
}: ProcessButtonProps) {
  return (
    <Button
      type="button"
      size="lg"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn('w-full', className)}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Working…</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </Button>
  );
}

export default ProcessButton;
