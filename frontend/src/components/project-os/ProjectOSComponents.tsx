import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Info, Sparkles, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import type { ProjectOsAction, ProjectOsIssue } from '@/types/app';

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'teal' | 'neutral';
type PageAccent =
  | 'overview'
  | 'applications'
  | 'marketplace'
  | 'network'
  | 'storage'
  | 'backups'
  | 'monitoring'
  | 'automation'
  | 'settings'
  | 'support';

const toneClasses: Record<Tone, {
  badge: string;
  glow: string;
  icon: string;
  pulse: string;
  text: string;
}> = {
  brand: {
    badge: 'border-po-border-accent bg-po-brand-soft text-violet-100',
    glow: 'shadow-po-brand-glow',
    icon: 'bg-po-brand-soft text-po-brand-strong',
    pulse: 'bg-po-brand shadow-po-pulse-brand',
    text: 'text-po-brand-strong',
  },
  success: {
    badge: 'border-po-success-border bg-po-success-soft text-emerald-100',
    glow: 'shadow-po-success-glow',
    icon: 'bg-po-success-soft text-emerald-200',
    pulse: 'bg-po-success shadow-po-pulse-success',
    text: 'text-emerald-200',
  },
  warning: {
    badge: 'border-po-warning-border bg-po-warning-soft text-amber-100',
    glow: 'shadow-po-warning-glow',
    icon: 'bg-po-warning-soft text-amber-200',
    pulse: 'bg-po-warning shadow-po-pulse-warning',
    text: 'text-amber-200',
  },
  danger: {
    badge: 'border-po-danger-border bg-po-danger-soft text-red-100',
    glow: 'shadow-po-danger-glow',
    icon: 'bg-po-danger-soft text-red-200',
    pulse: 'bg-po-danger shadow-po-pulse-danger',
    text: 'text-red-200',
  },
  info: {
    badge: 'border-po-info-border bg-po-info-soft text-sky-100',
    glow: 'shadow-po-info-glow',
    icon: 'bg-po-info-soft text-sky-200',
    pulse: 'bg-po-info shadow-po-pulse-info',
    text: 'text-sky-200',
  },
  teal: {
    badge: 'border-po-teal-border bg-po-teal-soft text-teal-100',
    glow: 'shadow-po-teal-glow',
    icon: 'bg-po-teal-soft text-teal-200',
    pulse: 'bg-po-teal shadow-po-pulse-teal',
    text: 'text-teal-200',
  },
  neutral: {
    badge: 'border-po-border-strong bg-po-surface-inset text-po-text-secondary',
    glow: 'shadow-po-sm',
    icon: 'bg-po-surface-inset text-po-text-secondary',
    pulse: 'bg-po-text-muted shadow-po-pulse-neutral',
    text: 'text-po-text-secondary',
  },
};

const accentGlow: Record<PageAccent, string> = {
  overview: 'from-po-overview/22 via-po-info/10 to-transparent',
  applications: 'from-po-applications/18 via-po-brand/10 to-transparent',
  marketplace: 'from-po-marketplace/22 via-po-brand/12 to-transparent',
  network: 'from-po-network/18 via-po-info/10 to-transparent',
  storage: 'from-po-storage/18 via-po-teal/10 to-transparent',
  backups: 'from-po-backups/18 via-po-success/10 to-transparent',
  monitoring: 'from-po-monitoring/18 via-po-brand/10 to-transparent',
  automation: 'from-po-automation/18 via-po-brand/10 to-transparent',
  settings: 'from-po-settings/16 via-po-brand/8 to-transparent',
  support: 'from-po-support/18 via-po-info/10 to-transparent',
};

export function PageShell({
  children,
  className,
  maxWidth = 'max-w-po-page',
}: {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}) {
  return (
    <section className={cn('grid w-full gap-5', maxWidth, className)}>
      {children}
    </section>
  );
}

