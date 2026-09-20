import { useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowRight, Check, ChevronRight, CircleAlert, Clock3, ExternalLink, Grid2X2, Info, Network, Package, RefreshCw, Search, Settings2, ShieldCheck, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import '../styles.css';
import './page-feedback.css';

type Page = 'Access' | 'My Apps' | 'Discover';
type Condition = 'attention' | 'healthy' | 'stale' | 'unavailable';
type Option = 'quiet' | 'named' | 'split';
const options: { id: Option; title: string; description: string; rationale: string }[] = [
  { id: 'quiet', title: 'A1 · Quiet pill', description: 'A subtle count. A short explanation on click.', rationale: 'Closest to the original A. The page stays very quiet, but you need a click to learn what needs attention.' },
  { id: 'named', title: 'A2 · Named chip', description: 'Say what needs attention, not just how many.', rationale: 'My pick: “1 unused link” tells you more than “1 to review” without adding a banner. A compact popover holds the explanation and next action.' },
  { id: 'split', title: 'A3 · Title companion', description: 'A split chip beside the title. Expand details in place.', rationale: 'Keeps status attached to the page title. The popover starts with a small issue row; expand its explanation without opening another surface.' },
];
const pageCopy: Record<Page, { subtitle: string; issue: string; explanation: string; action: string }> = {
  Access: { subtitle: 'Choose where your apps can be reached.', issue: 'One unused private link', explanation: 'A private link remains from a removed app. Your current apps are unaffected.', action: 'Review unused link' },
  'My Apps': { subtitle: 'Your apps, ready when you need them.', issue: 'Syncthing needs a review', explanation: 'Syncthing is installed, but its container is stopped. Review it before choosing what to do next.', action: 'Review Syncthing' },
  Discover: { subtitle: 'Make this server your own.', issue: 'FreshRSS installation failed', explanation: 'The requested port is already in use. Change the port before trying the installation again.', action: 'Review install settings' },
};

function FeedbackStudy() {
  const [option, setOption] = useState<Option>(() => options.find(item => item.id === new URLSearchParams(location.search).get('variant'))?.id ?? 'named');
  const [page, setPage] = useState<Page>('Access');
  const [condition, setCondition] = useState<Condition>('attention');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [dialog, setDialog] = useState<'settings' | 'cleanup' | 'app' | null>(null);
  const [selectedApp, setSelectedApp] = useState('FreshRSS');
  const [port, setPort] = useState('8080');
  const [fieldError, setFieldError] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const copy = pageCopy[page];
  const healthy = condition === 'healthy';
  const unavailable = condition === 'unavailable';
  const stale = condition === 'stale';
  const issueTitle = unavailable ? 'Status could not load' : stale ? 'Showing last confirmed information' : copy.issue;
  const issueBody = unavailable ? 'Autark-OS could not retrieve this page. No empty or healthy state is implied.' : stale ? 'The last successful check was 2 minutes ago. Live changes are paused until a fresh check succeeds.' : copy.explanation;
  const status = healthy ? 'Up to date' : stale ? 'Refresh paused' : unavailable ? 'Status unavailable' : '1 to review';
  const namedStatus = healthy ? 'Up to date' : stale ? 'Refresh paused' : unavailable ? 'Status unavailable' : page === 'Access' ? '1 unused link' : page === 'My Apps' ? 'Syncthing stopped' : 'FreshRSS install failed';
  const shortExplanation = stale || unavailable ? issueBody : page === 'Access' ? 'Left over from a removed app. Current apps are unaffected.' : page === 'My Apps' ? 'Still installed. Its data is intact.' : 'Port 8080 is in use. Choose another port before retrying.';

  function notify(message: string) {
    setHistory((items) => [message, ...items]);
    setResult(message);
  }
  function retry() {
    setCondition(healthy ? 'healthy' : 'attention');
    setPopoverOpen(false);
    setLocalOpen(false);
    notify('Status refreshed · demo result');
  }
  function openTask() {
    setPopoverOpen(false);
    setLocalOpen(false);
    setFieldError(false);
    setSelectedApp(page === 'My Apps' ? 'Syncthing' : 'FreshRSS');
    setDialog(page === 'Access' ? 'cleanup' : page === 'Discover' ? 'settings' : 'app');
  }
  function reviewApp(name: string, settings = false) {
    setSelectedApp(name);
    setFieldError(false);
    setDialog(settings ? 'settings' : 'app');
  }
  function changePage(next: Page) {
    setPage(next);
    setCondition('attention');
    setResult(null);
    setLocalOpen(false);
    setPopoverOpen(false);
  }

  function changeOption(next: Option) {
    setOption(next);
    setPopoverOpen(false);
    setLocalOpen(false);
    const url = new URL(location.href);
    url.searchParams.set('variant', next);
    window.history.replaceState(null, '', url);
  }

  const issueDetails = <div className="space-y-4">
    <div className="flex items-start gap-3"><CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" /><div><h3 className="text-sm font-medium">{issueTitle}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{issueBody}</p></div></div>
    <Button size="sm" variant="outline" onClick={stale || unavailable ? retry : openTask}>{stale || unavailable ? 'Retry refresh' : copy.action}<ArrowRight className="size-3.5" /></Button>
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Technical details</summary><p className="mt-2 leading-relaxed">{stale || unavailable ? 'Example: the latest status request timed out. This is a simulated response.' : page === 'Access' ? 'An unused Tailscale Serve mapping remains on HTTPS port 12078. No installed app currently claims it.' : page === 'Discover' ? 'Example: the host port 8080 is already bound by another service.' : 'Example: Docker reports the app container as stopped.'}</p></details>
  </div>;

  const compactIssue = <div className="wf-compact-issue">
    <div className="wf-popover-label"><span>{page} / Current status</span><span>{stale ? "2 minutes ago" : unavailable ? "No data yet" : "Just checked"}</span></div>
    <div className="flex items-start gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 wf-attention" /><div className="min-w-0"><h3 className="text-sm font-medium">{issueTitle}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{shortExplanation}</p></div></div>
    <Button variant="outline" size="sm" className="w-full justify-between" onClick={stale || unavailable ? retry : openTask}>{stale || unavailable ? 'Retry refresh' : copy.action}<ArrowRight className="size-3.5" /></Button>
  </div>;
  const expandableIssue = <div className="wf-expandable-issue">
    <div className="wf-popover-label"><span>{page} / Current status</span><span>1 item</span></div>
    <details className="wf-issue-disclosure"><summary><CircleAlert className="size-4 shrink-0 wf-attention" /><span>{issueTitle}</span><ChevronRight className="wf-disclosure-chevron size-3.5 shrink-0" /></summary><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{issueBody}</p><p className="mt-2 text-xs text-muted-foreground">Closing this popover does not resolve the issue.</p></details>
    <Button variant="outline" size="sm" className="w-full justify-between" onClick={stale || unavailable ? retry : openTask}>{stale || unavailable ? 'Retry refresh' : copy.action}<ArrowRight className="size-3.5" /></Button>
  </div>;
  const feedbackContent = healthy ? <div className="flex items-center gap-2 text-xs"><Check className="size-4 text-primary" /><p>The latest check succeeded. Nothing needs review.</p></div> : option === 'quiet' ? issueDetails : option === 'named' ? compactIssue : expandableIssue;

  const statusControl = <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
    <PopoverTrigger asChild><button aria-label={`Page status: ${namedStatus}`} className={cn('wf-status-chip', `wf-chip-${option}`, !healthy && 'wf-attention')}>
      {option === 'split' ? <><span className="wf-chip-segment">Status</span><span className="wf-chip-value">{healthy ? <Check className="size-3" /> : <CircleAlert className="size-3" />}{condition === 'attention' ? '1 issue' : status}</span></> : <>{healthy ? <Check className="size-3.5" /> : <CircleAlert className="size-3.5" />}<span>{option === 'named' ? namedStatus : status}</span><ChevronRight className="size-3" /></>}
    </button></PopoverTrigger>
    <PopoverContent aria-label="Page status" align={option === 'split' ? 'start' : 'end'} collisionPadding={12} className={cn('wf-feedback-popover p-4', `wf-popover-${option}`)}>
      {feedbackContent}
    </PopoverContent>
  </Popover>;

  function localIssue(children: ReactNode, className: string) {
    return <Popover open={localOpen} onOpenChange={setLocalOpen}><PopoverTrigger asChild><button className={cn(className, `wf-local-${option}`)}>{children}</button></PopoverTrigger><PopoverContent aria-label="Item needs review" align="start" collisionPadding={12} className={cn('wf-feedback-popover p-4', `wf-popover-${option}`)}>{feedbackContent}</PopoverContent></Popover>;
  }

  return <div className="wf-study">
    <header className="wf-lab-header">
      <div><p className="wf-eyebrow">AUTARK-OS / CONTEXT CHIP VARIATIONS</p><h1>Small signals. Useful context.</h1><p className="text-sm text-muted-foreground">Three takes on option A. No drawers, no banners, no rearranging the page.</p></div>
      <span className="wf-prototype-label">Interactive mock-up · no server changes</span>
    </header>
    <div className="wf-options" aria-label="Feedback design options">
      {options.map((item) => <button key={item.id} aria-pressed={option === item.id} className={cn('wf-option', option === item.id && 'wf-option-selected')} onClick={() => changeOption(item.id)}>
        <span className="flex items-center justify-between gap-2 font-medium">{item.title}{item.id === 'named' && <span className="wf-recommendation">Recommended</span>}</span><span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
        <span className={cn('wf-mini-chip', `wf-mini-${item.id}`)}>{item.id === 'quiet' ? <><CircleAlert />1 to review</> : item.id === 'named' ? <><CircleAlert />1 unused link<ChevronRight /></> : <><span>Status</span><span>1 issue</span></>}</span>
      </button>)}
    </div>
    <div className="wf-lab-controls">
      <div className="flex flex-wrap items-center gap-2"><span className="wf-eyebrow">PREVIEW</span>{(['Access', 'My Apps', 'Discover'] as Page[]).map((item) => <Button key={item} size="sm" variant={page === item ? 'secondary' : 'ghost'} onClick={() => changePage(item)}>{item}</Button>)}</div>
      <div className="flex flex-wrap items-center gap-2"><label htmlFor="scenario" className="text-xs text-muted-foreground">Simulate</label><select id="scenario" value={condition} onChange={(event) => setCondition(event.target.value as Condition)}><option value="attention">Needs review</option><option value="healthy">Healthy</option><option value="stale">Background refresh failed</option><option value="unavailable">First load failed</option></select><Button variant="outline" size="sm" onClick={() => reviewApp('FreshRSS', true)}>Form error example</Button></div>
    </div>

    <div className="wf-appliance">
      <aside className="wf-sidebar"><div className="wf-brand"><span>A</span><div>Autark-OS<small>Your home server</small></div></div><p className="wf-eyebrow mt-9 mb-3">WORKSPACE</p>{(['My Apps', 'Discover', 'Access'] as Page[]).map((item) => <button key={item} className={cn('wf-nav', page === item && 'wf-nav-selected')} onClick={() => changePage(item)}>{item === 'Access' ? <Network /> : item === 'Discover' ? <Grid2X2 /> : <Package />}{item}</button>)}<div className="wf-sidebar-footer"><ShieldCheck className="size-4" /><span>Local-first.<br /><span className="text-muted-foreground">Yours to control.</span></span></div></aside>
      <div className="min-w-0">
        <div className="wf-global-header"><span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="wf-online-dot" />Home server <span className="hidden sm:inline">/ simulated environment</span></span><Popover open={activityOpen} onOpenChange={setActivityOpen}><PopoverTrigger asChild><Button variant="ghost" size="sm"><Activity className="size-4" />Activity{history.length > 0 && ` · ${history.length}`}</Button></PopoverTrigger><PopoverContent align="end" className="max-h-72 w-80 max-w-[calc(100vw-24px)] overflow-y-auto p-4"><h3 className="text-sm font-medium">History · prototype only</h3>{history.length ? history.map((message, index) => <p key={`${index}-${message}`} className="border-b border-border py-3 text-xs">{message}</p>) : <p className="mt-3 text-xs text-muted-foreground">Try an action below. Dismissing its popup keeps the result here.</p>}</PopoverContent></Popover></div>
        <main className="wf-main">
          <div className={cn("wf-page-heading", option === "split" && "wf-heading-split")}><div><p className="wf-eyebrow">YOUR SERVER</p><div className="wf-title-line"><h2>{page}</h2>{option === "split" && statusControl}</div><p className="text-sm text-muted-foreground">{copy.subtitle}</p></div>{option !== "split" && <div className="wf-chip-slot">{statusControl}</div>}</div>
          <div className="wf-toolbar"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Search className="size-4" /><span>{page === 'Access' ? 'All services' : page === 'My Apps' ? 'Installed applications' : 'Recommended for your server'}</span></div><Button variant="ghost" size="sm" onClick={retry}><RefreshCw className="size-3.5" />Refresh</Button></div>
          <section className="wf-workspace" data-testid="workspace" aria-label={`${page} workspace`}>
            {unavailable ? <div className="wf-unavailable"><div className="wf-empty-icon"><Network /></div><h3>We couldn’t load {page.toLowerCase()}.</h3><p>No current information is available. Try the connection again.</p><Button variant="outline" onClick={retry}><RefreshCw className="size-4" />Retry loading</Button><span className="text-xs text-muted-foreground">Replaces the content. Doesn’t add another banner above it.</span></div>
              : page === 'Access' ? <div className="wf-zones">{['This server', 'Home Network', 'Private · Tailscale', 'Open Internet'].map((zone, index) => <div className="wf-zone" key={zone}>
                <div className="wf-zone-title"><span>{zone}</span><span className="text-muted-foreground">{index === 1 ? '2' : index === 2 ? '1' : '0'}</span></div>
                <p className="wf-zone-description">{['Only on this device', 'People on your home Wi-Fi', 'Only your trusted devices', 'Anyone on the internet'][index]}</p>
                {index === 1 && <><AppTile name="Syncthing" initial="S" status={stale ? 'Last known · home network' : 'Home network'} onClick={() => reviewApp('Syncthing')} /><AppTile name="FreshRSS" initial="F" status={stale ? 'Last known · home network' : 'Home network'} onClick={() => reviewApp('FreshRSS')} /></>}
                {index === 2 && <><AppTile name="Vaultwarden" initial="V" status={stale ? 'Last known · private' : 'Private access'} onClick={() => reviewApp('Vaultwarden')} />{condition === 'attention' && localIssue(<><CircleAlert className="size-3.5" />Unused link · 1<ChevronRight className="ml-auto size-3.5" /></>, 'wf-local-issue')}</>}
                {(index === 0 || index === 3) && <p className="wf-zone-empty">{index === 3 ? 'Nothing exposed publicly' : 'No services here'}</p>}
              </div>)}</div>
              : <div className="wf-app-grid">{['Syncthing', 'FreshRSS', 'Vaultwarden', 'Jellyfin', 'Homepage', 'Actual Budget'].map((name, index) => {
                const affected = condition === 'attention' && index === (page === 'Discover' ? 1 : 0);
                const label = stale ? 'Last confirmed status' : affected ? page === 'Discover' ? 'Install failed' : 'Stopped · review needed' : page === 'Discover' ? 'Available to install' : 'Running';
                return <article className="wf-app-card" key={name}><span className="wf-app-icon">{name[0]}</span><h3 className="text-sm font-medium">{name}</h3><p className="text-xs text-muted-foreground">{['Keep your files in sync.', 'Your daily reading, privately.', 'A home for your passwords.', 'Your personal media library.', 'Everything at a glance.', 'Budget on your own terms.'][index]}</p><div className="wf-card-footer">{affected ? localIssue(<><CircleAlert />{label}</>, 'wf-card-status wf-attention') : <span className="wf-card-status"><Info />{label}</span>}<Button size="sm" variant="ghost" aria-label={`Review ${name}`} onClick={() => reviewApp(name, page === 'Discover')}><ChevronRight className="size-4" /></Button></div></article>;
              })}</div>}
          </section>
          <div className="wf-page-footer"><span className="flex items-center gap-1.5"><Clock3 className="size-3" />{stale ? 'Last confirmed 2 minutes ago' : unavailable ? 'Waiting for first successful check' : 'Checked just now'}</span><Button size="sm" variant="ghost" onClick={() => notify(page === 'Access' ? 'Access change failed. The previous setting is unchanged.' : page === 'Discover' ? 'Install could not start. Review the app’s port setting.' : 'App could not start. Review its configuration.')}>Preview failed-action popup<ExternalLink className="size-3" /></Button></div>
        </main>
      </div>
    </div>
    <section className="wf-design-notes"><div><p className="wf-eyebrow">WHY THIS VARIATION</p><h3>{options.find((item) => item.id === option)?.title}</h3><p>{options.find((item) => item.id === option)?.rationale}</p></div><div><p className="wf-eyebrow">SAME BEHAVIOR IN ALL THREE</p><ul><li>Click the chip or affected item for a bounded popover.</li><li>Close it without hiding the underlying issue.</li><li>Action results stay in the existing popup + Activity.</li></ul></div></section>


    <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}><DialogContent className="wf-task-dialog">
      <DialogHeader><p className="wf-eyebrow">{dialog === 'cleanup' ? 'ACCESS / CLEANUP' : `${selectedApp.toUpperCase()} / ${dialog === 'settings' ? 'SETTINGS' : 'REVIEW'}`}</p><DialogTitle>{dialog === 'cleanup' ? 'Remove unused private link?' : dialog === 'settings' ? 'Choose an available port' : `Review ${selectedApp}`}</DialogTitle><DialogDescription>{dialog === 'cleanup' ? 'The link will stop working. App containers and data will not be deleted.' : dialog === 'settings' ? 'Only the affected setting needs your attention. Keep everything else where it is.' : 'Use current app status to choose the next step.'}</DialogDescription></DialogHeader>
      {dialog === 'settings' ? <form className="wf-task-form" onSubmit={(event) => { event.preventDefault(); if (port === '8080' || !/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) { setFieldError(true); event.currentTarget.querySelector('input')?.focus(); return; } setFieldError(false); setDialog(null); if (page === 'Discover') setCondition('healthy'); notify('Port setting saved · demo only'); }}>
        <div><label htmlFor="app-port" className="text-sm font-medium">Home network port</label><input id="app-port" value={port} inputMode="numeric" aria-invalid={fieldError} aria-describedby="port-help" onChange={(event) => { setPort(event.target.value); setFieldError(false); }} /><p id="port-help" className={cn('wf-field-help', fieldError && 'text-red-300')} aria-live="polite">{fieldError ? 'Choose another port. In this demo, 8080 is in use; try 8085.' : 'A number from 1024 to 65535. This example starts with a port conflict.'}</p></div>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Why does this matter?</summary><p className="mt-2">Two apps cannot listen on the same host port. In the product, availability must be checked by the backend.</p></details>
        <div className="wf-dialog-footer"><p className="wf-footer-message" role="status">{fieldError ? 'Not saved. Your other settings are unchanged.' : 'Preview only. Nothing is sent to your server.'}</p><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit">Save changes</Button></div></div>
      </form> : <div className="wf-task-form"><div className="rounded-lg border border-border p-4"><p className="text-sm font-medium">{dialog === 'cleanup' ? 'Unused private link · port 12078' : `${selectedApp} · ${stale ? 'last known status' : selectedApp === 'Syncthing' && page === 'My Apps' && !healthy ? 'stopped' : 'running'}`}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{dialog === 'cleanup' ? 'No installed app currently claims this link. Removal affects this link only.' : 'The app is still installed. Its data has not been removed.'}</p></div><details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Technical details</summary><p className="mt-2">{dialog === 'cleanup' ? 'Only the selected Tailscale Serve mapping would be removed.' : 'Review container logs and app configuration before restarting. This example does not connect to Docker.'}</p></details><div className="wf-dialog-footer"><p className="wf-footer-message">{dialog === 'cleanup' ? 'Confirm only if nobody needs this old link.' : 'This is a simulated review; no app will be started.'}</p><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>{dialog === 'cleanup' ? 'Keep link' : 'Close'}</Button><Button variant={dialog === 'cleanup' ? 'destructive' : 'outline'} onClick={() => { setDialog(null); if (dialog === 'cleanup') setCondition('healthy'); notify(dialog === 'cleanup' ? 'Unused link removed · demo only' : 'App review completed · demo only'); }}>{dialog === 'cleanup' ? <><Trash2 className="size-4" />Remove link</> : 'Finish demo review'}</Button></div></div></div>}
    </DialogContent></Dialog>
    {result && <aside role="status" className="wf-result"><Info className="mt-0.5 size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="text-xs font-medium">{result}</p><button className="mt-1 text-xs text-muted-foreground underline" onClick={() => { setResult(null); setActivityOpen(true); window.scrollTo({ top: 180, behavior: 'instant' }); }}>View in Activity</button></div><Button size="icon-sm" variant="ghost" aria-label="Dismiss popup" onClick={() => setResult(null)}><X className="size-3.5" /></Button></aside>}
  </div>;
}

function AppTile({ name, initial, status, onClick }: { name: string; initial: string; status: string; onClick: () => void }) {
  return <button className="wf-service" onClick={onClick}><span className="wf-service-icon">{initial}</span><span className="min-w-0"><span className="block text-xs font-medium">{name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{status}</span></span><Settings2 className="ml-auto size-3.5 shrink-0 text-muted-foreground" /></button>;
}

createRoot(document.getElementById('root')!).render(<FeedbackStudy />);
