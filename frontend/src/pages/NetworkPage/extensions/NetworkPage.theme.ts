import { Globe2, Laptop, Lock, Router, Server, ShieldCheck, Wifi } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NetworkNodeKind, NetworkNodeStatus } from './NetworkPage.types';

export const networkNodeIcons: Record<NetworkNodeKind, LucideIcon> = {
  internet: Globe2,
  'project-os': ShieldCheck,
  router: Router,
  apps: Server,
  'private-apps': Lock,
  devices: Laptop,
  lan: Wifi,
  'local-apps': Server,
  'network-apps': Wifi,
  'public-apps': Globe2,
};

export function statusTone(status: NetworkNodeStatus, surface: 'badge' | 'node' | 'soft') {
  const tones = {
    connected: {
      badge: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
      node: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100 shadow-emerald-950/20',
      soft: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
    },
    warning: {
      badge: 'border-amber-300/25 bg-amber-500/10 text-amber-200',
      node: 'border-amber-300/30 bg-amber-500/10 text-amber-100 shadow-amber-950/20',
      soft: 'border-amber-300/25 bg-amber-500/10 text-amber-200',
    },
    neutral: {
      badge: 'border-slate-600/50 bg-slate-800/70 text-slate-300',
      node: 'border-slate-600/40 bg-slate-900/95 text-slate-200 shadow-slate-950/20',
      soft: 'border-slate-600/40 bg-slate-900/70 text-slate-300',
    },
  };
  return tones[status][surface];
}

export function diagnosticTone(status: string) {
  if (status === 'healthy') return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200';
  if (status === 'warning') return 'border-amber-300/25 bg-amber-500/10 text-amber-200';
  return 'border-slate-600/40 bg-slate-900/70 text-slate-300';
}
