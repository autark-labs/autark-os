import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { AdminSecurityAPIClient } from './api/AdminSecurityAPIClient';
import { SystemAPIClient } from './api/SystemAPIClient';
import { loadApplicationBootstrap, type ApplicationBootstrap } from './App.bootstrap';
import { safePostSetupPath, setupRedirectTarget } from './App.onboarding';
import { ProjectSettingsProvider } from './contexts/ProjectSettingsContext';
import { AdminSessionControlsProvider } from './contexts/AdminSessionContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ProjectPrimaryButton } from './components/primitives/ProjectButtons';
import AppShell from './layout/AppShell';
import { routeAliases } from './layout/navigationModel';
import { ADMIN_SESSION_EXPIRED_EVENT, clearLegacyAdminToken, markAdminSessionActive, type AdminSessionEndReason } from './lib/adminSecuritySession';
import AdminSecurityGate from './pages/AdminSecurityGate';
import OnboardingWizard from './pages/OnboardingPage/OnboardingWizard';
import { Toaster } from './components/ui/sonner';

const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage/ApplicationsPage').then((module) => ({ default: module.ApplicationsPage })));
const BackupsPage = lazy(() => import('./pages/BackupsPage/BackupsPage'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage/MarketplacePage'));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage/MonitoringPage'));
const NetworkPage = lazy(() => import('./pages/NetworkPage/NetworkPage'));
const OverviewPage = lazy(() => import('./pages/OverviewPage/OverviewPage'));
const ProPage = lazy(() => import('./pages/ProPage/ProPage'));
const ResolveExistingAppsPage = lazy(() => import('./pages/ResolveExistingAppsPage/ResolveExistingAppsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage/SettingsPage'));
const StoragePage = lazy(() => import('./pages/StoragePage/StoragePage'));
const SupportPage = lazy(() => import('./pages/SupportPage/SupportPage'));

type BootState =
  | { phase: 'loading' }
  | { phase: 'ready'; bootstrap: ApplicationBootstrap }
  | { phase: 'unavailable'; message: string; cause: unknown };

function PageFallback({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={fullScreen
        ? 'grid min-h-screen place-items-center bg-slate-950 p-6 text-sm text-slate-300'
        : 'grid min-h-[420px] place-items-center rounded-2xl border border-sky-400/30 bg-slate-900 text-sm text-slate-400 shadow-xl shadow-slate-950/30'}
      role="status"
    >
      <div className="grid justify-items-center gap-3 text-center">
        <Loader2 className="size-6 animate-spin text-cyan-200" />
        <span>{fullScreen ? 'Starting Autark-OS' : 'Loading page'}</span>
      </div>
    </div>
  );
}

function BootstrapUnavailableScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main aria-labelledby="application-unavailable-title" className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-50">
      <section className="w-full max-w-lg rounded-2xl border border-amber-300/30 bg-slate-900 p-6 shadow-xl shadow-slate-950/40 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-amber-300/25 bg-amber-400/10 text-amber-100">
            <AlertTriangle aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-white" id="application-unavailable-title">Autark-OS is unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">{message}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Make sure the Autark-OS service is running, then try again.</p>
            <ProjectPrimaryButton autoFocus className="mt-5" onClick={onRetry} type="button">
              <RefreshCw className="size-4" />
              Try again
            </ProjectPrimaryButton>
          </div>
        </div>
      </section>
    </main>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
      <Toaster closeButton position="top-right" richColors />
    </ThemeProvider>
  );
}

function AppContent() {
  const [bootState, setBootState] = useState<BootState>({ phase: 'loading' });
  const bootstrapRequestId = useRef(0);
  const bootInProgress = useRef(false);

  const bootstrap = useCallback(async () => {
    if (bootInProgress.current) {
      return;
    }

    const requestId = ++bootstrapRequestId.current;
    bootInProgress.current = true;
    setBootState({ phase: 'loading' });

    try {
      const result = await loadApplicationBootstrap({
        getSecurityStatus: AdminSecurityAPIClient.status,
        getOnboardingState: SystemAPIClient.onboarding,
        validateAdminSession: AdminSecurityAPIClient.session,
        clearLegacyAdminToken,
      });
      if (bootstrapRequestId.current === requestId) {
        setBootState({ phase: 'ready', bootstrap: result });
      }
    } catch (cause) {
      if (bootstrapRequestId.current === requestId) {
        setBootState({
          phase: 'unavailable',
          message: 'Autark-OS could not reach the local service.',
          cause,
        });
      }
    } finally {
      if (bootstrapRequestId.current === requestId) {
        bootInProgress.current = false;
      }
    }
  }, []);

  useEffect(() => {
    void bootstrap();
    return () => {
      bootstrapRequestId.current += 1;
      bootInProgress.current = false;
    };
  }, [bootstrap]);

  if (bootState.phase === 'loading') {
    return <PageFallback fullScreen />;
  }

  if (bootState.phase === 'unavailable') {
    return <BootstrapUnavailableScreen message={bootState.message} onRetry={() => void bootstrap()} />;
  }

  return <ReadyApplication bootstrap={bootState.bootstrap} onRebootstrap={() => void bootstrap()} />;
}

