import {
  Activity,
  Archive,
  Cpu,
  ExternalLink,
  Info,
  KeyRound,
  Link2,
  Network,
  Server,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { labelForKind } from './extensions/ApplicationVisuals';
import type { ApplicationActionHandlers, ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type ApplicationManagementPanelProps = {
  actions: ApplicationActionHandlers;
  item: ApplicationSurfaceItem;
  variant?: 'inline' | 'rail';
};

export function ApplicationManagementPanel({ item, variant = 'inline' }: ApplicationManagementPanelProps) {
  const managed = item.kind === 'managed';
  const rail = variant === 'rail';
  const mock = appManagementMock(item);

  return (
    <TooltipProvider>
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
            <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white" value="settings">Settings</TabsTrigger>
            <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white" value="telemetry">Telemetry</TabsTrigger>
            <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white" value="links">Links</TabsTrigger>
            <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white" value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <div className="p-4">
            <TabsContent className="grid gap-4" value="overview">
              <section className="grid gap-2 sm:grid-cols-2">
                <Detail label="Repair" value={mock.repair} />
                <Detail label="Container" value={mock.container} />
                <Detail label="Storage" value={mock.storage} />
                <Detail label="Policy" value={managed ? 'Plan before apply' : 'Read only'} />
              </section>

              <DangerZone itemName={item.name} managed={managed} />
            </TabsContent>

            <TabsContent className="grid gap-4" value="settings">
              <section className="grid gap-3 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
                <CompactField help="Primary link used by the Open button." label="Open URL">
                  <Input className="border-sky-400/30 bg-slate-900 text-sky-50" readOnly value={item.href || 'No link configured'} />
                </CompactField>

                <div className="grid gap-3 sm:grid-cols-2">
                  <SettingToggle checked={managed && item.access === 'Private'} help="Private links are managed from Access." label="Private access" />
                  <SettingToggle checked={managed && item.backup === 'Protected'} help="Backup schedule is controlled globally." label="Backup protection" />
                  <SettingToggle checked={managed} help="Project OS can attempt safe restart-style repairs." label="Self repair" />
                  <SettingToggle checked={item.kind !== 'observed'} help="Pinned apps appear in app shortcuts." label="Pinned shortcut" />
                </div>
              </section>

              <section className="grid gap-3 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white">Storage</span>
                  <HelpTip content="Folder edits are shown here as a wireframe. Real changes should be plan-then-apply." />
                </div>
                <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <Input className="border-sky-400/30 bg-slate-900 text-sky-50" readOnly value="data" />
                  <Input className="border-sky-400/30 bg-slate-900 text-sky-50" readOnly value={mock.storage} />
                  <Input className="border-sky-400/30 bg-slate-900 text-sky-50" readOnly value="config" />
                  <Input className="border-sky-400/30 bg-slate-900 text-sky-50" readOnly value={`${item.id}-config`} />
                </div>
              </section>
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
                  <Badge className="bg-slate-900 text-sky-50">{item.status}</Badge>
                </div>
                <Detail label="Checked" value={mock.checkedAt} />
                <Detail label="Container" value={mock.container} />
              </section>
            </TabsContent>

            <TabsContent className="grid gap-4" value="links">
              <section className="grid gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
                <LinkRow icon={ExternalLink} label="Open" value={item.href || null} />
                <LinkRow icon={KeyRound} label="Private" value={item.access === 'Private' ? mock.privateUrl : null} />
                <LinkRow icon={Server} label="Local" value={mock.localUrl} />
                <LinkRow icon={Link2} label="Backend" value={managed ? mock.backendTarget : null} />
              </section>
              <section className="grid gap-2 sm:grid-cols-2">
                <Button asChild className="border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white" variant="outline">
                  <Link to="/access">
                    <KeyRound data-icon="inline-start" />
                    Access
                  </Link>
                </Button>
                <Button asChild className="border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white" variant="outline">
                  <Link to="/backups">
                    <ShieldCheck data-icon="inline-start" />
                    Backups
                  </Link>
                </Button>
              </section>
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
                    <Detail label="Category" value={managed ? 'Managed app' : labelForKind(item.kind)} />
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
    </TooltipProvider>
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

function HelpTip({ content }: { content: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label="More information" className="size-7 border-sky-400/30 bg-slate-900 text-sky-100 hover:bg-slate-700" size="icon-sm" type="button" variant="outline">
          <Info />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}

function CompactField({ children, help, label }: { children: React.ReactNode; help: string; label: string }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm text-sky-50">{label}</Label>
        <HelpTip content={help} />
      </div>
      {children}
    </div>
  );
}

function SettingToggle({ checked, help, label }: { checked: boolean; help: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-900 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-white">{label}</span>
        <HelpTip content={help} />
      </div>
      <Switch checked={checked} size="sm" />
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

function LinkRow({ icon: Icon, label, value }: { icon: typeof ExternalLink; label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-900 px-3 py-2">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs font-medium text-sky-100/60">
          <Icon data-icon="inline-start" />
          {label}
        </p>
        <p className="mt-1 truncate font-mono text-xs text-white">{value || 'Not configured'}</p>
      </div>
      {value && /^https?:\/\//i.test(value) && (
        <Button asChild className="border-sky-400/30 bg-slate-800 text-sky-50 hover:bg-slate-700" size="sm" variant="outline">
          <a href={value} rel="noreferrer" target="_blank">
            <ExternalLink data-icon="inline-start" />
            Open
          </a>
        </Button>
      )}
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
    container: item.runtimeState === 'running' ? 'healthy' : item.runtimeState === 'paused' ? 'stopped' : 'attention',
    cpu: Math.min(92, 8 + seed * 3),
    disk: `${seed + 2} MB/s`,
    image: `${item.id}:stable`,
    localUrl: item.href?.startsWith('http://localhost') ? item.href : `http://localhost:${8000 + seed}`,
    memory: Math.min(88, 22 + seed * 2),
    network: `${seed * 4} KB/s`,
    port: String(8000 + seed),
    privateUrl: `https://${item.id}.tailnet.example`,
    repair: item.runtimeState === 'needs_attention' ? 'Needs review' : 'Ready',
    runtimePath: `/var/lib/project-os/apps/${item.id}`,
    storage: `${item.id}-data`,
    version: '2026.6',
  };
}
