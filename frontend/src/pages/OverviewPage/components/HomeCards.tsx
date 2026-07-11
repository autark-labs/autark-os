import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, MoreVertical, Sparkles, X, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  ProjectDarkControlButton,
  ProjectOpenButton,
  ProjectPrimaryButton,
} from '@/components/primitives/ProjectButtons';
import { Badge } from '@/components/ui/badge';
import { Surface } from '@/components/primitives/Surface';
import { cn } from '@/lib/utils';
import type { AutarkOsAction, AutarkOsIssue } from '@/types/app';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'teal' | 'neutral';

const toneClasses: Record<Tone, {
  badge: string;
  glow: string;
  icon: string;
  pulse: string;
}> = {
  success: {
    badge: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200',
    glow: 'shadow-emerald-700/20',
    icon: 'border border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
    pulse: 'bg-emerald-400 shadow-[0_0_0_5px_rgb(52_211_153_/_0.14)]',
  },
  warning: {
    badge: 'border-orange-400/45 bg-orange-500/10 text-orange-200',
    glow: 'shadow-orange-700/20',
    icon: 'border border-orange-400/30 bg-orange-500/10 text-orange-200',
    pulse: 'bg-orange-400 shadow-[0_0_0_5px_rgb(251_146_60_/_0.14)]',
  },
  danger: {
    badge: 'border-red-400/40 bg-red-500/10 text-red-200',
    glow: 'shadow-red-700/20',
    icon: 'border border-red-400/30 bg-red-500/10 text-red-200',
    pulse: 'bg-red-400 shadow-[0_0_0_5px_rgb(248_113_113_/_0.14)]',
  },
  info: {
    badge: 'border-cyan-300/35 bg-cyan-400/10 text-cyan-100',
    glow: 'shadow-cyan-700/20',
    icon: 'border border-cyan-300/25 bg-cyan-400/10 text-cyan-100',
    pulse: 'bg-cyan-400 shadow-[0_0_0_5px_rgb(34_211_238_/_0.15)]',
  },
  teal: {
    badge: 'border-teal-300/30 bg-teal-400/10 text-teal-100',
    glow: 'shadow-teal-700/20',
    icon: 'border border-teal-300/25 bg-teal-400/10 text-teal-100',
    pulse: 'bg-teal-400 shadow-[0_0_0_5px_rgb(45_212_191_/_0.14)]',
  },
  neutral: {
    badge: 'border-sky-400/25 bg-slate-800 text-sky-100/80',
    glow: 'shadow-cyan-950/15',
    icon: 'border border-sky-400/20 bg-slate-900 text-sky-100/75',
    pulse: 'bg-slate-500 shadow-[0_0_0_5px_rgb(86_113_132_/_0.12)]',
  },
};