function ReadyApplication({ bootstrap, onRebootstrap }: { bootstrap: ApplicationBootstrap; onRebootstrap: () => void }) {
  const [authenticated, setAuthenticated] = useState(bootstrap.authenticated);
  const [onboardingComplete, setOnboardingComplete] = useState(bootstrap.onboardingComplete);
  const [sessionEndedReason, setSessionEndedReason] = useState<AdminSessionEndReason | null>(null);

  useEffect(() => {
    const handleExpiredSession = (event: Event) => {
      setAuthenticated(false);
      setSessionEndedReason((event as CustomEvent<AdminSessionEndReason>).detail || 'expired');
    };
    globalThis.addEventListener?.(ADMIN_SESSION_EXPIRED_EVENT, handleExpiredSession);
    return () => globalThis.removeEventListener?.(ADMIN_SESSION_EXPIRED_EVENT, handleExpiredSession);
  }, []);

  useEffect(() => {
    if (authenticated) {
      markAdminSessionActive();
    }
  }, [authenticated]);

  if (bootstrap.securityStatus.authRequired && !bootstrap.securityStatus.devMode && !authenticated) {
    return <AdminSecurityGate onAuthenticated={onRebootstrap} sessionEndedReason={sessionEndedReason} status={bootstrap.securityStatus} />;
  }

  if (!onboardingComplete) {
    return (
      <ProjectSettingsProvider>
        <IncompleteOnboardingRoutes onComplete={() => setOnboardingComplete(true)} />
      </ProjectSettingsProvider>
    );
  }

  return (
    <AdminSessionControlsProvider enabled={bootstrap.securityStatus.authRequired && !bootstrap.securityStatus.devMode}>
      <ProjectSettingsProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate replace to="/home" />} />
            {Object.entries(routeAliases).map(([from, to]) => (
              <Route element={<Navigate replace to={to} />} key={from} path={from} />
            ))}
            <Route path="/home" element={<Suspense fallback={<PageFallback />}><OverviewPage /></Suspense>} />
            <Route path="/setup" element={<Navigate replace to="/home" />} />
            <Route path="/apps" element={<Suspense fallback={<PageFallback />}><ApplicationsPage /></Suspense>} />
            <Route path="/apps/found" element={<Suspense fallback={<PageFallback />}><ResolveExistingAppsPage /></Suspense>} />
            <Route path="/resolve-existing-apps" element={<Navigate replace to="/apps/found" />} />
            <Route path="/discover" element={<Suspense fallback={<PageFallback />}><MarketplacePage /></Suspense>} />
            <Route path="/access" element={<Suspense fallback={<PageFallback />}><NetworkPage /></Suspense>} />
            <Route path="/storage" element={<Suspense fallback={<PageFallback />}><StoragePage /></Suspense>} />
            <Route path="/backups" element={<Suspense fallback={<PageFallback />}><BackupsPage /></Suspense>} />
            <Route path="/pro" element={<Suspense fallback={<PageFallback />}><ProPage /></Suspense>} />
            <Route path="/activity" element={<Suspense fallback={<PageFallback />}><MonitoringPage /></Suspense>} />
            <Route path="/settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
            <Route path="/diagnostics" element={<Suspense fallback={<PageFallback />}><SupportPage /></Suspense>} />
          </Route>
        </Routes>
      </ProjectSettingsProvider>
    </AdminSessionControlsProvider>
  );
}

function IncompleteOnboardingRoutes({ onComplete }: { onComplete: () => void }) {
  return (
    <Routes>
      <Route path="/setup" element={<Suspense fallback={<PageFallback fullScreen />}><SetupRoute onComplete={onComplete} /></Suspense>} />
      <Route path="*" element={<RedirectToSetup />} />
    </Routes>
  );
}

function RedirectToSetup() {
  const location = useLocation();
  return <Navigate replace to={setupRedirectTarget(location.pathname, location.search, location.hash)} />;
}

function SetupRoute({ onComplete }: { onComplete: () => void }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safePostSetupPath(searchParams.get('returnTo'));
  return (
    <OnboardingWizard
      onComplete={() => {
        onComplete();
        navigate(returnTo, { replace: true });
      }}
    />
  );
}

export default App;
