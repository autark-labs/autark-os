import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AdminSecurityAPIClient, type AdminSecurityStatus } from './api/AdminSecurityAPIClient';
import { SystemAPIClient } from './api/SystemAPIClient';
import { ProjectSettingsProvider } from './contexts/ProjectSettingsContext';
import AppShell from './layout/AppShell';
import { routeAliases } from './layout/navigationModel';
import { readAdminToken } from './lib/adminSecuritySession';
import AdminSecurityGate from './pages/AdminSecurityGate';
import OnboardingWizard from './pages/OnboardingPage/OnboardingWizard';
import { GlobalNotifications } from './components/project-os/GlobalNotifications';

const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage/ApplicationsPage'));
const BackupsPage = lazy(() => import('./pages/BackupsPage/BackupsPage'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage/MarketplacePage'));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage/MonitoringPage'));
const NetworkPage = lazy(() => import('./pages/NetworkPage/NetworkPage'));
const OverviewPage = lazy(() => import('./pages/OverviewPage/OverviewPage'));
const ResolveExistingAppsPage = lazy(() => import('./pages/ResolveExistingAppsPage/ResolveExistingAppsPage'));
const AutomationPreviewPage = lazy(() => import('./pages/AutomationPage/AutomationPreviewPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage/SettingsPage'));
const StoragePage = lazy(() => import('./pages/StoragePage/StoragePage'));
const SupportPage = lazy(() => import('./pages/SupportPage/SupportPage'));

function PageFallback() {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-po-lg border border-po-border bg-po-surface-soft text-sm text-po-text-muted shadow-po-md">
      Loading page
    </div>
  );
}

function App() {
  return (
    <ProjectSettingsProvider>
      <AppContent />
      <GlobalNotifications />
    </ProjectSettingsProvider>
  );
}

function AppContent() {
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [securityStatus, setSecurityStatus] = useState<AdminSecurityStatus | null>(null);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    AdminSecurityAPIClient.status()
      .then((status) => {
        setSecurityStatus(status);
        setAuthenticated(!status.authRequired || status.devMode || Boolean(readAdminToken()));
        return SystemAPIClient.onboarding();
      })
      .then((state) => setOnboardingComplete(state.status === 'complete'))
      .catch(() => {
        setSecurityStatus({ devMode: false, claimed: true, authRequired: false, message: '', setupCode: '' });
        setAuthenticated(true);
        setOnboardingComplete(true);
      });
  }, []);

  if (onboardingComplete === null || securityStatus === null) {
    return <PageFallback />;
  }

  if (securityStatus.authRequired && !securityStatus.devMode && !authenticated) {
    return <AdminSecurityGate onAuthenticated={() => setAuthenticated(true)} status={securityStatus} />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate replace to={onboardingComplete ? '/home' : '/setup'} />} />
        {Object.entries(routeAliases).map(([from, to]) => (
          <Route element={<Navigate replace to={to} />} key={from} path={from} />
        ))}
        <Route path="/home" element={onboardingComplete ? <Suspense fallback={<PageFallback />}><OverviewPage /></Suspense> : <Navigate replace to="/setup" />} />
        <Route path="/setup" element={<Suspense fallback={<PageFallback />}><SetupRoute onComplete={() => setOnboardingComplete(true)} /></Suspense>} />
        <Route path="/apps" element={<Suspense fallback={<PageFallback />}><ApplicationsPage /></Suspense>} />
        <Route path="/apps/found" element={<Suspense fallback={<PageFallback />}><ResolveExistingAppsPage /></Suspense>} />
        <Route path="/resolve-existing-apps" element={<Navigate replace to="/apps/found" />} />
        <Route path="/discover" element={<Suspense fallback={<PageFallback />}><MarketplacePage /></Suspense>} />
        <Route path="/access" element={<Suspense fallback={<PageFallback />}><NetworkPage /></Suspense>} />
        <Route path="/storage" element={<Suspense fallback={<PageFallback />}><StoragePage /></Suspense>} />
        <Route path="/backups" element={<Suspense fallback={<PageFallback />}><BackupsPage /></Suspense>} />
        <Route path="/activity" element={<Suspense fallback={<PageFallback />}><MonitoringPage /></Suspense>} />
        <Route path="/automation" element={<Suspense fallback={<PageFallback />}><AutomationPreviewPage /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
        <Route path="/diagnostics" element={<Suspense fallback={<PageFallback />}><SupportPage /></Suspense>} />
      </Route>
    </Routes>
  );
}

function SetupRoute({ onComplete }: { onComplete: () => void }) {
  const navigate = useNavigate();
  return (
    <OnboardingWizard
      onComplete={() => {
        onComplete();
        navigate('/home', { replace: true });
      }}
    />
  );
}

export default App;
