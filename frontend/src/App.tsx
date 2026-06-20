import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { SystemAPIClient } from './api/SystemAPIClient';
import { ProjectSettingsProvider } from './contexts/ProjectSettingsContext';
import AppShell from './layout/AppShell';
import { routeAliases } from './layout/navigationModel';
import OnboardingWizard from './pages/OnboardingPage/OnboardingWizard';

const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage/ApplicationsPage'));
const BackupsPage = lazy(() => import('./pages/BackupsPage/BackupsPage'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage/MarketplacePage'));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage/MonitoringPage'));
const NetworkPage = lazy(() => import('./pages/NetworkPage/NetworkPage'));
const OverviewPage = lazy(() => import('./pages/OverviewPage/OverviewPage'));
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
    </ProjectSettingsProvider>
  );
}

function AppContent() {
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    SystemAPIClient.onboarding()
      .then((state) => setOnboardingComplete(state.status === 'complete'))
      .catch(() => setOnboardingComplete(true));
  }, []);

  if (onboardingComplete === null) {
    return <PageFallback />;
  }

  if (!onboardingComplete) {
    return <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate replace to="/home" />} />
        {Object.entries(routeAliases).map(([from, to]) => (
          <Route element={<Navigate replace to={to} />} key={from} path={from} />
        ))}
        <Route path="/home" element={<Suspense fallback={<PageFallback />}><OverviewPage /></Suspense>} />
        <Route path="/apps" element={<Suspense fallback={<PageFallback />}><ApplicationsPage /></Suspense>} />
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

export default App;
