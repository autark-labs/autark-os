import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { cn } from '@/lib/utils';
import { statusTone } from './extensions/NetworkPage.theme';
import type { NetworkIssueView } from './extensions/NetworkPage.types';
import { EmptyState, NetworkInset, NetworkPanel } from './NetworkPage.shared';

export function NetworkIssuesPanel({ issues, onReviewPrivateLinks }: { issues: NetworkIssueView[]; onReviewPrivateLinks: () => void }) {
  return (
    <NetworkPanel
      description="Only items that need attention appear here."
      title="Issues to review"
    >
        {issues.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No network issues found" text="Autark-OS does not see any private access problems right now." />
        ) : (
          issues.map((issue) => (
            <NetworkInset className="flex gap-3 p-4" key={issue.id}>
              <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border', statusTone(issue.status, 'soft'))}>
                <AlertTriangle className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-50">{issue.label}</span>
                  <MetadataBadge>{issue.source === 'app' ? 'App link' : 'Network'}</MetadataBadge>
                </div>
                <span className="mt-1 block text-sm text-sky-100/75">{issue.message}</span>
                {issue.detail && <span className="mt-1 block text-xs text-sky-100/70">{issue.detail}</span>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {issue.source === 'app' || issue.id.startsWith('stale-') ? (
                    <ProjectPrimaryButton onClick={onReviewPrivateLinks} size="sm" type="button">
                      Review services
                    </ProjectPrimaryButton>
                  ) : (
                    <ProjectDarkControlButton asChild size="sm">
                      <Link to="/diagnostics">Open diagnostics</Link>
                    </ProjectDarkControlButton>
                  )}
                  {issue.actionLabel && <span className="text-xs text-sky-100/55">{issue.actionLabel}</span>}
                </div>
              </div>
            </NetworkInset>
          ))
        )}
    </NetworkPanel>
  );
}
