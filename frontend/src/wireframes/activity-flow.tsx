import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, BarChart3, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { cn } from '@/lib/utils';
import '../styles.css';
import './activity-flow.css';

const events = [
  { id: 3, category: 'backup', level: 'success', title: 'Vaultwarden backup verified', message: 'A verified restore point was saved.', app: 'Vaultwarden', time: '10:42 AM' },
  { id: 2, category: 'repair', level: 'warning', title: 'Syncthing could not restart', message: 'The restart failed at the time of this event. Syncthing was started successfully afterward.', app: 'Syncthing', time: '10:35 AM' },
  { id: 1, category: 'pro', level: 'info', title: 'Pro license checked', message: 'The license check completed.', app: null, time: '10:20 AM' },
];
const categories = [['all', 'All events'], ['app-related', 'App-related events'], ['install', 'App installs'], ['backup', 'Backups'], ['repair', 'Repairs'], ['access', 'Access'], ['health', 'Health'], ['system', 'System'], ['api', 'API'], ['pro', 'Autark Pro']];
const levels = [['all', 'All levels'], ['error', 'Errors'], ['warning', 'Warnings'], ['success', 'Completed'], ['info', 'Updates']];

function ActivityFlowPreview() {
  const [category, setCategory] = useState('all');
  const [level, setLevel] = useState('all');
  const [scenario, setScenario] = useState('normal');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const visible = (scenario === 'empty' ? [] : events).filter(event =>
    (category === 'all' || (category === 'app-related' ? Boolean(event.app) : category === event.category))
    && (level === 'all' || event.level === level));
  const selected = scenario === 'unavailable' ? null : visible.find(event => event.id === selectedId) ?? visible[0] ?? null;
  const filtered = category !== 'all' || level !== 'all';

  function exportPreview() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ preview: true, events }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'activity-preview-fixture.json';
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Downloaded preview data only. Production export keeps the existing diagnostics workflow.');
  }

  return <main className="min-h-screen bg-app-page p-6 text-foreground">
    <div className="mx-auto max-w-7xl space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">FE-08 · Isolated preview</p><p className="mt-1 text-sm text-muted-foreground">One event filter. Details follow the list. Charts cannot block history.</p></div>
        <Select value={scenario} onValueChange={setScenario}>
          <SelectTrigger aria-label="Preview scenario" className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>{[['normal', 'History available'], ['charts-failed', 'Chart request failed'], ['issues-failed', 'Current issues unavailable'], ['empty', 'No history yet'], ['unavailable', 'History unavailable']].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </section>
      <header className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-app-panel p-5">
        <div className="flex items-center gap-3"><Activity className="size-8 text-primary" /><div><h1 className="text-3xl font-semibold">Activity Log</h1><p className="mt-1 text-sm text-muted-foreground">A history of your server and apps.</p></div></div>
        <div className="flex gap-2"><Button variant="outline" onClick={exportPreview}><Download />Export</Button><Button variant="outline" onClick={() => { setScenario('normal'); setNotice('Preview refreshed. No appliance requests were sent.'); }}><RefreshCw />Refresh</Button></div>
      </header>
      <Tabs defaultValue="history" className="gap-0 overflow-hidden rounded-2xl border border-border bg-app-panel">
        <div className="border-b border-border px-4 pt-3"><TabsList variant="line"><TabsTrigger value="history"><Activity />History</TabsTrigger><TabsTrigger value="metrics"><BarChart3 />System metrics</TabsTrigger></TabsList></div>
        <TabsContent value="history" className="activity-preview-history m-0">
          <section className="min-w-0 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger aria-label="Filter events" className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>{categories.map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex flex-wrap gap-1">{levels.map(([value, label]) => <Button size="sm" variant={level === value ? 'default' : 'ghost'} aria-pressed={level === value} key={value} onClick={() => setLevel(value)}>{label}</Button>)}</div>
            </div>
            <p className="py-3 text-xs text-muted-foreground">{category === 'app-related' ? 'App-related events within the latest 120 records.' : 'Latest 120 matching events, newest first.'} Historical warnings do not indicate current unresolved issues.</p>
            {scenario === 'unavailable' ? <div role="alert" className="rounded-xl border border-border p-5"><h2 className="font-semibold">History is unavailable</h2><p className="mt-2 text-sm text-muted-foreground">Events could not be loaded. This does not mean there are no events.</p><Button className="mt-4" variant="outline" onClick={() => setScenario('normal')}>Try again</Button></div>
              : visible.length ? <div className="overflow-hidden rounded-xl border border-border">{visible.map(event => <button key={event.id} onClick={() => setSelectedId(event.id)} className={cn('flex w-full items-center gap-3 border-b border-border px-4 py-4 text-left last:border-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected?.id === event.id && 'bg-accent/40')}>
                <StatusBadge tone={event.level === 'warning' ? 'warning' : event.level === 'success' ? 'success' : 'info'}>{event.level}</StatusBadge>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{event.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{event.message}</span></span><span className="shrink-0 text-xs text-muted-foreground">{event.time}</span><ChevronRight className="size-4 shrink-0" />
              </button>)}</div>
                : <div className="rounded-xl border border-border p-5"><h2 className="font-semibold">{filtered ? 'No events match these filters' : 'No activity recorded yet'}</h2><p className="mt-2 text-sm text-muted-foreground">{filtered ? 'Choose another event type or level.' : 'Recorded work will appear here as you use Autark-OS.'}</p>{filtered && <Button variant="outline" className="mt-3" onClick={() => { setCategory('all'); setLevel('all'); }}>Clear filters</Button>}</div>}
          </section>
          <aside className="border-l border-border bg-app-surface/40 p-4">
            <h2 className="text-sm font-semibold">Current app issues</h2>
            <p className="mt-2 text-sm text-muted-foreground">{scenario === 'issues-failed' ? 'Current issues could not be checked. History is still available.' : 'No current app issues reported.'}</p>
            <Button variant="link" className="mt-1 px-0" onClick={() => setNotice('Production destination: My Apps. This preview does not navigate to the live appliance.')}>Open My Apps <ChevronRight /></Button>
            <section className="mt-5 border-t border-border pt-4" aria-label="Selected activity"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected activity</h2>
              {selected ? <div className="mt-3 space-y-3"><h3 className="font-semibold">{selected.title}</h3><p className="text-sm leading-6 text-muted-foreground">{selected.message}</p><p className="text-xs text-muted-foreground">Recorded today at {selected.time}{selected.app && ` · ${selected.app}`}</p><details className="text-sm"><summary className="cursor-pointer text-primary">Technical detail</summary><p className="mt-2 text-xs text-muted-foreground">Category: {selected.category} · Level: {selected.level}</p></details></div>
                : <p className="mt-3 text-sm text-muted-foreground">No event selected.</p>}
            </section>
          </aside>
        </TabsContent>
        <TabsContent value="metrics" className="m-0 min-h-[32rem] p-5">
          <h2 className="font-semibold">System metrics</h2><p className="mt-1 text-sm text-muted-foreground">Requested only when this view is open. The existing charts stay here.</p>
          {scenario === 'charts-failed' ? <div role="alert" className="mt-5 rounded-xl border border-border p-5"><h3 className="font-semibold">Chart history is unavailable</h3><p className="mt-2 text-sm text-muted-foreground">You can still read events in History.</p><Button className="mt-3" variant="outline" onClick={() => setScenario('normal')}>Retry charts</Button></div>
            : <div className="mt-5 grid grid-cols-3 gap-4">{[['Device CPU', '12%'], ['Memory', '38%'], ['Disk', '57%']].map(([label, value]) => <div className="rounded-xl border border-border bg-card p-5" key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p><p className="mt-3 text-xs text-muted-foreground">Illustrative preview reading</p></div>)}</div>}
        </TabsContent>
      </Tabs>
      <p role="status" className="min-h-6 text-sm text-muted-foreground">{notice || 'Preview only · No API calls, live data changes, or production routes.'}</p>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<ActivityFlowPreview />);
