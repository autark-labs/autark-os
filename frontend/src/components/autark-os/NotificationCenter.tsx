import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, Check, ChevronRight, CircleAlert, Info, Loader2, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityAPIClient } from '@/api/ActivityAPIClient';
import { httpClient } from '@/api/httpClient';
import { Button } from '@/components/ui/button';
import { NotificationModalHost } from '@/components/ui/sonner';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ACTION_NOTIFICATION_EVENT, OPEN_ACTIVITY_EVENT, createNotificationReceipt, dismissActionPopup, showActionErrorNotification, showActionNotification, showJobNotification, type NotificationReceipt } from '@/lib/actionNotifications';
import { actionNotificationFromJob } from '@/lib/actionNotifications.logic';
import { appBrowserAccessReason } from '@/lib/appBrowserAccess';
import { formatLocalizedDateTime } from '@/lib/dateTime';
import { cn } from '@/lib/utils';
import { syncCanonicalAppMutationResult } from '@/repositories/canonicalAppMutationRepository';
import { currentJobStepText, jobTypeLabel, terminalJob, useAutarkOsJobsQuery } from '@/repositories/jobRepository';
import { useRecommendedActionQuery } from '@/repositories/recommendedActionRepository';
import type { AutarkOsAction } from '@/types/app';
import type { AutarkOsJob } from '@/types/jobs';

const historyQueryKey = ['activity', 'notifications'];
const dismissedRecommendationsKey = 'autark-os:dismissed-recommendations';
type UnsavedReceipt = NotificationReceipt & { failed?: boolean };
const NotificationContext = createContext<ReturnType<typeof useNotificationState> | null>(null);

function useNotificationState() {
  const queryClient = useQueryClient();
  const jobs = useAutarkOsJobsQuery();
  const recommendation = useRecommendedActionQuery();
  const [unsaved, setUnsaved] = useState<UnsavedReceipt[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, string>>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(dismissedRecommendationsKey) || '{}');
      return stored && typeof stored === 'object' && !Array.isArray(stored)
        ? Object.fromEntries(Object.entries(stored).filter(([, value]) => typeof value === 'string')) : {};
    } catch { return {}; }
  });
  const [dismissalSessionOnly, setDismissalSessionOnly] = useState(false);
  const previousJobs = useRef(new Map<string, string>());

  const saveReceipt = useCallback(async (receipt: NotificationReceipt) => {
    setUnsaved((current) => [{ ...receipt, failed: false }, ...current.filter((item) => item.id !== receipt.id)]);
    try {
      await ActivityAPIClient.recordNotification({
        id: receipt.id, severity: receipt.severity, title: receipt.title.slice(0, 160), message: receipt.message?.slice(0, 2000),
      });
      await queryClient.invalidateQueries({ queryKey: historyQueryKey });
      setUnsaved((current) => current.filter((item) => item.id !== receipt.id));
    } catch {
      // Keep offline feedback visible, without retry loops or recursive error notifications.
      setUnsaved((current) => current.map((item) => item.id === receipt.id ? { ...item, failed: true } : item));
    }
  }, [queryClient]);

  useEffect(() => {
    const receive = (event: Event) => {
      const receipt = (event as CustomEvent<NotificationReceipt>).detail;
      if (receipt?.id && !receipt.jobId && receipt.persist !== false) void saveReceipt(receipt);
    };
    window.addEventListener(ACTION_NOTIFICATION_EVENT, receive);
    return () => window.removeEventListener(ACTION_NOTIFICATION_EVENT, receive);
  }, [saveReceipt]);

  useEffect(() => {
    for (const job of jobs.data ?? []) {
      const previous = previousJobs.current.get(job.jobId);
      previousJobs.current.set(job.jobId, job.status);
      if ((previous === 'queued' || previous === 'running') && terminalJob(job)) showJobNotification(job);
    }
  }, [jobs.data]);

  function dismissRecommendation() {
    const current = recommendation.data;
    if (!current) return;
    const next = { ...dismissed, [current.id]: JSON.stringify(current) };
    setDismissed(next);
    try {
      localStorage.setItem(dismissedRecommendationsKey, JSON.stringify(next));
      setDismissalSessionOnly(false);
    } catch { setDismissalSessionOnly(true); }
    void saveReceipt(createNotificationReceipt({
      severity: current.severity, title: current.title, message: current.body, sticky: false,
    }));
  }

  return { jobs, recommendation, unsaved, saveReceipt, dismissed, dismissRecommendation, dismissalSessionOnly };
}

export function AppNotificationsProvider({ children }: { children: ReactNode }) {
  const state = useNotificationState();
  return <NotificationContext.Provider value={state}>{children}</NotificationContext.Provider>;
}

