import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { ApplicationDetailsRail } from './ApplicationDetailsRail';
import { BasicApplicationsView } from './BasicApplicationsView';
import { AdvancedApplicationsView } from './AdvancedApplicationsView';
import { initialApplicationItems } from './extensions/ApplicationsPage.mockData';
import type { ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type ApplicationFilter = 'all' | 'managed' | 'pinned' | 'found' | 'needs_review';

export const ApplicationsPage = () => {
  const { viewMode } = useProjectSettings();
  const [items, setItems] = useState<ApplicationSurfaceItem[]>(initialApplicationItems);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ApplicationFilter>('all');
  const [managementOpen, setManagementOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(initialApplicationItems[0]?.id ?? '');
  const railRef = useRef<HTMLDivElement | null>(null);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesFilter =
        filter === 'all'
        || (filter === 'managed' && item.kind === 'managed')
        || (filter === 'pinned' && item.kind === 'pinned')
        || (filter === 'found' && item.kind === 'observed')
        || (filter === 'needs_review' && Boolean(item.nextAction));

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [item.name, item.kind, item.status, item.access, item.backup, item.nextAction?.label ?? '', item.description]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, items, query]);

  const selectedItem = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  const managedCount = items.filter((item) => item.kind === 'managed').length;
  const pinnedCount = items.filter((item) => item.kind === 'pinned').length;
  const attentionCount = items.filter((item) => item.runtimeState === 'needs_attention' || item.nextAction).length;
  const nextReviewItem = visibleItems.find((item) => item.nextAction) ?? items.find((item) => item.nextAction) ?? null;

  useEffect(() => {
    if (!managementOpen) {
      return undefined;
    }

    const ensureRailVisible = () => {
      const rail = railRef.current;
      if (!rail) {
        return;
      }

      const margin = 20;
      const rect = rail.getBoundingClientRect();
      const availableHeight = window.innerHeight - margin * 2;
      let scrollDelta = 0;

      if (rect.height <= availableHeight) {
        if (rect.bottom > window.innerHeight - margin) {
          scrollDelta = rect.bottom - window.innerHeight + margin;
        } else if (rect.top < margin) {
          scrollDelta = rect.top - margin;
        }
      } else if (rect.top > margin || rect.top < margin) {
        scrollDelta = rect.top - margin;
      }

      if (Math.abs(scrollDelta) > 1) {
        window.scrollTo({ behavior: 'smooth', top: window.scrollY + scrollDelta });
      }
    };

    const scrollTimers = [0, 160, 340].map((delay) => window.setTimeout(ensureRailVisible, delay));

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && railRef.current?.contains(target)) {
        return;
      }

      setManagementOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      scrollTimers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [managementOpen]);

  const handleFilterChange = (nextFilter: string) => {
    if (!nextFilter || nextFilter === filter) {
      return;
    }

    setFilter(nextFilter as ApplicationFilter);
  };

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
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-5 p-4 md:p-5 2xl:px-6">
        <header className="rounded-2xl border border-sky-400/30 bg-slate-900 shadow-xl shadow-slate-950/30">
          <div className="flex flex-col gap-2 p-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex max-w-3xl flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-semibold tracking-tight text-white">Your apps and services</h1>
                <p className="max-w-2xl text-sm leading-6 text-sky-100/80">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae arcu sed tortor facilisis
                  volutpat.
                </p>
              </div>
            </div>
          </div>

          <Separator className="bg-sky-400/20" />

          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <PageMetric label="Managed" value={managedCount} />
            <PageMetric label="Pinned" value={pinnedCount} />
            <PageMetric label="Needs review" value={attentionCount} />
          </div>
        </header>

        <section className="rounded-2xl border border-sky-400/30 bg-slate-900 p-3 shadow-xl shadow-slate-950/20">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/70" />
              <Input
                aria-label="Search apps and services"
                className="h-9 border-sky-400/40 bg-slate-800 pl-9 text-white placeholder:text-sky-100/50 focus-visible:border-cyan-300"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search apps and services"
                value={query}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between xl:justify-end">
              <ToggleGroup
                aria-label="Filter apps and services"
                className="flex-wrap"
                onValueChange={handleFilterChange}
                size="sm"
                type="single"
                value={filter}
                variant="outline"
              >
                <ToggleGroupItem className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="all">
                  All
                </ToggleGroupItem>
                <ToggleGroupItem className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="managed">
                  Managed
                </ToggleGroupItem>
                <ToggleGroupItem className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="pinned">
                  Pinned
                </ToggleGroupItem>
                <ToggleGroupItem className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="found">
                  Found
                </ToggleGroupItem>
                <ToggleGroupItem className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="needs_review">
                  Needs review
                </ToggleGroupItem>
              </ToggleGroup>

              <Button
                className="bg-orange-500 text-white shadow-md shadow-orange-700/20 hover:bg-orange-400"
                disabled={!nextReviewItem}
                onClick={() => {
                  if (nextReviewItem) {
                    setQuery('');
                    setFilter('needs_review');
                    setSelectedId(nextReviewItem.id);
                  }
                }}
                type="button"
              >
                <AlertTriangle data-icon="inline-start" />
                Review next
              </Button>
            </div>
          </div>
        </section>

        <section className="grid min-h-[44rem] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {viewMode === 'basic' ? (
            <BasicApplicationsView
              items={visibleItems}
              managementOpen={managementOpen}
              onSelect={setSelectedId}
              onUninstall={handleUninstall}
              selectedId={selectedItem?.id}
            />
          ) : (
            <div className="max-h-[44rem] min-h-[44rem] overflow-y-auto pr-1">
              <AdvancedApplicationsView
                actions={actions}
                items={visibleItems}
                managementOpen={managementOpen}
                onSelect={setSelectedId}
                selectedId={selectedItem?.id}
              />
            </div>
          )}

          <ApplicationDetailsRail
            actions={actions}
            item={selectedItem}
            managementOpen={managementOpen}
            onManagementOpenChange={setManagementOpen}
            ref={railRef}
          />
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
