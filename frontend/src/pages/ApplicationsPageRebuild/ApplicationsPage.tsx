import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Pause, Play, RotateCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { ApplicationIcon, labelForKind } from './ApplicationVisuals';
import { BasicApplicationsView } from './BasicApplicationsView';
import { AdvancedApplicationsView } from './AdvancedApplicationsView';
import type { ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

const initialItems: ApplicationSurfaceItem[] = [
  {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    kind: 'managed',
    status: 'Ready',
    runtimeState: 'running',
    access: 'Private',
    backup: 'Protected',
    description: 'Password vault managed by this Project OS.',
    href: 'https://vault.example.test',
    iconUrl: '/app-images/vaultwarden.svg',
    lastEvent: 'Running normally',
  },
  {
    id: 'immich',
    name: 'Immich',
    kind: 'managed',
    status: 'Needs review',
    runtimeState: 'needs_attention',
    access: 'Private',
    backup: 'Needs backup',
    nextAction: {
      id: 'create_backup',
      label: 'Create backup',
      description: 'Create a restore point before the next import.',
    },
    description: 'Photo library needs a restore point before the next import.',
    href: 'https://photos.example.test',
    iconUrl: '/app-images/immich.svg',
    lastEvent: 'Backup protection needs review',
  },
  {
    id: 'home-assistant',
    name: 'Home Assistant',
    kind: 'managed',
    status: 'Paused',
    runtimeState: 'paused',
    access: 'Local only',
    backup: 'Protected',
    nextAction: {
      id: 'start_app',
      label: 'Start app',
      description: 'Start the app so it can be opened again.',
    },
    description: 'Automation server is installed but currently paused.',
    href: 'http://localhost:8123',
    iconUrl: '/app-images/home-assistant.svg',
    lastEvent: 'Stopped by user',
  },
  {
    id: 'router-admin',
    name: 'Router Admin',
    kind: 'pinned',
    status: 'Pinned',
    runtimeState: 'shortcut',
    access: 'Open',
    backup: 'Not managed',
    description: 'Pinned shortcut. Project OS opens it but does not manage it.',
    href: 'http://192.168.1.1',
    lastEvent: 'Shortcut available',
  },
  {
    id: 'legacy-jellyfin',
    name: 'Jellyfin',
    kind: 'observed',
    status: 'Found',
    runtimeState: 'found',
    access: 'Local only',
    backup: 'Not managed',
    nextAction: {
      id: 'review_found_service',
      label: 'Review service',
      description: 'Decide whether to link, recover, or leave this service alone.',
    },
    description: 'Found on this machine. Not owned by this Project OS instance.',
    href: 'http://localhost:8096',
    iconUrl: '/app-images/jellyfin.svg',
    lastEvent: 'Found on this server',
  },
];

export const ApplicationsPage = () => {
  const { viewMode } = useProjectSettings();
  const [items, setItems] = useState<ApplicationSurfaceItem[]>(initialItems);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(initialItems[0]?.id ?? '');

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => {
      return [item.name, item.kind, item.status, item.access, item.backup, item.nextAction?.label ?? '', item.description]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [items, query]);

  const selectedItem = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  const managedCount = items.filter((item) => item.kind === 'managed').length;
  const pinnedCount = items.filter((item) => item.kind === 'pinned').length;
  const attentionCount = items.filter((item) => item.runtimeState === 'needs_attention' || item.nextAction).length;

  const handleStart = (id: string) => {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== id || item.kind !== 'managed') {
        return item;
      }

      return {
        ...item,
        status: item.backup === 'Needs backup' ? 'Needs review' : 'Ready',
        runtimeState: item.backup === 'Needs backup' ? 'needs_attention' : 'running',
        nextAction: item.backup === 'Needs backup' ? item.nextAction : undefined,
        lastEvent: 'Started just now',
      };
    }));
  };

  const handleStop = (id: string) => {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== id || item.kind !== 'managed') {
        return item;
      }

      return {
        ...item,
        status: 'Paused',
        runtimeState: 'paused',
        nextAction: {
          id: 'start_app',
          label: 'Start app',
          description: 'Start the app so it can be opened again.',
        },
        lastEvent: 'Stopped just now',
      };
    }));
  };

  const handleRestart = (id: string) => {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== id || item.kind !== 'managed') {
        return item;
      }

      return {
        ...item,
        status: item.backup === 'Needs backup' ? 'Needs review' : 'Ready',
        runtimeState: item.backup === 'Needs backup' ? 'needs_attention' : 'running',
        lastEvent: 'Restarted just now',
      };
    }));
  };

  const handleCreateBackup = (id: string) => {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== id || item.kind !== 'managed') {
        return item;
      }

      return {
        ...item,
        status: item.runtimeState === 'paused' ? 'Paused' : 'Ready',
        runtimeState: item.runtimeState === 'paused' ? 'paused' : 'running',
        backup: 'Protected',
        nextAction: item.nextAction?.id === 'create_backup' ? undefined : item.nextAction,
        lastEvent: 'Backup created just now',
      };
    }));
  };

  const handleRunNextAction = (id: string) => {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== id || !item.nextAction) {
        return item;
      }

      if (item.nextAction.id === 'start_app') {
        return {
          ...item,
          status: 'Ready',
          runtimeState: 'running',
          nextAction: undefined,
          lastEvent: 'Started just now',
        };
      }

      if (item.nextAction.id === 'create_backup') {
        return {
          ...item,
          status: 'Ready',
          runtimeState: 'running',
          backup: 'Protected',
          nextAction: undefined,
          lastEvent: 'Backup created just now',
        };
      }

      return {
        ...item,
        lastEvent: 'Review opened just now',
      };
    }));
  };

  const handleUninstall = (id: string) => {
    setItems((currentItems) => {
      const nextItems = currentItems.filter((item) => item.id !== id);
      if (selectedId === id) {
        setSelectedId(nextItems[0]?.id ?? '');
      }
      return nextItems;
    });
  };

  const actions = {
    onCreateBackup: handleCreateBackup,
    onRestart: handleRestart,
    onRunNextAction: handleRunNextAction,
    onStart: handleStart,
    onStop: handleStop,
  };

  return (
    <main className="min-h-full bg-slate-800 text-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6">
        <header className="rounded-2xl border border-sky-400/30 bg-slate-900 shadow-xl shadow-slate-950/30">
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex max-w-3xl flex-col gap-3">
              <div className="flex flex-col gap-2">
                <h1 className="text-4xl font-semibold tracking-tight text-white">Your apps and services</h1>
                <p className="text-base leading-7 text-sky-100/80">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae arcu sed tortor facilisis
                  volutpat.
                </p>
              </div>
            </div>

            <div className="relative min-w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/70" />
              <Input
                aria-label="Search apps and services"
                className="border-sky-400/40 bg-slate-800 pl-9 text-white placeholder:text-sky-100/50 focus-visible:border-cyan-300"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search apps and services"
                value={query}
              />
            </div>
          </div>

          <Separator className="bg-sky-400/20" />

          <div className="grid gap-3 p-5 sm:grid-cols-3">
            <PageMetric label="Managed" value={managedCount} />
            <PageMetric label="Pinned" value={pinnedCount} />
            <PageMetric label="Needs review" value={attentionCount} />
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {viewMode === 'basic' ? (
            <BasicApplicationsView items={visibleItems} onSelect={setSelectedId} onUninstall={handleUninstall} selectedId={selectedItem?.id} />
          ) : (
            <AdvancedApplicationsView actions={actions} items={visibleItems} onSelect={setSelectedId} selectedId={selectedItem?.id} />
          )}

          <Card className="h-fit overflow-visible rounded-2xl border border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30 ring-0 lg:sticky lg:top-5">
            <CardHeader>
              <div className="flex items-start gap-3">
                {selectedItem && <ApplicationIcon item={selectedItem} size="md" />}
                <div className="min-w-0">
                  <CardTitle className="truncate text-white">{selectedItem?.name ?? 'Selected app'}</CardTitle>
                  <CardDescription className="text-sky-100/70">{selectedItem?.description ?? 'Lorem ipsum dolor sit amet.'}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {selectedItem ? (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-2 text-sm">
                    <InfoRow label="Type" value={labelForKind(selectedItem.kind)} />
                    <InfoRow label="State" value={selectedItem.status} />
                    <InfoRow label="Access" value={selectedItem.access} />
                    <InfoRow label="Backup" value={selectedItem.backup} />
                    {selectedItem.lastEvent && <InfoRow label="Last event" value={selectedItem.lastEvent} />}
                  </div>

                  {selectedItem.href && (
                    <Button asChild className="bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-200">
                      <a href={selectedItem.href} rel="noreferrer" target="_blank">
                        <ExternalLink data-icon="inline-start" />
                        Open app
                      </a>
                    </Button>
                  )}

                  {selectedItem.kind === 'managed' && (
                    <div className="grid grid-cols-3 gap-2">
                      {selectedItem.runtimeState === 'paused' ? (
                        <Button className="border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white" onClick={() => handleStart(selectedItem.id)} type="button" variant="outline">
                          <Play data-icon="inline-start" />
                          Start
                        </Button>
                      ) : (
                        <Button className="border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white" onClick={() => handleStop(selectedItem.id)} type="button" variant="outline">
                          <Pause data-icon="inline-start" />
                          Stop
                        </Button>
                      )}
                      <Button className="col-span-2 border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white" onClick={() => handleRestart(selectedItem.id)} type="button" variant="outline">
                        <RotateCw data-icon="inline-start" />
                        Restart
                      </Button>
                    </div>
                  )}

                  {selectedItem.nextAction ? (
                    <div className="flex flex-col gap-3 rounded-xl border border-orange-400 bg-orange-200 p-4 text-orange-950 shadow-lg shadow-orange-500/20">
                      <div className="flex items-start gap-3">
                        <AlertTriangle />
                        <div>
                          <p className="font-medium">{selectedItem.nextAction.label}</p>
                          <p className="mt-1 text-sm leading-6">{selectedItem.nextAction.description}</p>
                        </div>
                      </div>
                      <Button className="bg-orange-500 text-white shadow-md shadow-orange-700/20 hover:bg-orange-400" onClick={() => handleRunNextAction(selectedItem.id)} type="button">
                        {selectedItem.nextAction.label}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-200 p-4 text-emerald-950 shadow-lg shadow-emerald-500/10">
                      <CheckCircle2 />
                      <div>
                        <p className="font-medium">{selectedItem.kind === 'managed' ? 'App fully functional' : 'No action needed'}</p>
                        <p className="mt-1 text-sm leading-6">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-sky-100/70">No item selected.</p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
};

function PageMetric({ label, value }: { label: string; value: number }) {
  const attention = label === 'Needs review' && value > 0;

  return (
    <div className={attention
      ? 'min-w-28 rounded-xl border border-orange-400 bg-orange-200 px-4 py-3 text-orange-950 shadow-lg shadow-orange-500/20'
      : 'min-w-28 rounded-xl border border-sky-400/25 bg-slate-800 px-4 py-3 text-sky-50'}
    >
      <div className="text-2xl font-semibold">{value}</div>
      <div className={attention ? 'text-sm text-orange-800' : 'text-sm text-sky-100/70'}>{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-800 px-3 py-2">
      <span className="text-sky-100/70">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}
