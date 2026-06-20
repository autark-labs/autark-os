import { AlertTriangle, CheckCircle2, ChevronRight, Copy, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SupportFinding, SupportLogLine, SupportRedactionRule } from '@/types/system';
import { humanize } from './SupportPage.logic';

export function SignalCard({ detail, icon: Icon, label, tone, value }: { detail: string; icon: LucideIcon; label: string; tone: 'green' | 'amber' | 'red' | 'slate' | 'violet' | 'sky'; value: string }) {
  const tones = {
    green: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200',
    amber: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
    red: 'border-red-300/20 bg-red-500/10 text-red-100',
    slate: 'border-slate-700/60 bg-slate-900/55 text-slate-300',
    violet: 'border-violet-300/20 bg-violet-500/10 text-violet-100',
    sky: 'border-sky-300/20 bg-sky-500/10 text-sky-100',
  };
  return (
    <div className={cn('rounded-lg border p-4', tones[tone])}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-current/70">{label}</p>
        <Icon className="size-4" />
      </div>
      <p className="mt-3 line-clamp-2 text-xl font-black text-white">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-current/75">{detail}</p>
    </div>
  );
}

export function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-lg border border-slate-700/40 bg-slate-900/45 p-3">
      <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
      <span className="break-words text-slate-200">{value}</span>
    </div>
  );
}

export function BasicSupportCard({ detail, label, tone, value }: { detail: string; label: string; tone: 'green' | 'amber' | 'red'; value: string }) {
  const tones = {
    green: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
    amber: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
    red: 'border-red-300/20 bg-red-500/10 text-red-100',
  };
  return (
    <div className={cn('rounded-lg border p-4', tones[tone])}>
      <p className="text-xs font-bold uppercase text-current/70">{label}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-sm leading-5 text-current/75">{detail}</p>
    </div>
  );
}

export function FindingCard({ finding }: { finding: SupportFinding }) {
  return (
    <div className={cn('rounded-lg border p-4', findingTone(finding.severity))}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-current/20 bg-black/20 text-current" variant="outline">{finding.area}</Badge>
            <Badge className="border-current/20 bg-black/20 text-current" variant="outline">{humanize(finding.severity)}</Badge>
          </div>
          <p className="mt-3 font-bold text-white">{finding.title}</p>
          <p className="mt-1 text-sm leading-5 text-current/75">{finding.message}</p>
        </div>
        <Button asChild className="shrink-0 border-current/25 bg-slate-950/45 text-current hover:bg-slate-900" size="sm" variant="outline">
          <Link to={finding.route || '/monitoring'}>
            {finding.actionLabel || 'Open page'}
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function RedactionRuleCard({ rule }: { rule: SupportRedactionRule }) {
  return (
    <div className="rounded-lg border border-slate-700/45 bg-slate-900/45 p-3">
      <p className="font-bold text-white">{rule.label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{rule.description}</p>
    </div>
  );
}

export function SectionHeader({ compact = false, description, icon: Icon, title }: { compact?: boolean; description: string; icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn('grid place-items-center rounded-lg border border-white/10 bg-slate-900 text-sky-300', compact ? 'size-9' : 'size-10')}>
        <Icon className="size-4" />
      </span>
      <div>
        <h2 className={cn('font-black text-white', compact ? 'text-lg' : 'text-xl')}>{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
    </div>
  );
}

export function LogLine({ line }: { line: SupportLogLine }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-white/5 py-1.5 last:border-b-0">
      <span className={cn('text-[11px] font-bold uppercase', line.level === 'error' ? 'text-red-300' : line.level === 'warning' ? 'text-amber-200' : 'text-slate-500')}>{line.level}</span>
      <span className="break-words text-slate-300">{line.line}</span>
    </div>
  );
}

export function CommandCard({ command, copied, description, id, label, onCopy }: { command: string; copied: string | null; description: string; id: string; label: string; onCopy: (value: string, id: string) => void }) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-white">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <Button className="size-8 shrink-0 border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => onCopy(command, id)} size="icon" type="button" variant="outline">
          <Copy className="size-4" />
        </Button>
      </div>
      <code className="mt-3 block overflow-x-auto rounded-md bg-black/45 px-3 py-2 text-xs text-slate-300">{copied === id ? 'Copied' : command}</code>
    </div>
  );
}

export function RelatedLink({ detail, title, to }: { detail: string; title: string; to: string }) {
  return (
    <Link className="rounded-lg border border-slate-700/40 bg-slate-900/45 p-3 text-sm no-underline transition hover:border-sky-300/30 hover:bg-slate-800/60" to={to}>
      <span className="block font-bold text-white">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span>
    </Link>
  );
}

export function statusIcon(status?: string) {
  if (status === 'ready') return CheckCircle2;
  if (status === 'needs_admin_setup') return AlertTriangle;
  return ShieldCheck;
}

export function statusTone(status?: string): 'green' | 'amber' | 'red' | 'slate' | 'violet' {
  if (status === 'ready') return 'green';
  if (status === 'needs_admin_setup') return 'amber';
  if (!status) return 'slate';
  return 'violet';
}

function findingTone(severity: string) {
  if (severity === 'error') {
    return 'border-red-300/20 bg-red-500/10 text-red-100';
  }
  if (severity === 'warning') {
    return 'border-amber-300/20 bg-amber-500/10 text-amber-100';
  }
  return 'border-sky-300/20 bg-sky-500/10 text-sky-100';
}
