import type { NetworkNodeStatus } from './NetworkPage.types';

export function statusTone(status: NetworkNodeStatus, surface: 'badge' | 'soft') {
  const tones = {
    connected: {
      badge: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
      soft: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
    },
    warning: {
      badge: 'border-orange-400/45 bg-orange-500/10 text-orange-200',
      soft: 'border-orange-400/45 bg-orange-500/10 text-orange-200',
    },
    neutral: {
      badge: 'border-slate-600/50 bg-slate-800/70 text-slate-300',
      soft: 'border-slate-600/40 bg-slate-900/70 text-slate-300',
    },
  };
  return tones[status][surface];
}

export function diagnosticTone(status: string) {
  if (status === 'healthy') return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200';
  if (status === 'warning') return 'border-orange-400/45 bg-orange-500/10 text-orange-200';
  return 'border-slate-600/40 bg-slate-900/70 text-slate-300';
}
