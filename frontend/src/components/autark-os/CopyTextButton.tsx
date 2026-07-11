import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { showActionNotification } from '@/lib/actionNotifications';
import { copyText, type CopyTextResult } from '@/lib/copyText';
import { cn } from '@/lib/utils';

type CopyTextButtonProps = {
  className?: string;
  label: string;
  onResult?: (result: CopyTextResult) => void;
  value: string;
};

/** A consistent, accessible copy control for compact app values and links. */
export function CopyTextButton({ className, label, onResult, value }: CopyTextButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const result = await copyText(value);
    onResult?.(result);
    if (result.ok) {
      setCopied(true);
      showActionNotification({ ok: true, severity: 'success', title: `${label} copied`, message: value }, `${label} copied`);
      window.setTimeout(() => setCopied(false), 1600);
      return;
    }
    showActionNotification({ ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, 'Copy unavailable');
  }

  return (
    <Button
      aria-label={`Copy ${label}`}
      className={cn('border-sky-400/30 bg-slate-800 text-sky-50 hover:bg-slate-700', className)}
      disabled={!value}
      onClick={() => void handleCopy()}
      size="icon-sm"
      type="button"
      variant="outline"
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}
