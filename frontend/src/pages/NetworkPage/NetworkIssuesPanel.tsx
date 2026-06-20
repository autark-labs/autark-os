import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { statusTone } from './extensions/NetworkPage.theme';
import type { NetworkIssueView } from './extensions/NetworkPage.types';
import { EmptyState } from './NetworkPage.shared';

export function NetworkIssuesPanel({ issues }: { issues: NetworkIssueView[] }) {
  return (
    <Card className="border-white/10 bg-slate-950/55 py-0 text-slate-100">
      <CardHeader className="border-b border-white/10 p-5">
        <CardTitle className="text-lg text-white">Issues to review</CardTitle>
        <p className="mt-1 text-sm text-slate-400">Only items that need attention appear here.</p>
      </CardHeader>
      <CardContent className="grid gap-3 p-5">
        {issues.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No network issues found" text="Project OS does not see any private access problems right now." />
        ) : (
          issues.map((issue) => (
            <div className="flex gap-3 rounded-lg border border-white/10 bg-slate-900/45 p-4" key={issue.id}>
              <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border', statusTone(issue.status, 'soft'))}>
                <AlertTriangle className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-white">{issue.label}</span>
                  <Badge className="border-slate-600/40 bg-slate-900/70 text-slate-300" variant="outline">{issue.source === 'app' ? 'App link' : 'Network'}</Badge>
                  {issue.actionLabel && <span className="text-xs text-violet-300">{issue.actionLabel}</span>}
                </span>
                <span className="mt-1 block text-sm text-slate-300">{issue.message}</span>
                {issue.detail && <span className="mt-1 block text-xs text-slate-500">{issue.detail}</span>}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
