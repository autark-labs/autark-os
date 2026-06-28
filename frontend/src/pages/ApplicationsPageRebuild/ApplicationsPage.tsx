import { useMemo, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { BasicApplicationsView } from './BasicApplicationsView';
import { AdvancedApplicationsView } from './AdvancedApplicationsView';
import type { ApplicationSurfaceItem } from './ApplicationsPage.types';

const sampleItems: ApplicationSurfaceItem[] = [
  {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    kind: 'managed',
    status: 'Ready',
    access: 'Private',
    backup: 'Protected',
    nextStep: 'Open',
    description: 'Password vault managed by this Project OS.',
    href: 'https://vault.example.test',
  },
  {
    id: 'immich',
    name: 'Immich',
    kind: 'managed',
    status: 'Needs review',
    access: 'Private',
    backup: 'Needs backup',
    nextStep: 'Review backup',
    description: 'Photo library needs a restore point before the next import.',
    href: 'https://photos.example.test',
  },
  {
    id: 'home-assistant',
    name: 'Home Assistant',
    kind: 'managed',
    status: 'Paused',
    access: 'Local only',
    backup: 'Protected',
    nextStep: 'Start',
    description: 'Automation server is installed but currently paused.',
  },
  {
    id: 'router-admin',
    name: 'Router Admin',
    kind: 'pinned',
    status: 'Pinned',
    access: 'Open',
    backup: 'Not managed',
    nextStep: 'Open',
    description: 'Pinned shortcut. Project OS opens it but does not manage it.',
    href: 'http://192.168.1.1',
  },
  {
    id: 'legacy-jellyfin',
    name: 'Jellyfin',
    kind: 'observed',
    status: 'Found',
    access: 'Local only',
    backup: 'Not managed',
    nextStep: 'Review',
    description: 'Found on this machine. Not owned by this Project OS instance.',
    href: 'http://localhost:8096',
  },
];

export const ApplicationsPage = () => {
  const { viewMode } = useProjectSettings();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(sampleItems[0]?.id ?? '');

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return sampleItems;
    }

    return sampleItems.filter((item) => {
      return [item.name, item.kind, item.status, item.access, item.backup, item.nextStep, item.description]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [query]);

  const selectedItem = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  const managedCount = sampleItems.filter((item) => item.kind === 'managed').length;
  const pinnedCount = sampleItems.filter((item) => item.kind === 'pinned').length;
  const observedCount = sampleItems.filter((item) => item.kind === 'observed').length;

  return (
    <main className="min-h-full bg-neutral-100 text-neutral-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6">
        <header className="rounded-2xl border border-neutral-300 bg-white">
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex max-w-3xl flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-neutral-950 text-white">Applications</Badge>
                <Badge className="bg-emerald-600 text-white">Design frame</Badge>
                <Badge className="bg-neutral-200 text-neutral-950">{viewMode === 'advanced' ? 'Advanced view' : 'Basic view'}</Badge>
              </div>
              <div className="flex flex-col gap-2">
                <h1 className="text-4xl font-semibold tracking-tight text-neutral-950">Your apps and services</h1>
                <p className="text-base leading-7 text-neutral-700">
                  A simpler parent page for browsing installed apps, pinned shortcuts, and services Project OS found locally.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <Input
                  aria-label="Search apps and services"
                  className="border-neutral-300 bg-white pl-9 text-neutral-950 placeholder:text-neutral-500"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search apps and services"
                  value={query}
                />
              </div>
              <Button className="bg-neutral-950 text-white hover:bg-neutral-800" type="button">
                <Plus data-icon="inline-start" />
                Add
              </Button>
            </div>
          </div>

          <Separator className="bg-neutral-300" />

          <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="grid gap-3 sm:grid-cols-3">
              <PageMetric label="Managed" value={managedCount} />
              <PageMetric label="Pinned" value={pinnedCount} />
              <PageMetric label="Found" value={observedCount} />
            </div>

            <div className="rounded-xl border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
              Use the sidebar view-mode control to switch page detail.
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {viewMode === 'basic' ? (
            <BasicApplicationsView items={visibleItems} onSelect={setSelectedId} selectedId={selectedItem?.id} />
          ) : (
            <AdvancedApplicationsView items={visibleItems} onSelect={setSelectedId} selectedId={selectedItem?.id} />
          )}

          <Card className="h-fit overflow-visible rounded-2xl border-neutral-300 bg-white shadow-none lg:sticky lg:top-5">
            <CardHeader>
              <CardTitle className="text-neutral-950">Selected item</CardTitle>
              <CardDescription className="text-neutral-600">Placeholder for the future details drawer and contextual help.</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedItem ? (
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-neutral-950">{selectedItem.name}</h2>
                    <p className="mt-1 text-sm text-neutral-700">{selectedItem.description}</p>
                  </div>
                  <div className="grid gap-2 text-sm">
                    <InfoRow label="Type" value={labelForKind(selectedItem.kind)} />
                    <InfoRow label="State" value={selectedItem.status} />
                    <InfoRow label="Access" value={selectedItem.access} />
                    <InfoRow label="Backup" value={selectedItem.backup} />
                  </div>
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700" type="button">
                    {selectedItem.nextStep}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-neutral-600">No item selected.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <footer className="flex flex-col gap-3 rounded-2xl border border-neutral-300 bg-white p-4 text-sm text-neutral-700 md:flex-row md:items-center md:justify-between">
          <span>This is a design-only frame. Runtime management stays intentionally out of this pass.</span>
          <Button className="border-neutral-300 text-neutral-900" type="button" variant="outline">
            <RefreshCw data-icon="inline-start" />
            Refresh frame
          </Button>
        </footer>
      </div>
    </main>
  );
};

function PageMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-28 rounded-xl border border-neutral-300 bg-neutral-100 px-4 py-3">
      <div className="text-2xl font-semibold text-neutral-950">{value}</div>
      <div className="text-sm text-neutral-600">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-neutral-100 px-3 py-2">
      <span className="text-neutral-600">{label}</span>
      <span className="font-medium text-neutral-950">{value}</span>
    </div>
  );
}

function labelForKind(kind: ApplicationSurfaceItem['kind']) {
  if (kind === 'managed') {
    return 'Managed app';
  }
  if (kind === 'pinned') {
    return 'Pinned app';
  }
  return 'Found service';
}
