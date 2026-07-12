import { cva, type VariantProps } from 'class-variance-authority';

export const semanticStatusVariants = cva(
  'border',
  {
    variants: {
      tone: {
        success: 'border-app-status-success-border bg-app-status-success-surface text-app-status-success-text',
        warning: 'border-app-status-warning-border bg-app-status-warning-surface text-app-status-warning-text',
        danger: 'border-app-status-danger-border bg-app-status-danger-surface text-app-status-danger-text',
        info: 'border-app-status-info-border bg-app-status-info-surface text-app-status-info-text',
        teal: 'border-app-status-info-border bg-app-status-info-surface text-app-status-info-text',
        neutral: 'border-app-status-muted-border bg-app-status-muted-surface text-app-status-muted-text',
        muted: 'border-app-status-muted-border bg-app-status-muted-surface text-app-status-muted-text',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export type SemanticStatusTone = NonNullable<VariantProps<typeof semanticStatusVariants>['tone']>;

export const semanticSolidStatusVariants = cva(
  'border shadow-sm',
  {
    variants: {
      tone: {
        success: 'border-emerald-800 bg-emerald-700 text-white',
        warning: 'border-amber-800 bg-amber-700 text-white',
        danger: 'border-red-800 bg-red-700 text-white',
        info: 'border-cyan-800 bg-cyan-700 text-white',
        teal: 'border-teal-800 bg-teal-700 text-white',
        neutral: 'border-slate-900 bg-slate-800 text-white',
        muted: 'border-slate-800 bg-slate-700 text-white',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export const semanticSurfaceVariants = cva(
  '',
  {
    variants: {
      tone: {
        panel: 'rounded-2xl border border-app-border-muted bg-app-panel text-app-text shadow-xl shadow-slate-950/30',
        muted: 'rounded-xl border border-app-border-muted bg-app-panel-muted text-app-text',
        inset: 'rounded-lg bg-app-panel-muted',
        warning: 'rounded-xl border border-app-status-warning-border bg-app-status-warning-surface text-app-status-warning-text shadow-lg shadow-orange-500/20',
        danger: 'rounded-xl border border-app-status-danger-border bg-app-status-danger-surface text-app-status-danger-text',
        success: 'rounded-lg border border-app-status-success-border bg-app-status-success-surface text-app-status-success-text',
        none: '',
      },
    },
    defaultVariants: {
      tone: 'panel',
    },
  },
);

export const semanticInteractiveSurfaceClass = 'transition hover:-translate-y-0.5 hover:border-app-border-strong hover:bg-app-panel-hover hover:shadow-lg hover:shadow-cyan-950/20';

export const semanticDisabledClass = 'disabled:cursor-not-allowed disabled:border-app-disabled-border disabled:bg-app-disabled-surface disabled:text-app-disabled-text disabled:opacity-100 disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:bg-app-disabled-surface';

export const semanticPrimaryActionClass = 'bg-app-accent text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-app-accent-strong';
export const semanticOpenActionClass = 'bg-app-accent text-slate-950 shadow-sm shadow-cyan-700/20 hover:bg-app-accent-strong';
export const semanticLightControlClass = 'border-app-border bg-background text-foreground hover:bg-muted';
export const semanticDarkControlClass = 'border-app-border-muted bg-app-panel text-app-text hover:bg-app-panel-hover hover:text-white';
export const semanticWarningActionClass = 'bg-app-warning text-white shadow-md shadow-orange-950/30 hover:bg-orange-700';