export function NotificationCenterPopover({ compact = false }: { compact?: boolean }) {
  const state = useContext(NotificationContext);
  if (!state) throw new Error('Activity requires AppNotificationsProvider');
  const { jobs, recommendation, unsaved, saveReceipt, dismissed, dismissRecommendation, dismissalSessionOnly } = state;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('now');
  const [runningAction, setRunningAction] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: historyQueryKey,
    queryFn: () => ActivityAPIClient.recent({ category: 'notification', limit: 100 }),
    enabled: open && tab === 'history',
    staleTime: 0,
    refetchInterval: open && tab === 'history' ? 10_000 : false,
  });
  const current = recommendation.data?.id !== 'no-action-needed'
    && dismissed[recommendation.data?.id ?? ''] !== JSON.stringify(recommendation.data) ? recommendation.data : null;
  const active = (jobs.data ?? []).filter((job) => !terminalJob(job));
  const unavailable = jobs.isError || recommendation.isError;
  const checking = jobs.isPending || recommendation.isPending;
  const summary = unavailable ? 'Status unavailable' : checking ? 'Checking' : current ? 'Needs review' : active.length ? `${active.length} running` : 'Activity';
  const Icon = unavailable || current ? CircleAlert : active.length ? Loader2 : Bell;

  useEffect(() => {
    const showHistory = (event: Event) => {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setTab((event as CustomEvent<{ tab: string }>).detail?.tab || 'history');
      setOpen(true);
      dismissActionPopup();
    };
    window.addEventListener(OPEN_ACTIVITY_EVENT, showHistory);
    return () => window.removeEventListener(OPEN_ACTIVITY_EVENT, showHistory);
  }, []);

  async function runAction(action: AutarkOsAction) {
    if (action.disabled || runningAction) return;
    if (action.route) { navigate(action.route); setOpen(false); return; }
    if (!action.href) return;
    if (!action.method || action.method.toUpperCase() === 'GET') {
      if (action.href.startsWith('http')) {
        const reason = appBrowserAccessReason(action.href);
        if (reason) { showActionNotification({ severity: 'info', title: 'Open on this server', message: reason }); return; }
        window.open(action.href, '_blank', 'noopener,noreferrer');
      } else navigate(action.href);
      setOpen(false);
      return;
    }
    if (action.confirmationRequired && !window.confirm(`Continue with ${action.label}?`)) return;
    setRunningAction(true);
    try {
      const response = await httpClient.request({ method: action.method, url: action.href });
      syncCanonicalAppMutationResult(queryClient, response.data);
      showActionNotification(response.data ?? { title: `${action.label} finished` });
      await recommendation.refetch();
    } catch (error) { showActionErrorNotification(error, `${action.label} could not start`); }
    finally { setRunningAction(false); }
  }

  const rows = [
    ...(history.data ?? []).map((item) => ({ id: item.action, title: item.title, message: item.message, severity: item.level, at: item.createdAt, job: undefined as AutarkOsJob | undefined })),
    ...unsaved.filter((item) => !history.data?.some((saved) => saved.action === `notification:${item.id}`)).map((item) => ({ id: `notification:${item.id}`, title: item.title, message: item.message, severity: item.severity, at: item.occurredAt, job: undefined as AutarkOsJob | undefined })),
    ...(jobs.data ?? []).filter(terminalJob).map((job) => ({ ...actionNotificationFromJob(job), id: job.jobId, at: job.updatedAt, job })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 100);

  return <Popover modal open={open} onOpenChange={(next) => { setOpen(next); if (next) dismissActionPopup(); }}>
    <PopoverTrigger asChild>
      <Button aria-label={`Open activity: ${summary}`} variant="outline" className={cn('h-8 gap-2 text-xs', compact ? 'w-8 px-0' : 'w-36 justify-start', (unavailable || current) && 'text-amber-600 dark:text-amber-200')}>
        <Icon className={cn('size-4 shrink-0', active.length > 0 && !unavailable && !current && 'animate-spin motion-reduce:animate-none')} />
        <span className={compact ? 'sr-only' : 'truncate'}>{summary}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent aria-label="Activity" align="end" collisionPadding={12} sideOffset={10} onCloseAutoFocus={(event) => {
      if (returnFocus.current?.isConnected) {
        event.preventDefault();
        returnFocus.current.focus();
      }
      returnFocus.current = null;
    }} className="flex h-[min(332px,var(--radix-popover-content-available-height))] w-[min(380px,calc(100vw-24px))] gap-1 overflow-hidden p-3">
      <NotificationModalHost />
      <div className="flex shrink-0 items-center justify-between"><PopoverTitle>Activity</PopoverTitle><Button aria-label="Close activity" variant="ghost" size="icon-sm" onClick={() => setOpen(false)}><X /></Button></div>
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
        <TabsList variant="line" className="w-full justify-start border-b border-border pb-1">
          <TabsTrigger value="now" className="flex-none px-3 text-xs aria-selected:text-primary [&[aria-selected=false]::after]:opacity-0">Now{active.length > 0 ? ` · ${active.length}` : ''}</TabsTrigger>
          <TabsTrigger value="history" className="flex-none px-3 text-xs aria-selected:text-primary [&[aria-selected=false]::after]:opacity-0">History</TabsTrigger>
        </TabsList>
        <TabsContent value="now" className="min-h-0 overflow-y-auto overscroll-contain">
          {checking && <p className="py-4 text-xs text-muted-foreground" role="status">Checking activity…</p>}
          {unavailable && <div role="alert" className="py-3 text-xs"><p>Current activity is unavailable. Last known status may be out of date.</p><Button size="sm" variant="ghost" disabled={jobs.isFetching || recommendation.isFetching} onClick={() => { void jobs.refetch(); void recommendation.refetch(); }}>Retry status</Button></div>}
          {current && <section aria-label="Action needed" className="flex gap-2 py-3">
            <ResultIcon severity={current.severity} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{current.title}</p>
              <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Details</summary><p className="my-2 leading-relaxed">{current.body}</p></details>
              <div className="mt-2 flex flex-wrap gap-2">
                {current.primaryAction && <Button size="sm" variant="outline" className="text-xs" disabled={current.primaryAction.disabled || runningAction} title={current.primaryAction.reason || undefined} onClick={() => void runAction(current.primaryAction!)}>{runningAction ? 'Starting…' : current.primaryAction.label}</Button>}
                <Button size="sm" variant="ghost" className="text-xs" disabled={runningAction} onClick={dismissRecommendation}>Dismiss</Button>
              </div>
              {current.primaryAction?.disabled && <p className="mt-1 text-xs text-muted-foreground">{current.primaryAction.reason || 'This action is currently unavailable.'}</p>}
            </div>
          </section>}
          {dismissalSessionOnly && <p role="status" className="py-2 text-xs text-muted-foreground">Browser storage is unavailable. Dismissals last until you reload.</p>}
          {active.map((job) => <div key={job.jobId} className="flex gap-2 border-t border-border py-3"><Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" /><div className="min-w-0"><p className="text-xs font-medium">{jobTypeLabel(job.type)}{job.subjectId ? ` · ${job.subjectId}` : ''}</p><p className="mt-1 text-xs text-muted-foreground">{job.status === 'queued' ? 'Queued' : currentJobStepText(job, 'Working')}</p><JobSteps job={job} /></div></div>)}
          {!checking && !unavailable && !current && active.length === 0 && <p className="flex items-center gap-2 py-5 text-xs text-muted-foreground"><Check className="size-4" />{recommendation.data?.id === 'no-action-needed' ? 'Nothing needs your attention.' : 'No new notices. Dismissed notices are in History.'}</p>}
        </TabsContent>
        <TabsContent value="history" className="min-h-0 overflow-y-auto overscroll-contain">
          {(history.isPending || jobs.isPending) && <p role="status" className="py-3 text-xs text-muted-foreground">Loading history…</p>}
          {(history.isError || jobs.isError) && <div role="alert" className="py-2 text-xs"><p>History is incomplete. Showing available results.</p><Button size="sm" variant="ghost" onClick={() => { void history.refetch(); void jobs.refetch(); }}>Retry history</Button></div>}
          {unsaved.some((item) => item.failed) && <div role="alert" className="py-2 text-xs"><p>Some results are only in this session. Keep this page open until they’re saved.</p><Button size="sm" variant="ghost" onClick={() => unsaved.filter((item) => item.failed).forEach((item) => void saveReceipt(item))}>Retry saving</Button></div>}
          {rows.map((item) => <details key={item.id} className="group border-b border-border last:border-0"><summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 py-2 text-xs [&::-webkit-details-marker]:hidden"><ResultIcon severity={item.severity} /><span className="min-w-0 flex-1">{item.title}</span><time dateTime={item.at} className="shrink-0 text-[10px] text-muted-foreground">{formatLocalizedDateTime(item.at)}</time><ChevronRight className="size-3 shrink-0 group-open:rotate-90" /></summary><div className="space-y-2 pb-3 pl-5 text-xs text-muted-foreground"><p>{new Date(item.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' })}</p><p className="break-words leading-relaxed">{item.message || item.title}</p>{item.job && <><p>{item.job.status}{item.job.subjectId ? ` · ${item.job.subjectId}` : ''}</p><JobSteps job={item.job} /></>}</div></details>)}
          {!history.isPending && !jobs.isPending && !history.isError && !jobs.isError && rows.length === 0 && <p className="py-4 text-xs text-muted-foreground">No history yet.</p>}
        </TabsContent>
      </Tabs>
      <div className="flex shrink-0 items-center justify-between border-t border-border pt-2 text-[10px] text-muted-foreground"><span>Dismissed popups stay in History.</span><Link to="/activity" onClick={() => setOpen(false)} className="underline underline-offset-2">Activity log</Link></div>
    </PopoverContent>
  </Popover>;
}

function ResultIcon({ severity }: { severity: string }) {
  const Icon = severity === 'success' ? Check : severity === 'info' ? Info : CircleAlert;
  return <Icon role="img" aria-label={severity} className={cn('size-3.5 shrink-0', severity === 'success' ? 'text-emerald-600 dark:text-emerald-300' : severity === 'info' ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-200')} />;
}

function JobSteps({ job }: { job: AutarkOsJob }) {
  if (!job.steps.length) return null;
  return <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Steps</summary><ol className="mt-2 space-y-2">{job.steps.map((step) => <li key={step.id}>{step.label} · {step.status}{step.message && <p className="mt-1 break-words">{step.message}</p>}</li>)}</ol></details>;
}