export function HomeSection({
  action,
  children,
  className,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  title?: ReactNode;
}) {
  return (
    <Surface className={cn('grid gap-4 p-4 shadow-slate-950/20', className)} tone="panel">
      {(title || description || action) && (
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            {title && <h2 className="m-0 text-2xl font-bold text-slate-50">{title}</h2>}
            {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-sky-100/70">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
        </div>
      )}
      {children}
    </Surface>
  );
}

export function HomeSoftCard({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <Surface
      className={cn(
        'p-5',
        interactive && 'transition hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-slate-700 hover:shadow-2xl hover:shadow-cyan-950/25',
        className,
      )}
      tone="muted"
    >
      {children}
    </Surface>
  );
}

export function HomeActionCard({
  action,
  body,
  className,
  dismissible = false,
  dismissing = false,
  onDismiss,
  severity = 'info',
  title,
}: {
  action?: AutarkOsAction | null;
  body: ReactNode;
  className?: string;
  dismissible?: boolean;
  dismissing?: boolean;
  onDismiss?: () => void;
  severity?: string;
  title: ReactNode;
}) {
  const tone = issueTone(severity);
  const Icon = issueIcon(severity);

  return (
    <HomeSoftCard className={cn('relative overflow-hidden shadow-2xl', toneClasses[tone].glow, className)}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 gap-3">
          <div className={cn('grid size-11 shrink-0 place-items-center rounded-xl', toneClasses[tone].icon)}>
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="m-0 text-base font-bold text-slate-50">{title}</p>
            <p className="m-0 mt-1 text-sm leading-6 text-sky-100/70">{body}</p>
            {dismissible && <p className="m-0 mt-1 text-xs text-sky-100/55">You can dismiss this after reviewing it.</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <HomeActionButton action={action} className="w-full sm:w-auto" />
          {dismissible && onDismiss && (
            <ProjectDarkControlButton aria-label="Dismiss recommendation" disabled={dismissing} onClick={onDismiss} size="icon" type="button">
              <X className="size-4" />
            </ProjectDarkControlButton>
          )}
        </div>
      </div>
    </HomeSoftCard>
  );
}

export function HomeIssueBanner({
  className,
  issue,
}: {
  className?: string;
  issue: AutarkOsIssue;
}) {
  const tone = issueTone(issue.severity);
  const Icon = issueIcon(issue.severity);

  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border bg-slate-800 p-3 sm:flex-row sm:items-start sm:justify-between', toneClasses[tone].badge, className)}>
      <div className="flex min-w-0 gap-3">
        <div className={cn('grid size-9 shrink-0 place-items-center rounded-lg', toneClasses[tone].icon)}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="m-0 text-sm font-bold text-slate-50">{issue.title}</p>
          <p className="m-0 mt-1 text-sm leading-5 text-sky-100/70">{issue.summary}</p>
        </div>
      </div>
      {issue.primaryAction && (
        <div className="shrink-0">
          <HomeActionButton action={issue.primaryAction} variant="dark" />
        </div>
      )}
    </div>
  );
}

export function HomeMetricCard({
  action,
  className,
  detail,
  icon: Icon,
  progress,
  tone = 'info',
  value,
  label,
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
    <HomeSoftCard className={cn('grid gap-4', className)} interactive={Boolean(action)}>
      <div className="flex items-start justify-between gap-3">
        <div className={cn('grid size-11 place-items-center rounded-xl', toneClasses[tone].icon)}>
          <Icon className="size-5" />
        </div>
        <HomeGlowBadge tone={tone}>{label}</HomeGlowBadge>
      </div>
      <div>
        <p className="m-0 text-2xl font-bold text-slate-50">{value}</p>
        {detail && <p className="mt-1 text-sm leading-6 text-sky-100/70">{detail}</p>}
      </div>
      {normalizedProgress !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-slate-900">
          <div className={cn('h-full rounded-full', toneClasses[tone].pulse)} style={{ width: `${normalizedProgress}%` }} />
        </div>
      )}
      {action && <div className="pt-1 text-sm font-semibold text-cyan-200">{action}</div>}
    </HomeSoftCard>
  );
}

