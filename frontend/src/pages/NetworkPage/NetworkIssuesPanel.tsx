import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { statusTone } from './extensions/NetworkPage.theme';
import type { NetworkIssueView } from './extensions/NetworkPage.types';
import { EmptyState, NetworkInset, NetworkPanel } from './NetworkPage.shared';

export function NetworkIssuesPanel({ issues }: { issues: NetworkIssueView[] }) {
  return (
    <NetworkPanel
      description="Only items that need attention appear here."
      title="Issues to review"
    >
        {issues.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No network issues found" text="Project OS does not see any private access problems right now." />
        ) : (
          issues.map((issue) => (
            <NetworkInset className="flex gap-3 p-4" key={issue.id}>
              <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border', statusTone(issue.status, 'soft'))}>
                <AlertTriangle className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-50">{issue.label}</span>
                  <Badge className="border-sky-400/25 bg-slate-900 text-sky-100/80" variant="outline">{issue.source === 'app' ? 'App link' : 'Network'}</Badge>
                  {issue.actionLabel && <span className="text-xs text-cyan-200">{issue.actionLabel}</span>}
                </span>
                <span className="mt-1 block text-sm text-sky-100/75">{issue.message}</span>
                {issue.detail && <span className="mt-1 block text-xs text-sky-100/50">{issue.detail}</span>}
              </span>
            </NetworkInset>
          ))
        )}
    </NetworkPanel>
  );
}
