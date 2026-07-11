import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { CopyTextButton } from '@/components/autark-os/CopyTextButton';
import { cn } from '@/lib/utils';

export type CopyFieldModel = {
  emptyLabel?: string;
  label: string;
  sensitive?: boolean;
  value: string | null | undefined;
};

type CopyFieldProps = {
  action?: ReactNode;
  className?: string;
  icon?: LucideIcon;
  model: CopyFieldModel;
};

/** A readable, selectable value with a consistent accessible copy control. */
export function CopyField({ action, className, icon: Icon, model }: CopyFieldProps) {
  const value = model.value || '';
  const displayValue = model.sensitive ? '••••••••••••' : value || model.emptyLabel || 'Not available';

  return (
    <div className={cn('grid gap-2 rounded-lg bg-slate-900 p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-sky-100/60">
          {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
          {model.label}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {value && <CopyTextButton label={model.label} value={value} />}
          {action}
        </div>
      </div>
      <p className="select-text break-all font-mono text-xs text-white">{displayValue}</p>
    </div>
  );
}
