import { AlertTriangle, CheckCircle2, ChevronRight, Copy, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, ProjectPanel } from '@/components/primitives/Surface';
import { semanticStatusVariants, type SemanticStatusTone } from '@/components/primitives/SemanticVariants';
import { cn } from '@/lib/utils';
import type { SupportFinding, SupportLogLine, SupportRedactionRule } from '@/types/system';
import { humanize } from './SupportPage.logic';

export const SupportPanel = ProjectPanel;
export const SupportInset = ProjectInset;

export function SignalCard({ detail, icon: Icon, label, tone, value }: { detail: string; icon: LucideIcon; label: string; tone: 'green' | 'orange' | 'red' | 'slate' | 'cyan' | 'sky'; value: string }) {
  return (
    <div className={cn('rounded-lg p-4', semanticStatusVariants({ tone: supportTone(tone) }))}>
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
    <SupportInset className="grid gap-1">
      <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
      <span className="break-words text-slate-200">{value}</span>
    </SupportInset>
  );
}

export function BasicSupportCard({ detail, label, tone, value }: { detail: string; label: string; tone: 'green' | 'orange' | 'red'; value: string }) {
  return (
    <div className={cn('rounded-lg p-4', semanticStatusVariants({ tone: supportTone(tone) }))}>
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
            <MetadataBadge>{finding.area}</MetadataBadge>
            <MetadataBadge>{humanize(finding.severity)}</MetadataBadge>
          </div>
          <p className="mt-3 font-bold text-white">{finding.title}</p>
          <p className="mt-1 text-sm leading-5 text-current/75">{finding.message}</p>
        </div>
        <ProjectDarkControlButton asChild className="shrink-0 border-current/25 text-current" size="sm">
          <Link to={finding.route || '/monitoring'}>
            {finding.actionLabel || 'Open page'}
            <ChevronRight className="size-4" />
          </Link>
        </ProjectDarkControlButton>
      </div>
    </div>
  );
}

export function RedactionRuleCard({ rule }: { rule: SupportRedactionRule }) {
  return (
    <SupportInset>
      <p className="font-bold text-white">{rule.label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{rule.description}</p>
    </SupportInset>
  );
}

export function SectionHeader({ compact = false, description, icon: Icon, title }: { compact?: boolean; description: string; icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn('grid place-items-center rounded-lg border border-sky-400/25 bg-slate-800 text-cyan-200', compact ? 'size-9' : 'size-10')}>
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
      <span className={cn('text-[11px] font-bold uppercase', line.level === 'error' ? 'text-red-300' : line.level === 'warning' ? 'text-orange-200' : 'text-slate-500')}>{line.level}</span>
      <span className="break-words text-slate-300">{line.line}</span>
    </div>
  );
}

export function CommandCard({ command, copied, description, id, label, onCopy }: { command: string; copied: string | null; description: string; id: string; label: string; onCopy: (value: string, id: string) => void }) {
  return (
    <SupportInset>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-white">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <ProjectDarkControlButton className="size-8 shrink-0 p-0" onClick={() => onCopy(command, id)} size="icon" type="button">
          <Copy className="size-4" />
        </ProjectDarkControlButton>
      </div>
      <code className="mt-3 block overflow-x-auto rounded-md bg-black/45 px-3 py-2 text-xs text-slate-300">{copied === id ? 'Copied' : command}</code>
    </SupportInset>
  );
}

export function RelatedLink({ detail, title, to }: { detail: string; title: string; to: string }) {
  return (
    <Link className="rounded-lg border border-sky-400/25 bg-slate-800 p-3 text-sm no-underline transition hover:border-cyan-300/45 hover:bg-slate-700" to={to}>
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

export function statusTone(status?: string): 'green' | 'orange' | 'red' | 'slate' | 'cyan' {
  if (status === 'ready') return 'green';
  if (status === 'needs_admin_setup') return 'orange';
  if (!status) return 'slate';
  return 'cyan';
}

function findingTone(severity: string) {
  if (severity === 'error') {
    return semanticStatusVariants({ tone: 'danger' });
  }
  if (severity === 'warning') {
    return semanticStatusVariants({ tone: 'warning' });
  }
  return semanticStatusVariants({ tone: 'info' });
}

function supportTone(tone: 'green' | 'orange' | 'red' | 'slate' | 'cyan' | 'sky'): SemanticStatusTone {
  if (tone === 'green') return 'success';
  if (tone === 'orange') return 'warning';
  if (tone === 'red') return 'danger';
  if (tone === 'slate') return 'muted';
  return 'info';
}
