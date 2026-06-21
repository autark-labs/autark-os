import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/project-os/ProjectOSComponents';
import type { HostInventoryResource } from '@/types/host';

type FoundResourcesBannerProps = {
  resources: HostInventoryResource[];
};

export function FoundResourcesBanner({ resources }: FoundResourcesBannerProps) {
  const found = resources.filter((resource) => resource.ownershipState !== 'owned_managed' && !resource.ignored);
  if (!found.length) {
    return null;
  }
  return (
    <section className="rounded-po-lg border border-amber-300/25 bg-amber-500/10 p-4 text-amber-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-po-sm bg-amber-500/15 text-amber-200">
            <AlertTriangle className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="m-0 text-sm font-bold text-white">Existing apps found on this server</p>
              <StatusPill tone="warning">{found.length} found</StatusPill>
            </div>
            <p className="m-0 mt-1 text-sm leading-5 text-amber-100/80">
              Project OS found {found.length} app{found.length === 1 ? '' : 's'} or Docker resource{found.length === 1 ? '' : 's'} that are not managed by this installation.
            </p>
          </div>
        </div>
        <Button asChild className="shrink-0" size="sm" variant="outline">
          <Link to="/apps/found">Review</Link>
        </Button>
      </div>
    </section>
  );
}
