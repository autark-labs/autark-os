import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bell, CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { httpClient } from '@/api/httpClient';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ACTION_NOTIFICATION_EVENT, showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { syncCanonicalAppMutationResult } from '@/repositories/canonicalAppMutationRepository';
import { recommendedActionQueryKeys, useRecommendedActionQuery } from '@/repositories/recommendedActionRepository';
import type { AutarkOsAction } from '@/types/app';
import type { RecommendedAction } from '@/types/system';

const dismissedRecommendationsStorageKey = 'autark-os.dismissed-recommendations.v1';
const maxHistory = 20;

type SessionNotification = {
  id: string;
  message?: string;
  occurredAt: string;
  severity: string;
  title: string;
};

type NotificationCenterValue = {
  clearHistory: () => void;
  currentRecommendation: RecommendedAction | null;
  dismissCurrentRecommendation: () => void;
  history: SessionNotification[];
  runAction: (action: AutarkOsAction) => Promise<void>;
  runningActionId: string | null;
};

const NotificationCenterContext = createContext<NotificationCenterValue | null>(null);

export function AppNotificationsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const recommendationQuery = useRecommendedActionQuery();
  const [dismissedIds, setDismissedIds] = useState<string[]>(readDismissedRecommendationIds);
  const [history, setHistory] = useState<SessionNotification[]>([]);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);

  useEffect(() => {
    const addNotification = (event: Event) => {
      const detail = (event as CustomEvent<SessionNotification>).detail;
      if (!detail?.id || !detail.title) return;
      setHistory((current) => [detail, ...current.filter((item) => item.id !== detail.id)].slice(0, maxHistory));
    };
    window.addEventListener(ACTION_NOTIFICATION_EVENT, addNotification);
    return () => window.removeEventListener(ACTION_NOTIFICATION_EVENT, addNotification);
  }, []);

  const currentRecommendation = useMemo(() => {
    const recommendation = recommendationQuery.data ?? null;
    if (!recommendation || recommendation.id === 'no-action-needed' || dismissedIds.includes(recommendation.id)) {
      return null;
    }
    return recommendation;
  }, [dismissedIds, recommendationQuery.data]);

  const dismissCurrentRecommendation = useCallback(() => {
    if (!currentRecommendation) return;
    setDismissedIds((current) => {
      const next = current.includes(currentRecommendation.id) ? current : [...current, currentRecommendation.id];
      window.sessionStorage.setItem(dismissedRecommendationsStorageKey, JSON.stringify(next));
      return next;
    });
  }, [currentRecommendation]);

  const runAction = useCallback(async (action: AutarkOsAction) => {
    if (action.disabled || runningActionId === action.id) return;
    if (action.route) {
      navigate(action.route);
      return;
    }
    if (!action.href) return;
    const method = action.method?.toUpperCase();
    if (!method || method === 'GET') {
      if (action.href.startsWith('http')) {
        window.open(action.href, '_blank', 'noopener,noreferrer');
      } else {
        navigate(action.href);
      }
      return;
    }
    if (action.confirmationRequired && !window.confirm(`Continue with ${action.label}?`)) {
      return;
    }
    setRunningActionId(action.id);
    try {
      const response = await httpClient.request({ method, url: action.href });
      syncCanonicalAppMutationResult(queryClient, response.data);
      showActionNotification(response.data ?? {
        ok: true,
        severity: 'success',
        title: `${action.label} started`,
        message: 'Autark-OS started this action.',
      }, `${action.label} started`);
      await queryClient.invalidateQueries({ queryKey: recommendedActionQueryKeys.all });
    } catch (error) {
      showActionErrorNotification(error, `${action.label} could not start`);
    } finally {
      setRunningActionId(null);
    }
  }, [navigate, queryClient, runningActionId]);

  const value = useMemo<NotificationCenterValue>(() => ({
    clearHistory: () => setHistory([]),
    currentRecommendation,
    dismissCurrentRecommendation,
    history,
    runAction,
    runningActionId,
  }), [currentRecommendation, dismissCurrentRecommendation, history, runAction, runningActionId]);

  return <NotificationCenterContext.Provider value={value}>{children}</NotificationCenterContext.Provider>;
}