export function HomeQuickAccessTile({
  actionLabel = 'Open',
  description,
  href,
  icon,
  iconUrl,
  name,
  secondaryActionLabel,
  secondaryTo,
  status,
  statusTone = 'success',
  to,
}: {
  actionLabel?: string;
  description?: ReactNode;
  href?: string;
  icon?: ReactNode;
  iconUrl?: string | null;
  name: ReactNode;
  secondaryActionLabel?: string;
  secondaryTo?: string;
  status?: ReactNode;
  statusTone?: Tone;
  to?: string;
}) {
  const action = href ? (
    <ProjectOpenButton asChild className="h-9 rounded-lg px-4 text-sm font-semibold" size="sm">
      <a href={href} rel="noreferrer" target="_blank">{actionLabel}</a>
    </ProjectOpenButton>
  ) : to ? (
    <ProjectOpenButton asChild className="h-9 rounded-lg px-4 text-sm font-semibold" size="sm">
      <Link to={to}>{actionLabel}</Link>
    </ProjectOpenButton>
  ) : null;
  const secondaryAction = secondaryActionLabel && secondaryTo ? (
    <ProjectDarkControlButton asChild className="h-9 rounded-lg px-4 text-sm font-semibold" size="sm">
      <Link to={secondaryTo}>{secondaryActionLabel}</Link>
    </ProjectDarkControlButton>
  ) : null;
  const detailRoute = secondaryTo ?? to ?? '/apps';

  return (
    <HomeSoftCard
      className={cn(
        'grid min-h-[214px] content-between overflow-hidden rounded-xl text-left shadow-lg shadow-slate-950/20',
        'transition hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-slate-700 hover:shadow-2xl hover:shadow-cyan-950/25',
      )}
    >
      <div className="grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="grid size-16 place-items-center overflow-hidden rounded-xl border border-sky-400/25 bg-slate-900 text-cyan-100 shadow-md shadow-slate-950/20">
            {iconUrl ? <img alt="" className="size-full object-contain p-2" src={iconUrl} /> : icon || <Sparkles className="size-8" />}
          </div>
          <div className="flex items-center gap-2">
            {status && <HomeGlowBadge className="rounded-full px-2.5 py-0.5 text-xs" tone={statusTone}>{status}</HomeGlowBadge>}
            <ProjectDarkControlButton asChild aria-label="App details" className="size-8 rounded-lg p-0" size="icon">
              <Link to={detailRoute}>
                <MoreVertical className="size-4" />
              </Link>
            </ProjectDarkControlButton>
          </div>
        </div>
        <div>
          <p className="m-0 truncate text-base font-bold text-slate-50">{name}</p>
          {description && <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-sky-100/65">{description}</p>}
        </div>
      </div>
      {(action || secondaryAction) && (
        <div className={cn('grid gap-2 pt-4', action && secondaryAction && '2xl:grid-cols-2')}>
          {action}
          {secondaryAction}
        </div>
      )}
    </HomeSoftCard>
  );
}

export function HomeActivityTimeline({
  className,
  emptyText = 'No recent activity yet.',
  items,
}: {
  className?: string;
  emptyText?: ReactNode;
  items: Array<{
    id: string | number;
    title: ReactNode;
    detail?: ReactNode;
    time?: ReactNode;
    tone?: Tone;
    icon?: ComponentType<{ className?: string }>;
  }>;
}) {
  if (!items.length) {
    return <HomeEmptyLine title={emptyText} />;
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
              {index < items.length - 1 && <div className="h-full min-h-5 w-px bg-sky-400/20" />}
            </div>
            <div className="pb-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="m-0 font-semibold text-slate-50">{item.title}</p>
                {item.time && <span className="text-xs text-sky-100/55">{item.time}</span>}
              </div>
              {item.detail && <p className="mt-1 text-sm leading-6 text-sky-100/65">{item.detail}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HomeActionButton({
  action,
  className,
  fallbackRoute,
  variant = 'default',
}: {
  action?: AutarkOsAction | null;
  className?: string;
  fallbackRoute?: string;
  variant?: 'default' | 'dark';
}) {
  if (!action && !fallbackRoute) {
    return null;
  }
  const label = typeof action?.label === 'string' ? action.label : 'Open';
  const route = typeof action?.route === 'string' ? action.route : fallbackRoute;
  const href = typeof action?.href === 'string' ? action.href : undefined;
  if (route) {
    const ButtonComponent = variant === 'dark' ? ProjectDarkControlButton : ProjectPrimaryButton;
    return (
      <ButtonComponent asChild className={className} size="sm">
        <Link to={route}>{label}</Link>
      </ButtonComponent>
    );
  }
  if (href) {
    const ButtonComponent = variant === 'dark' ? ProjectDarkControlButton : ProjectPrimaryButton;
    return (
      <ButtonComponent asChild className={className} size="sm">
        <a href={href} rel="noreferrer" target={href.startsWith('http') ? '_blank' : undefined}>{label}</a>
      </ButtonComponent>
    );
  }
  return null;
}

function HomeGlowBadge({
  children,
  className,
  tone = 'info',
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

function HomeEmptyLine({ title }: { title: ReactNode }) {
  return (
    <div className="rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2 text-sm text-sky-100/70">
      {title}
    </div>
  );
}

function issueTone(severity?: string): Tone {
  if (severity === 'success') return 'success';
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'warning';
  if (severity === 'info') return 'info';
  return 'neutral';
}

function issueIcon(severity?: string): LucideIcon {
  if (severity === 'success') return CheckCircle2;
  if (severity === 'critical') return XCircle;
  if (severity === 'warning') return AlertTriangle;
  return Info;
}
