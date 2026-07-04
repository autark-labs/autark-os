import { Copy, ExternalLink, KeyRound, Link2, Server } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { accessDeepLinkForManagedApp, accessDeepLinkForObservedService } from '@/pages/NetworkPage/extensions/NetworkPage.deepLinks';
import type { ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

export function ApplicationLinksTab({ item }: { item: ApplicationSurfaceItem }) {
  const accessHref = accessRouteForApplicationItem(item);

  return (
    <div className="grid gap-4">
      <section className="grid gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
        <LiveLinkRow icon={ExternalLink} label="Open" value={item.links.primaryUrl} />
        <LiveLinkRow icon={KeyRound} label="Private" value={item.links.privateUrl} />
        <LiveLinkRow icon={Server} label="Local" value={item.links.localUrl} />
        <LiveLinkRow icon={Link2} label="Backend" value={item.links.backendTargetUrl} />
      </section>

      <section className="grid gap-2 sm:grid-cols-2">
        <Button asChild className="border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white" variant="outline">
          <Link to={accessHref}>
            <KeyRound data-icon="inline-start" />
            Access
          </Link>
        </Button>
        <Button asChild className="border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white" variant="outline">
          <Link to="/settings">
            <Server data-icon="inline-start" />
            System settings
          </Link>
        </Button>
      </section>
    </div>
  );
}

function accessRouteForApplicationItem(item: ApplicationSurfaceItem) {
  const itemId = item.sourceId || item.id;
  if (item.managementState === 'managed' && itemId) {
    return accessDeepLinkForManagedApp(itemId);
  }
  if ((item.managementState === 'found' || item.managementState === 'linked') && item.sourceId) {
    return accessDeepLinkForObservedService(item.sourceId);
  }
  return '/access';
}

function LiveLinkRow({ icon: Icon, label, value }: { icon: typeof ExternalLink; label: string; value?: string }) {
  const canOpen = Boolean(value && /^https?:\/\//i.test(value));

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-900 px-3 py-2">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs font-medium text-sky-100/60">
          <Icon data-icon="inline-start" />
          {label}
        </p>
        <p className="mt-1 truncate font-mono text-xs text-white">{value || 'Not configured'}</p>
      </div>
      {value && (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            aria-label={`Copy ${label} link`}
            className="border-sky-400/30 bg-slate-800 text-sky-50 hover:bg-slate-700"
            onClick={() => void navigator.clipboard?.writeText(value)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <Copy />
          </Button>
          {canOpen && (
            <Button asChild className="border-sky-400/30 bg-slate-800 text-sky-50 hover:bg-slate-700" size="sm" variant="outline">
              <a href={value} rel="noreferrer" target="_blank">
                <ExternalLink data-icon="inline-start" />
                Open
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
