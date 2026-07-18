import { ExternalLink, KeyRound, Link2, Server } from 'lucide-react';
import { CopyField } from '@/components/autark-os/CopyField';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSettingsDialog } from '@/contexts/SettingsDialogContext';
import { accessDeepLinkForManagedApp, accessDeepLinkForObservedService } from '@/pages/NetworkPage/extensions/NetworkPage.deepLinks';
import type { ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

export function ApplicationLinksTab({ item }: { item: ApplicationSurfaceItem }) {
  const accessHref = accessRouteForApplicationItem(item);
  const { openSettings } = useSettingsDialog();

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
        <Button className="border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white" onClick={() => openSettings()} type="button" variant="outline">
          <Server data-icon="inline-start" />
          System settings
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
    <CopyField
      action={canOpen && value ? (
        <Button asChild className="border-sky-400/30 bg-slate-800 text-sky-50 hover:bg-slate-700" size="sm" variant="outline">
          <a href={value} rel="noreferrer" target="_blank">
            <ExternalLink data-icon="inline-start" />
            Open
          </a>
        </Button>
      ) : undefined}
      icon={Icon}
      model={{ emptyLabel: 'Not configured', label: `${label} link`, value }}
    />
  );
}
