import { CircleAlert, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset } from '@/components/primitives/Surface';
import { semanticStatusVariants } from '@/components/primitives/SemanticVariants';
import { cn } from '@/lib/utils';
import type { SupportFinding, SupportLogLine, SupportRedactionRule } from '@/types/system';
import { useSettingsDialog } from '@/contexts/SettingsDialogContext';
import { humanize } from './SupportPage.logic';

export const SupportInset = ProjectInset;

export function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <SupportInset className="grid gap-1">
      <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
      <span className="break-words text-slate-200">{value}</span>
    </SupportInset>
  );
}

export function FindingCard({ finding }: { finding: SupportFinding }) {
  const { openSettings } = useSettingsDialog();
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-4', findingTone(finding.severity))}>
      <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold"><span className="capitalize">{humanize(finding.severity)}: </span>{finding.title}</p>
        <p className="mt-1 text-xs leading-5 text-current/75">{finding.message}</p>
      </div>
      {finding.route === '/settings' ? (
        <ProjectDarkControlButton className="shrink-0 border-current/25 text-current" size="sm" onClick={() => openSettings('advanced')}>Open host settings<ChevronRight aria-hidden="true" className="size-4" /></ProjectDarkControlButton>
      ) : (
        <ProjectDarkControlButton asChild className="shrink-0 border-current/25 text-current" size="sm">
          <Link to={finding.route || '/monitoring'}>{finding.actionLabel || 'Open page'}<ChevronRight aria-hidden="true" className="size-4" /></Link>
        </ProjectDarkControlButton>
      )}
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

export function RelatedLink({ detail, onClick, title, to }: { detail: string; onClick?: () => void; title: string; to?: string }) {
  if (onClick) {
    return <button className="rounded-lg border border-sky-400/25 bg-slate-800 p-3 text-left text-sm transition hover:border-cyan-300/45 hover:bg-slate-700" onClick={onClick} type="button"><p className="font-semibold text-white">{title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p></button>;
  }
  return (
    <Link className="rounded-lg border border-sky-400/25 bg-slate-800 p-3 text-sm no-underline transition hover:border-cyan-300/45 hover:bg-slate-700" to={to || '/diagnostics'}>
      <span className="block font-bold text-white">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span>
    </Link>
  );
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