export function useAppNotifications() {
  const context = useContext(NotificationCenterContext);
  if (!context) throw new Error('useAppNotifications must be used within AppNotificationsProvider');
  return context;
}

export function NotificationCenterPopover({ className }: { className?: string }) {
  const {
    clearHistory,
    currentRecommendation,
    dismissCurrentRecommendation,
    history,
    runAction,
    runningActionId,
  } = useAppNotifications();
  const count = (currentRecommendation ? 1 : 0) + history.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button aria-label={`Open notifications${count ? ` (${count})` : ''}`} className={cn('relative h-8 border-sky-400/30 bg-slate-900 text-sky-50 hover:bg-slate-800 hover:text-white', className)} size="icon-sm" type="button" variant="outline">
          <Bell className="size-4" />
          {count > 0 && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-orange-500 text-[0.62rem] font-black text-white">{Math.min(count, 9)}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,26rem)] gap-3 border-sky-400/25 bg-slate-950 p-3 text-slate-50">
        <PopoverHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <PopoverTitle className="text-sm text-white">Notifications</PopoverTitle>
              <PopoverDescription className="text-xs text-slate-400">Current attention and this session’s activity.</PopoverDescription>
            </div>
            {history.length > 0 && <Button className="h-7 px-2 text-xs" onClick={clearHistory} size="sm" variant="ghost">Clear history</Button>}
          </div>
        </PopoverHeader>

        {currentRecommendation && (
          <section className={cn('rounded-lg border p-3', recommendationTone(currentRecommendation.severity))} aria-label="Action needed">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{currentRecommendation.title}</p>
                <p className="mt-1 text-xs leading-5 text-current/80">{currentRecommendation.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentRecommendation.primaryAction && <NotificationActionButton action={currentRecommendation.primaryAction} onRun={runAction} running={runningActionId === currentRecommendation.primaryAction.id} />}
                  <Button aria-label="Dismiss current recommendation" className="h-8 px-2 text-xs" onClick={dismissCurrentRecommendation} size="sm" type="button" variant="outline">
                    <X className="size-3.5" />
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {history.map((item) => <HistoryItem item={item} key={item.id} />)}
          {!currentRecommendation && history.length === 0 && <p className="rounded-lg border border-sky-400/20 bg-slate-900 p-3 text-xs text-slate-400">Nothing needs your attention right now.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationActionButton({ action, onRun, running }: { action: AutarkOsAction; onRun: (action: AutarkOsAction) => Promise<void>; running: boolean }) {
  return (
    <Button disabled={action.disabled || running} onClick={() => void onRun(action)} size="sm" type="button" variant="default">
      {running ? 'Starting…' : action.label}
    </Button>
  );
}

function HistoryItem({ item }: { item: SessionNotification }) {
  const Icon = item.severity === 'success' ? CheckCircle2 : item.severity === 'info' ? Info : CircleAlert;
  return (
    <div className={cn('flex gap-2 rounded-lg border p-2.5 text-xs', historyTone(item.severity))}>
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold text-white">{item.title}</p>
        {item.message && <p className="mt-0.5 leading-5 text-current/80">{item.message}</p>}
      </div>
    </div>
  );
}

function readDismissedRecommendationIds() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(dismissedRecommendationsStorageKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function recommendationTone(severity: string) {
  if (severity === 'critical') return 'border-red-400/35 bg-red-500/10 text-red-200';
  if (severity === 'warning') return 'border-orange-400/40 bg-orange-500/10 text-orange-100';
  return 'border-cyan-300/35 bg-cyan-400/10 text-cyan-100';
}

function historyTone(severity: string) {
  if (severity === 'success') return 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100';
  if (severity === 'info') return 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100';
  return 'border-orange-400/35 bg-orange-500/10 text-orange-100';
}
