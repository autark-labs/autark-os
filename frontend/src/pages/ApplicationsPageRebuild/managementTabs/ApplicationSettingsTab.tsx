import { Container, KeyRound, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { ApplicationActionHandlers, ApplicationSettingsAction, ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

type ApplicationSettingsTabProps = {
  actions: Pick<ApplicationActionHandlers, 'onAutoRepairChange' | 'onPrivateAccessChange'>;
  item: ApplicationSurfaceItem;
  loadingAction: ApplicationSettingsAction | null;
};

export function ApplicationSettingsTab({ actions, item, loadingAction }: ApplicationSettingsTabProps) {
  const editable = item.kind === 'managed' && item.settings.canEdit;
  const savingAutoRepair = loadingAction === 'auto_repair';
  const savingPrivateAccess = loadingAction === 'private_access';

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
        <SettingsSectionHeader
          icon={Container}
          status={item.settings.autoRepairEnabled ? 'Automatic fixes on' : 'Watching only'}
          title="Container posture"
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <PostureFact label="Runtime" value={item.settings.containerStatus || item.status} />
          <PostureFact label="Detail" value={item.settings.containerDetail} />
        </div>

        <ToggleRow
          checked={item.settings.autoRepairEnabled}
          disabled={!editable || Boolean(loadingAction)}
          label="Safe automatic repair"
          loading={savingAutoRepair}
          note="Project OS can attempt safe restart-style fixes when this app drifts."
          onCheckedChange={(checked) => actions.onAutoRepairChange(item.id, checked)}
        />
      </section>

      <section className="grid gap-3 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
        <SettingsSectionHeader
          icon={KeyRound}
          status={item.settings.tailscaleEnabled ? 'Private access selected' : 'Local access'}
          title="Tailscale posture"
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <PostureFact label="Desired access" value={accessModeLabel(item.settings.desiredAccessMode)} />
          <PostureFact label="Private link" value={privateLinkLabel(item)} />
        </div>

        <ToggleRow
          checked={item.settings.tailscaleEnabled}
          disabled={!editable || Boolean(loadingAction)}
          label="Private access"
          loading={savingPrivateAccess}
          note="Uses Tailscale for trusted-device app links."
          onCheckedChange={(checked) => actions.onPrivateAccessChange(item.id, checked)}
        />

        {!editable && (
          <p className="rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2 text-xs leading-5 text-sky-100/70">
            Found and pinned services are read-only here. Review or recover the service before Project OS changes its container or access posture.
          </p>
        )}
      </section>
    </div>
  );
}

function SettingsSectionHeader({ icon: Icon, status, title }: { icon: LucideIcon; status: string; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 text-cyan-200" />
        <span className="truncate text-sm font-semibold text-white">{title}</span>
      </div>
      <Badge className="bg-slate-900 text-sky-50">{status}</Badge>
    </div>
  );
}

function PostureFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-900 px-3 py-2">
      <p className="text-xs font-medium text-sky-100/60">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value || 'Not reported'}</p>
    </div>
  );
}

function ToggleRow({
  checked,
  disabled,
  label,
  loading,
  note,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  loading: boolean;
  note: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2',
        disabled && 'opacity-80',
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-1 text-xs leading-5 text-sky-100/60">{note}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {loading && (
          <Button className="pointer-events-none border-sky-400/30 bg-slate-800 text-sky-50" size="sm" type="button" variant="outline">
            <Loader2 className="animate-spin" data-icon="inline-start" />
            Saving
          </Button>
        )}
        <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} size="sm" />
      </div>
    </div>
  );
}

function accessModeLabel(mode: string) {
  if (mode === 'local-and-private') return 'Local and private';
  if (mode === 'private') return 'Private only';
  if (mode === 'public') return 'Public';
  if (mode === 'network') return 'Network';
  return 'Local';
}

function privateLinkLabel(item: ApplicationSurfaceItem) {
  if (item.settings.privateAccessUrl) {
    return item.settings.privateAccessUrl;
  }
  if (item.settings.privateLinkStatus === 'configured') {
    return 'Configured';
  }
  if (item.settings.privateAccessRequired) {
    return 'Required';
  }
  return item.settings.privateLinkStatus || 'Not configured';
}
