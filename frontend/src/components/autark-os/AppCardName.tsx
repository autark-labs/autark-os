import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { showActionNotification } from '@/lib/actionNotifications';
import { copyText } from '@/lib/copyText';
import { cn } from '@/lib/utils';

type AppCardNameProps = {
  className?: string;
  name: string;
  onSelect?: () => void;
  selectAriaLabel?: string;
};

/** A compact app title that reveals clipped names and supports quick copying. */
export function AppCardName({ className, name, onSelect, selectAriaLabel }: AppCardNameProps) {
  const nameRef = useRef<HTMLElement | null>(null);
  const resetCopiedTimerRef = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [isNameHovered, setIsNameHovered] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => () => {
    if (resetCopiedTimerRef.current) {
      window.clearTimeout(resetCopiedTimerRef.current);
    }
  }, []);

  function updateOverflow() {
    const element = nameRef.current;
    setIsOverflowing(Boolean(element && element.scrollWidth > element.clientWidth));
  }

  function setNameRef(element: HTMLElement | null) {
    nameRef.current = element;
  }

  async function copyName(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const result = await copyText(name);
    if (!result.ok) {
      showActionNotification({ ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, 'Copy unavailable');
      return;
    }

    setCopied(true);
    showActionNotification({ ok: true, severity: 'success', title: 'App name copied', message: name }, 'App name copied');
    if (resetCopiedTimerRef.current) {
      window.clearTimeout(resetCopiedTimerRef.current);
    }
    resetCopiedTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <TooltipProvider>
      <div className="group/app-name pointer-events-auto relative min-w-0">
        <Tooltip open={isNameHovered && isOverflowing}>
          <TooltipTrigger asChild>
            {onSelect ? (
              <button
                aria-label={selectAriaLabel || `Manage ${name}`}
                className={cn('block w-full truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80', className)}
                onBlur={() => setIsNameHovered(false)}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect();
                }}
                onFocus={() => {
                  updateOverflow();
                  setIsNameHovered(true);
                }}
                onMouseEnter={() => {
                  updateOverflow();
                  setIsNameHovered(true);
                }}
                onMouseLeave={() => setIsNameHovered(false)}
                ref={setNameRef}
                type="button"
              >
                {name}
              </button>
            ) : (
              <span
                className={cn('block truncate', className)}
                onMouseEnter={() => {
                  updateOverflow();
                  setIsNameHovered(true);
                }}
                onMouseLeave={() => setIsNameHovered(false)}
                ref={setNameRef}
              >
                {name}
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent className="max-w-sm border-sky-100/30 bg-slate-950 px-3 py-2 text-slate-50 shadow-xl shadow-slate-950/35" side="bottom" sideOffset={8}>
            <span className="break-words">{name}</span>
          </TooltipContent>
        </Tooltip>
        <button
          aria-label={`Copy ${name}`}
          className={cn(
            'absolute right-0 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded bg-slate-950/45 text-slate-100 opacity-0 transition-all duration-150 ease-out',
            'hover:bg-slate-950/70 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80',
            'group-hover/app-card:opacity-100 group-hover/app-name:opacity-100',
            copied && 'opacity-100',
          )}
          data-copied={copied || undefined}
          onClick={(event) => void copyName(event)}
          type="button"
        >
          {copied ? <Check aria-hidden="true" className="size-3" /> : <Copy aria-hidden="true" className="size-3" />}
        </button>
      </div>
    </TooltipProvider>
  );
}
