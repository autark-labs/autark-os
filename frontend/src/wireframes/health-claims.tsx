import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import '../styles.css';
import './health-claims.css';

type Page = 'Settings' | 'Diagnostics' | 'Storage';
type Scenario = 'Healthy' | 'Needs attention' | 'Unavailable';

function HealthClaimsStudy() {
  const [page, setPage] = useState<Page>('Diagnostics');
  const [scenario, setScenario] = useState<Scenario>('Needs attention');
  const [section, setSection] = useState('Health checks');
  const [detail, setDetail] = useState('');
  const warning = scenario === 'Needs attention';
  const unavailable = scenario === 'Unavailable';
  const tone = unavailable ? 'border-border bg-muted text-muted-foreground' : warning ? 'border-amber-300/30 bg-amber-400/5 text-amber-100' : 'border-emerald-300/20 bg-emerald-400/5 text-emerald-100';
  const sections = page === 'Settings' ? ['General', 'Apps', 'Backups', 'Advanced'] : page === 'Diagnostics' ? ['Health checks', 'Support report', 'Technical logs', 'System details'] : ['Overview', 'App data', 'Backups', 'Cleanup'];
  const heading = page === 'Settings' ? 'Appliance settings' : page;
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-cyan-200">FE-07 · Local design preview · No live data or actions</p>
          <h1 className="text-2xl font-semibold">Fewer health claims. More useful evidence.</h1>
          <p className="text-sm text-slate-400">Existing page structure, with duplicate status removed. Switch pages and scenarios to compare.</p>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <nav aria-label="Preview page" className="flex gap-2">{(['Settings', 'Diagnostics', 'Storage'] as Page[]).map(value => <Button aria-pressed={page === value} key={value} variant={page === value ? 'default' : 'outline'} onClick={() => { setPage(value); setSection(value === 'Settings' ? 'General' : value === 'Storage' ? 'Overview' : 'Health checks'); setDetail(''); }}>{value}</Button>)}</nav>
            <label className="flex items-center gap-3 text-sm">Scenario<select className="rounded-md border border-slate-600 bg-slate-900 p-2" value={scenario} onChange={event => setScenario(event.target.value as Scenario)}>{(['Healthy', 'Needs attention', 'Unavailable'] as Scenario[]).map(value => <option key={value}>{value}</option>)}</select></label>
          </div>
        </header>

        <section aria-label={`${page} preview`} className="space-y-3 rounded-2xl bg-slate-800 p-4">
          <header className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-5 py-4">
            <div><h2 className="text-3xl font-semibold">{heading}</h2><p className="mt-1 text-sm text-slate-400">{page === 'Settings' ? 'Controls for this appliance.' : page === 'Diagnostics' ? 'Health checks and support context when you need it.' : 'Space for your apps and backups.'}</p></div>
            <Button variant="outline" onClick={() => setDetail('Preview only: production Refresh repeats the existing checks.')}>Refresh</Button>
          </header>
          <div className={cn('grid min-h-96 overflow-hidden rounded-xl border border-slate-700 bg-slate-900', page === 'Storage' ? 'grid-cols-1' : 'health-preview-shell')}>
            <aside className={cn('border-slate-700 p-3', page === 'Storage' ? 'flex items-center gap-2 border-b' : 'border-r')}>
              <p className="mb-3 px-2 text-xs uppercase tracking-widest text-slate-400">{page === 'Diagnostics' ? 'Notebook' : page === 'Settings' ? 'Appliance controls' : 'Storage'}</p>
              {sections.map(value => <Button key={value} variant={section === value ? 'secondary' : 'ghost'} className={page === 'Storage' ? '' : 'mb-1 w-full justify-start'} onClick={() => { setSection(value); setDetail(''); }}>{value}</Button>)}
            </aside>
            <div className="space-y-4 p-5">
              <h3 className="text-lg font-semibold">{section}</h3>
              {page === 'Settings' ? <>
                <p className="text-sm text-slate-400">The sidebar ends after its categories. No unconditional “Appliance ready” card.</p>
                <label className="block space-y-2 text-sm"><span>Device name</span><input aria-label="Device name" defaultValue="Home server" className="block w-full rounded-md border border-slate-700 bg-slate-800 p-3" /></label>
                <div className="flex items-center justify-between border-t border-slate-700 pt-4"><span className="text-sm text-slate-400">Existing save and refresh feedback stays here.</span><Button onClick={() => setDetail('Preview only: nothing was saved.')}>Save changes</Button></div>
              </> : page === 'Diagnostics' && section === 'Health checks' ? <div className="health-preview-checks grid gap-4">
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">The duplicate five-cell summary strip is gone. Checks and findings remain the evidence.</p>
                  {[['Docker', unavailable ? 'Status unavailable' : 'Ready'], ['Tailscale', unavailable ? 'Status unavailable' : warning ? 'Needs sign-in' : 'Connected']].map(([label, status]) => <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 p-3"><span>{label}</span><span className={cn('rounded-md border px-2 py-1 text-xs', unavailable ? 'border-slate-600 text-slate-400' : status === 'Needs sign-in' ? 'border-amber-300/30 text-amber-100' : 'border-emerald-300/30 text-emerald-100')}>{status}</span></div>)}
                  <Card className={tone}><CardHeader><CardTitle>{unavailable ? 'Findings unavailable' : warning ? 'Backups need attention' : 'No support findings reported'}</CardTitle></CardHeader><CardContent><p className="text-sm">{unavailable ? 'Refresh to try again. Missing information does not imply readiness.' : warning ? 'The backup destination cannot be written. Review the destination before the next backup.' : 'Verified restore points and protection are shown in Backups, not inferred here.'}</p><Button className="mt-3" variant="outline" onClick={() => setDetail('Preview: Open Backups uses the existing /backups route to show verified restore points and destination controls.')}>Open Backups</Button></CardContent></Card>
                </div>
                <aside className="space-y-3 rounded-lg border border-slate-700 p-3"><p className="font-semibold">Support tools</p><p className="text-sm text-slate-400">Existing tools and disclosure stay in place.</p><Button className="w-full" variant="outline" onClick={() => setSection('Support report')}>Support report</Button><Button className="w-full" variant="outline" onClick={() => setSection('Technical logs')}>Technical logs</Button></aside>
              </div> : page === 'Storage' ? <>
                <Card className={tone}><CardHeader><CardTitle>{unavailable ? 'Storage status unavailable' : warning ? 'Disk space is critically low' : 'Storage has room to grow'}</CardTitle></CardHeader><CardContent><p className="text-sm">{unavailable ? 'The disk measurement failed. Refresh or inspect Diagnostics.' : warning ? 'Free space before installing more apps. The capacity recommendation stays ahead of unused folders.' : 'No capacity action is needed. A successful recommendation is not a warning.'}</p></CardContent></Card>
                {section === 'Cleanup' && !warning ? <p className="text-sm text-slate-400">{unavailable ? 'Folder checks unavailable.' : 'No unused app folders reported.'}</p> : section === 'Cleanup' ? <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 p-4"><div><p className="font-semibold">Previous app data · 8 GB</p><p className="mt-1 text-sm text-amber-100">Cleanup blocked: a running container uses this folder.</p></div><Button disabled variant="outline">Review</Button></div> : <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 p-4"><div><p className="font-semibold">Cleanup workspace</p><p className="mt-1 text-sm text-slate-400">Review eligibility in Cleanup. No “reclaimable” promise for blocked folders.</p></div><Button variant="outline" onClick={() => setSection('Cleanup')}>Open cleanup</Button></div>}
              </> : <p className="text-sm text-slate-400">The existing {section.toLowerCase()} workspace is unchanged by this proposal.</p>}
              {detail && <p role="status" className="rounded-lg border border-cyan-300/20 bg-cyan-400/5 p-3 text-sm text-cyan-100">{detail}</p>}
            </div>
          </div>
        </section>
        <p className="text-sm text-slate-400">Proposed changes only: remove redundant claims, keep existing checks/actions, honor backend severity and cleanup eligibility. No new notification pattern or health engine.</p>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<HealthClaimsStudy />);
