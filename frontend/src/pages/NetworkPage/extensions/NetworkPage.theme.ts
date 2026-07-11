import type { NetworkNodeStatus } from './NetworkPage.types';
import { semanticStatusVariants, type SemanticStatusTone } from '@/components/primitives/SemanticVariants';

export function networkStatusTone(status: NetworkNodeStatus): SemanticStatusTone {
  if (status === 'connected') return 'success';
  if (status === 'warning') return 'warning';
  return 'neutral';
}

export function statusTone(status: NetworkNodeStatus, surface: 'badge' | 'soft') {
  return semanticStatusVariants({ tone: networkStatusTone(status) });
}

export function diagnosticTone(status: string) {
  if (status === 'healthy') return semanticStatusVariants({ tone: 'success' });
  if (status === 'warning') return semanticStatusVariants({ tone: 'warning' });
  return semanticStatusVariants({ tone: 'neutral' });
}