export function PageSection({
  action,
  children,
  className,
  description,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title?: ReactNode;
}) {
  return (
    <section className={cn('grid gap-4', className)}>
      {(title || description || action || eyebrow) && (
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            {eyebrow && <div className="mb-2 text-xs font-bold uppercase tracking-normal text-po-brand-strong">{eyebrow}</div>}
            {title && <h2 className="m-0 text-po-h2 font-bold text-po-text">{title}</h2>}
            {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-po-text-muted">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function SoftCard({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <Card
      className={cn(
        'gap-0 rounded-po-lg border border-po-border bg-po-surface py-0 text-po-text shadow-po-md ring-0 backdrop-blur-xl',
        interactive && 'transition hover:-translate-y-0.5 hover:border-po-border-accent hover:bg-po-surface-elevated hover:shadow-po-lg',
        className,
      )}
    >
      <CardContent className="p-[var(--po-space-card)]">
        {children}
      </CardContent>
    </Card>
  );
}

export const surfaceFrameClass = 'overflow-hidden rounded-lg border border-white/10 bg-slate-950/70 shadow-po-frame';
export const surfacePanelClass = 'rounded-lg border border-white/10 bg-slate-950/70 p-5 shadow-po-panel';
export const surfaceInsetClass = 'rounded-lg border border-slate-800 bg-slate-900/40 p-3';

export function SurfaceFrame({ as: Component = 'div', children, className }: { as?: 'div' | 'header'; children: ReactNode; className?: string }) {
  return <Component className={cn(surfaceFrameClass, className)}>{children}</Component>;
}

export function SurfacePanel({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <section className={cn(surfacePanelClass, className)} id={id}>{children}</section>;
}

export function SurfaceInset({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(surfaceInsetClass, className)}>{children}</div>;
}

export function PageHero({
  actions,
  accent = 'overview',
  children,
  className,
  description,
  eyebrow,
  icon: Icon = Sparkles,
  status,
  title,
}: {
  actions?: ReactNode;
  accent?: PageAccent;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  status?: ReactNode;
  title: ReactNode;
}) {
  return (
    <Card className={cn('relative overflow-hidden rounded-po-xl border border-po-border bg-po-surface py-0 text-po-text shadow-po-lg ring-0', className)}>
      <CardContent className="p-6 md:p-8">
        <div className={cn('absolute inset-0 bg-gradient-to-br opacity-90', accentGlow[accent])} />
        <div className="absolute right-8 top-8 size-40 rounded-full bg-po-brand/10 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            {eyebrow && <p className="mb-3 text-xs font-bold uppercase tracking-normal text-po-brand-strong">{eyebrow}</p>}
            <div className="flex items-start gap-4">
              <div className="hidden size-12 shrink-0 place-items-center rounded-po-md bg-po-brand-soft text-po-brand-strong shadow-po-brand-glow sm:grid">
                <Icon className="size-6" />
              </div>
              <div>
                <h1 className="m-0 text-po-h1 font-bold leading-tight text-po-text">{title}</h1>
                {description && <p className="mt-3 max-w-2xl text-base leading-7 text-po-text-secondary">{description}</p>}
              </div>
            </div>
          </div>
          {(status || actions) && (
            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              {status}
              {actions}
            </div>
          )}
        </div>
        {children && <div className="relative z-10 mt-6">{children}</div>}
      </CardContent>
    </Card>
  );
}

export function StatusPulse({
  label,
  detail,
  tone = 'success',
}: {
  label: ReactNode;
  detail?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className={cn('inline-flex items-center gap-3 rounded-po-full border px-3 py-2', toneClasses[tone].badge, toneClasses[tone].glow)}>
      <span className={cn('size-2.5 rounded-full', toneClasses[tone].pulse)} />
      <span className="grid leading-tight">
        <span className="text-sm font-bold">{label}</span>
        {detail && <span className="text-xs opacity-75">{detail}</span>}
      </span>
    </div>
  );
}

export function StatusPill({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  return (
    <span className={cn('inline-flex min-h-7 items-center rounded-po-full border px-2.5 py-1 text-xs font-semibold', toneClasses[tone].badge, className)}>
      {children}
    </span>
  );
}

export function ProjectOsActionButton({
  action,
  className,
  fallbackRoute,
  variant = 'default',
}: {
  action?: ProjectOsAction | null;
  className?: string;
  fallbackRoute?: string;
  variant?: 'default' | 'outline' | 'secondary';
}) {
  if (!action && !fallbackRoute) {
    return null;
  }
  const label = typeof action?.label === 'string' ? action.label : 'Open';
  const route = typeof action?.route === 'string' ? action.route : fallbackRoute;
  const href = typeof action?.href === 'string' ? action.href : undefined;
  if (route) {
    return (
      <Button asChild className={className} size="sm" variant={variant}>
        <Link to={route}>{label}</Link>
      </Button>
    );
  }
  if (href) {
    return (
      <Button asChild className={className} size="sm" variant={variant}>
        <a href={href} rel="noreferrer" target={href.startsWith('http') ? '_blank' : undefined}>{label}</a>
      </Button>
    );
  }
  return (
    <Button className={className} disabled size="sm" type="button" variant={variant}>
      {label}
    </Button>
  );
}

export function IssueBanner({
  className,
  issue,
}: {
  className?: string;
  issue: ProjectOsIssue;
}) {
  const tone = issueTone(issue.severity);
  const Icon = issueIcon(issue.severity);
  return (
    <div className={cn('flex flex-col gap-3 rounded-po-md border p-3 sm:flex-row sm:items-start sm:justify-between', toneClasses[tone].badge, className)}>
      <div className="flex min-w-0 gap-3">
        <div className={cn('grid size-9 shrink-0 place-items-center rounded-po-sm', toneClasses[tone].icon)}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="m-0 text-sm font-bold">{issue.title}</p>
          <p className="m-0 mt-1 text-sm leading-5 opacity-80">{issue.summary}</p>
        </div>
      </div>
      {issue.primaryAction && (
        <div className="shrink-0">
          <ProjectOsActionButton action={issue.primaryAction} variant="secondary" />
        </div>
      )}
    </div>
  );
}

export function PrimaryActionCard({
  action,
  body,
  className,
  dismissible = false,
  severity = 'info',
  title,
}: {
  action?: ProjectOsAction | null;
  body: ReactNode;
  className?: string;
  dismissible?: boolean;
  severity?: string;
  title: ReactNode;
}) {
  const tone = issueTone(severity);
  const Icon = issueIcon(severity);
  return (
    <SoftCard className={cn('relative overflow-hidden', toneClasses[tone].glow, className)}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 gap-3">
          <div className={cn('grid size-11 shrink-0 place-items-center rounded-po-md', toneClasses[tone].icon)}>
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="m-0 text-base font-bold text-po-text">{title}</p>
            <p className="m-0 mt-1 text-sm leading-6 text-po-text-muted">{body}</p>
            {dismissible && <p className="m-0 mt-1 text-xs text-po-text-disabled">You can dismiss this after reviewing it.</p>}
          </div>
        </div>
        <ProjectOsActionButton action={action} className="w-full sm:w-auto" />
      </div>
    </SoftCard>
  );
}

function issueTone(severity?: string): Tone {
  if (severity === 'success') {
    return 'success';
  }
  if (severity === 'critical') {
    return 'danger';
  }
  if (severity === 'warning') {
    return 'warning';
  }
  if (severity === 'info') {
    return 'info';
  }
  return 'neutral';
}

function issueIcon(severity?: string): LucideIcon {
  if (severity === 'success') {
    return CheckCircle2;
  }
  if (severity === 'critical') {
    return XCircle;
  }
  if (severity === 'warning') {
    return AlertTriangle;
  }
  return Info;
}

export function GlowBadge({
  children,
  className,
  tone = 'brand',
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  return (
    <Badge className={cn('border px-2.5 py-1', toneClasses[tone].badge, className)} variant="outline">
      {children}
    </Badge>
  );
}

export function SpotlightCard({
  actions,
  children,
  className,
  description,
  icon: Icon,
  metric,
  tone = 'brand',
  title,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon?: LucideIcon;
  metric?: ReactNode;
  tone?: Tone;
  title: ReactNode;
}) {
  return (
    <SoftCard className={cn('relative overflow-hidden', toneClasses[tone].glow, className)}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-transparent" />
      <div className="relative z-10 grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div>
          <div className="flex items-start gap-3">
            {Icon && (
              <div className={cn('grid size-12 shrink-0 place-items-center rounded-po-md', toneClasses[tone].icon)}>
                <Icon className="size-6" />
              </div>
            )}
            <div>
              <p className="m-0 text-xs font-bold uppercase tracking-normal text-po-text-muted">Spotlight</p>
              <h2 className="m-0 mt-1 text-2xl font-bold text-po-text">{title}</h2>
              {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-po-text-secondary">{description}</p>}
            </div>
          </div>
          {children && <div className="mt-5">{children}</div>}
        </div>
        {(metric || actions) && (
          <div className="grid gap-3 md:min-w-52">
            {metric}
            {actions && <div className="flex flex-wrap gap-2 md:justify-end">{actions}</div>}
          </div>
        )}
      </div>
    </SoftCard>
  );
}

export function MetricStoryCard({
  action,
  className,
  detail,
  icon: Icon,
  label,
  progress,
  tone = 'brand',
  value,
}: {
  action?: ReactNode;
  className?: string;
  detail?: ReactNode;
  icon: LucideIcon;
  label: ReactNode;
  progress?: number;
  tone?: Tone;
  value: ReactNode;
}) {
  const normalizedProgress = typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : null;

  return (
    <SoftCard className={cn('grid gap-4', className)} interactive>
      <div className="flex items-start justify-between gap-3">
        <div className={cn('grid size-11 place-items-center rounded-po-md', toneClasses[tone].icon)}>
          <Icon className="size-5" />
        </div>
        <GlowBadge tone={tone}>{label}</GlowBadge>
      </div>
      <div>
        <p className="m-0 text-2xl font-bold text-po-text">{value}</p>
        {detail && <p className="mt-1 text-sm leading-6 text-po-text-muted">{detail}</p>}
      </div>
      {normalizedProgress !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-po-surface-inset">
          <div className={cn('h-full rounded-full', toneClasses[tone].pulse)} style={{ width: `${normalizedProgress}%` }} />
        </div>
      )}
      {action && <div className="pt-1 text-sm font-semibold text-po-brand-strong">{action}</div>}
    </SoftCard>
  );
}

export function QuickAccessAppTile({
  actionLabel = 'Open',
  className,
  description,
  href,
  icon,
  name,
  status,
  statusTone = 'success',
  onAction,
  to,
}: {
  actionLabel?: string;
  className?: string;
  description?: ReactNode;
  href?: string;
  icon?: ReactNode;
  name: ReactNode;
  onAction?: () => void;
  status?: ReactNode;
  statusTone?: Tone;
  to?: string;
}) {
  const action = href ? (
    <Button asChild className="bg-po-brand text-white hover:bg-po-brand/85" size="sm">
      <a href={href} rel="noreferrer" target="_blank">{actionLabel}</a>
    </Button>
  ) : to ? (
    <Button asChild className="bg-po-brand text-white hover:bg-po-brand/85" size="sm">
      <Link to={to}>{actionLabel}</Link>
    </Button>
  ) : (
    <Button className="bg-po-brand text-white hover:bg-po-brand/85" disabled={!onAction} onClick={onAction} size="sm" type="button">
      {actionLabel}
    </Button>
  );

  return (
    <SoftCard className={cn('grid min-h-40 content-between gap-4 text-center', className)} interactive>
      <div className="grid justify-items-center gap-3">
        <div className="grid size-14 place-items-center rounded-po-md bg-po-surface-inset text-po-brand-strong shadow-po-sm">
          {icon || <Sparkles className="size-7" />}
        </div>
        <div>
          <p className="m-0 font-bold text-po-text">{name}</p>
          {description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-po-text-muted">{description}</p>}
        </div>
      </div>
      <div className="grid justify-items-center gap-2">
        {status && <GlowBadge tone={statusTone}>{status}</GlowBadge>}
        {action}
      </div>
    </SoftCard>
  );
}

export type TimelineItem = {
  id: string | number;
  title: ReactNode;
  detail?: ReactNode;
  time?: ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
};

export function ActivityTimeline({
  className,
  emptyText = 'No recent activity yet.',
  items,
}: {
  className?: string;
  emptyText?: ReactNode;
  items: TimelineItem[];
}) {
  if (!items.length) {
    return <EmptyState title={emptyText} />;
  }

  return (
    <div className={cn('grid gap-0', className)}>
      {items.map((item, index) => {
        const Icon = item.icon;
        const tone = item.tone || 'neutral';
        return (
          <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3" key={item.id}>
            <div className="grid justify-items-center">
              <div className={cn('grid size-8 place-items-center rounded-full border', toneClasses[tone].badge)}>
                {Icon ? <Icon className="size-4" /> : <span className={cn('size-2 rounded-full', toneClasses[tone].pulse)} />}
              </div>
              {index < items.length - 1 && <div className="h-full min-h-5 w-px bg-po-border" />}
            </div>
            <div className="pb-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="m-0 font-semibold text-po-text">{item.title}</p>
                {item.time && <span className="text-xs text-po-text-muted">{item.time}</span>}
              </div>
              {item.detail && <p className="mt-1 text-sm leading-6 text-po-text-muted">{item.detail}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type NextStepItem = {
  id: string | number;
  title: ReactNode;
  detail?: ReactNode;
  href?: string;
  action?: ReactNode;
  count?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
};

export function NextStepList({
  className,
  emptyText = 'No next steps right now.',
  items,
}: {
  className?: string;
  emptyText?: ReactNode;
  items: NextStepItem[];
}) {
  if (!items.length) {
    return <EmptyState title={emptyText} tone="success" />;
  }

  return (
    <div className={cn('grid gap-2', className)}>
      {items.map((item) => {
        const Icon = item.icon || ChevronRight;
        const tone = item.tone || 'brand';
        const content = (
          <>
            <div className={cn('grid size-9 shrink-0 place-items-center rounded-po-sm', toneClasses[tone].icon)}>
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="m-0 font-semibold text-po-text">{item.title}</p>
              {item.detail && <p className="mt-1 text-sm leading-5 text-po-text-muted">{item.detail}</p>}
            </div>
            {item.count && <GlowBadge tone={tone}>{item.count}</GlowBadge>}
            {item.action || <ChevronRight className="size-4 text-po-text-muted" />}
          </>
        );

        if (item.href) {
          return (
            <Link className="flex items-center gap-3 rounded-po-md border border-po-border bg-po-surface-soft p-3 text-sm no-underline transition hover:border-po-border-accent hover:bg-po-surface-hover" key={item.id} to={item.href}>
              {content}
            </Link>
          );
        }

        return (
          <div className="flex items-center gap-3 rounded-po-md border border-po-border bg-po-surface-soft p-3 text-sm" key={item.id}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

export function AdvancedDetailsPanel({
  children,
  className,
  defaultOpen = false,
  description,
  title = 'Advanced details',
}: {
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  description?: ReactNode;
  title?: ReactNode;
}) {
  return (
    <Collapsible className={cn('rounded-po-lg border border-po-border bg-po-surface-inset', className)} defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 rounded-po-lg px-4 py-3 text-left text-sm font-semibold text-po-text transition hover:bg-po-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-po-brand">
        <span>
          <span className="block">{title}</span>
          {description && <span className="mt-1 block text-xs font-normal leading-5 text-po-text-muted">{description}</span>}
        </span>
        <ChevronDown className="size-4 text-po-text-muted transition group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-po-border px-4 py-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function EmptyState({
  action,
  className,
  description,
  icon: Icon = Sparkles,
  title,
  tone = 'neutral',
}: {
  action?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  tone?: Tone;
}) {
  return (
    <Card className={cn('rounded-po-lg border-dashed border-po-border bg-po-surface-soft py-0 text-center text-po-text ring-0', className)}>
      <CardContent className="grid justify-items-center gap-3 p-6">
        <div className={cn('grid size-11 place-items-center rounded-po-md', toneClasses[tone].icon)}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="m-0 font-semibold text-po-text">{title}</p>
          {description && <p className="mt-1 max-w-md text-sm leading-6 text-po-text-muted">{description}</p>}
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

export function ViewModeToggle({ className }: { className?: string }) {
  const { setViewMode, viewMode } = useProjectSettings();
  const advanced = viewMode === 'advanced';

  return (
    <div className={cn('grid grid-cols-2 rounded-po-sm border border-po-border bg-po-surface-inset p-1 text-xs font-semibold', className)}>
      <Button
        className={cn(
          'h-7 rounded-po-xs px-2 text-xs',
          !advanced ? 'bg-po-brand text-white shadow-po-brand-glow hover:bg-po-brand/90' : 'bg-transparent text-po-text-muted hover:bg-po-surface-hover hover:text-po-text',
        )}
        onClick={() => setViewMode('basic')}
        type="button"
        variant="ghost"
      >
        Basic
      </Button>
      <Button
        className={cn(
          'h-7 rounded-po-xs px-2 text-xs',
          advanced ? 'bg-po-brand text-white shadow-po-brand-glow hover:bg-po-brand/90' : 'bg-transparent text-po-text-muted hover:bg-po-surface-hover hover:text-po-text',
        )}
        onClick={() => setViewMode('advanced')}
        type="button"
        variant="ghost"
      >
        Advanced
      </Button>
    </div>
  );
}
