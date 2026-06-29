import {
  Activity,
  Archive,
  Copy,
  Cpu,
  Download,
  Network,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ExpandedOperationStatus } from './components/AppOperationStatus';
import { labelForManagementState, labelForReadiness } from './components/AppStateBadges';
import { ApplicationLinksTab } from './managementTabs/ApplicationLinksTab';
import { ApplicationSettingsTab } from './managementTabs/ApplicationSettingsTab';
import type { ApplicationActionHandlers, ApplicationSettingsAction, ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type ApplicationManagementPanelProps = {
  actions: Pick<ApplicationActionHandlers, 'onDirtyChange' | 'onSaveSettings' | 'onSettingsPlanRequest'>;
  item: ApplicationSurfaceItem;
  settingsLoadingAction?: ApplicationSettingsAction | null;
  variant?: 'inline' | 'rail';
};

export function ApplicationManagementPanel({ actions, item, settingsLoadingAction = null, variant = 'inline' }: ApplicationManagementPanelProps) {
  const managed = item.managementState === 'managed';
  const rail = variant === 'rail';
  const mock = appManagementMock(item);

  return (
    <section
      className={cn(
        'bg-slate-900 text-slate-50',
        rail
          ? 'min-h-full'
          : 'animate-in fade-in-0 slide-in-from-top-2 rounded-2xl border border-cyan-300/40 shadow-2xl shadow-cyan-950/40',
      )}
    >
      <Tabs className="gap-0" defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto rounded-none border-b border-sky-400/20 bg-slate-900 px-3 py-2" variant="line">
          <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white" value="overview">Overview</TabsTrigger>
          <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white" value="guide">Guide</TabsTrigger>
          <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white" value="settings">Settings</TabsTrigger>
          <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white" value="telemetry">Telemetry</TabsTrigger>
          <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white" value="links">Links</TabsTrigger>
          <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white" value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <div className="p-4">
          <ExpandedOperationStatus item={item} className="mb-4" />

          <TabsContent className="grid gap-4" value="overview">
            <section className="grid gap-2 sm:grid-cols-2">
              <Detail label="Repair" value={mock.repair} />
              <Detail label="Container" value={mock.container} />
              <Detail label="Storage" value={mock.storage} />
              <Detail label="Policy" value={managed ? 'Plan before apply' : 'Read only'} />
            </section>

            {item.managementState === 'found' && (
              <section className="grid gap-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-amber-100">Found service</span>
                  <Badge className="border-amber-300/30 bg-slate-900 text-amber-100" variant="outline">Not managed</Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button className="border-amber-300/30 bg-slate-900 text-amber-100 hover:bg-slate-800" type="button" variant="outline">
                    <Search data-icon="inline-start" />
                    Match
                  </Button>
                  <Button className="border-amber-300/30 bg-slate-900 text-amber-100 hover:bg-slate-800" type="button" variant="outline">
                    <ShieldCheck data-icon="inline-start" />
                    Adopt
                  </Button>
                  <Button asChild className="border-amber-300/30 bg-slate-900 text-amber-100 hover:bg-slate-800" variant="outline">
                    <Link to="/discover">
                      <Download data-icon="inline-start" />
                      Install copy
                    </Link>
                  </Button>
                </div>
              </section>
            )}

            <DangerZone itemName={item.name} managed={managed} />
          </TabsContent>

          <TabsContent className="grid gap-4" value="guide">
            <section className="grid gap-3 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">Use</span>
                <Badge className="bg-slate-900 text-sky-50">{managed ? 'Prepared' : 'Shortcut'}</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <CopyValue label="Primary URL" value={item.href || mock.localUrl} />
                <CopyValue label="Admin user" value={mock.adminUser} />
                <CopyValue label="Setup token" sensitive value={mock.setupToken} />
                <CopyValue label="Data folder" value={mock.storage} />
              </div>
            </section>

            <section className="grid gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
              <span className="text-sm font-semibold text-white">Setup</span>
              <StepRow index={1} text="Open the app from the control panel." />
              <StepRow index={2} text="Use the setup values only if the app asks for them." />
              <StepRow index={3} text="Return here for access, backup, or recovery changes." />
            </section>
          </TabsContent>

          <TabsContent className="grid gap-4" value="settings">
            <ApplicationSettingsTab actions={actions} item={item} loadingAction={settingsLoadingAction} />
          </TabsContent>

          <TabsContent className="grid gap-4" value="telemetry">
            <section className="grid gap-3 sm:grid-cols-2">
              <MetricBar icon={Cpu} label="CPU" value={mock.cpu} />
              <MetricBar icon={Archive} label="Memory" value={mock.memory} />
              <MetricBar icon={Network} label="Network" text={mock.network} />
              <MetricBar icon={Activity} label="Disk I/O" text={mock.disk} />
            </section>
            <section className="grid gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">Health check</span>
                <Badge className="bg-slate-900 text-sky-50">{labelForReadiness(item.readinessState)}</Badge>
              </div>
              <Detail label="Checked" value={mock.checkedAt} />
              <Detail label="Container" value={mock.container} />
            </section>
          </TabsContent>

          <TabsContent className="grid gap-4" value="links">
            <ApplicationLinksTab item={item} />
          </TabsContent>

          <TabsContent className="grid gap-4" value="advanced">
            <Accordion className="rounded-xl border border-sky-400/20 bg-slate-800 px-3" collapsible defaultValue="runtime" type="single">
              <AccordionItem value="runtime">
                <AccordionTrigger className="text-sky-50">Runtime details</AccordionTrigger>
                <AccordionContent className="grid gap-2">
                  <Detail label="Compose project" value={mock.composeProject} />
                  <Detail label="Runtime path" value={mock.runtimePath} />
                  <Detail label="Version" value={mock.version} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="template">
                <AccordionTrigger className="text-sky-50">Template values</AccordionTrigger>
                <AccordionContent className="grid gap-2 sm:grid-cols-2">
                  <Detail label="Image" value={mock.image} />
                  <Detail label="Category" value={labelForManagementState(item.managementState)} />
                  <Detail label="Port" value={mock.port} />
                  <Detail label="Policy" value={managed ? 'Plan before apply' : 'Read only'} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="events">
                <AccordionTrigger className="text-sky-50">Recent events</AccordionTrigger>
                <AccordionContent className="grid gap-2">
                  <ActivityRow label={item.lastEvent || 'State checked'} value="Just now" />
                  <ActivityRow label={`${item.access} access reviewed`} value="Today" />
                  <ActivityRow label={`${item.backup} backup status`} value="Today" />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-900 px-3 py-2">
      <p className="text-xs font-medium text-sky-100/60">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function CopyValue({ label, sensitive = false, value }: { label: string; sensitive?: boolean; value: string }) {
  return (
    <div className="grid gap-2 rounded-lg bg-slate-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-sky-100/60">{label}</span>
        <Button
          aria-label={`Copy ${label}`}
          className="border-sky-400/30 bg-slate-800 text-sky-50 hover:bg-slate-700"
          onClick={() => void navigator.clipboard?.writeText(value)}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <Copy />
        </Button>
      </div>
      <p className="truncate font-mono text-xs text-white">{sensitive ? '••••••••••••' : value}</p>
    </div>
  );
}

function StepRow({ index, text }: { index: number; text: string }) {
  return (
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-sky-50">
      <span className="grid size-6 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-sky-100">{index}</span>
      <span className="leading-6">{text}</span>
    </div>
  );
}

function MetricBar({ icon: Icon, label, text, value }: { icon: typeof Cpu; label: string; text?: string; value?: number }) {
  return (
    <div className="rounded-xl border border-sky-400/20 bg-slate-800 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <Icon data-icon="inline-start" />
          {label}
        </span>
        <span className="text-xs text-sky-100/60">{text || `${value}%`}</span>
      </div>
      {typeof value === 'number' && <Progress className="mt-3 bg-slate-900" value={value} />}
    </div>
  );
}

function DangerZone({ itemName, managed }: { itemName: string; managed: boolean }) {
  return (
    <section className="rounded-xl border border-red-400/25 bg-red-500/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-red-100">Uninstall</p>
          <p className="text-xs text-red-100/70">{managed ? 'Data is preserved by default.' : 'Observed services are not managed.'}</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="border-red-300/30 bg-slate-900 text-red-100 hover:bg-red-950" size="sm" type="button" variant="outline">
              <Trash2 data-icon="inline-start" />
              Review
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-slate-950 text-slate-50">
            <AlertDialogHeader>
              <AlertDialogTitle>Uninstall {itemName}?</AlertDialogTitle>
              <AlertDialogDescription>
                This wireframe keeps data by default and would show a reviewed uninstall plan before applying changes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <PlanList title="Will remove" items={['App container', 'Project OS app record', 'Runtime shortcut']} />
              <PlanList title="Will keep" items={['App data folder', 'Backup metadata', 'Support events']} />
            </div>
            <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              Safety checkpoint planned
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 text-white hover:bg-red-500">Keep data and uninstall</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}

function PlanList({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="rounded-lg border border-slate-700/40 bg-slate-900 p-3">
      <p className="text-xs font-semibold text-sky-100/60">{title}</p>
      <ul className="mt-2 grid gap-1 text-sm text-slate-200">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function ActivityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2">
      <span className="min-w-0 truncate text-sm text-sky-50">{label}</span>
      <span className="shrink-0 text-xs text-sky-100/60">{value}</span>
    </div>
  );
}

function appManagementMock(item: ApplicationSurfaceItem) {
  const seed = item.id.length;
  return {
    backendTarget: `http://127.0.0.1:${8000 + seed}`,
    checkedAt: '2 min ago',
    composeProject: `project-os-${item.id}`,
    container: item.readinessState === 'ready' ? 'healthy' : item.readinessState === 'paused' || item.readinessState === 'stopped' ? 'stopped' : 'attention',
    cpu: Math.min(92, 8 + seed * 3),
    disk: `${seed + 2} MB/s`,
    image: `${item.id}:stable`,
    localUrl: item.href?.startsWith('http://localhost') ? item.href : `http://localhost:${8000 + seed}`,
    memory: Math.min(88, 22 + seed * 2),
    network: `${seed * 4} KB/s`,
    port: String(8000 + seed),
    privateUrl: `https://${item.id}.tailnet.example`,
    repair: item.attentionState !== 'none' ? 'Needs review' : 'Ready',
    runtimePath: `/var/lib/project-os/apps/${item.id}`,
    storage: `${item.id}-data`,
    adminUser: item.managementState === 'managed' ? 'admin' : 'Not managed',
    setupToken: `${item.id.slice(0, 4)}-${seed}-setup`,
    version: '2026.6',
  };
}
