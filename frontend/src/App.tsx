import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { SystemAPIClient } from './api/SystemAPIClient';
import { ProjectSettingsProvider } from './contexts/ProjectSettingsContext';
import AppShell from './layout/AppShell';
import OnboardingWizard from './pages/OnboardingPage/OnboardingWizard';

const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage/ApplicationsPage'));
const BackupsPage = lazy(() => import('./pages/BackupsPage/BackupsPage'));
const DevicesPage = lazy(() => import('./pages/DevicesPage/DevicesPage'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage/MarketplacePage'));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage/MonitoringPage'));
const NetworkPage = lazy(() => import('./pages/NetworkPage/NetworkPage'));
const OverviewPage = lazy(() => import('./pages/OverviewPage/OverviewPage'));
const AutomationPreviewPage = lazy(() => import('./pages/AutomationPage/AutomationPreviewPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage/SettingsPage'));
const StoragePage = lazy(() => import('./pages/StoragePage/StoragePage'));
const SupportPage = lazy(() => import('./pages/SupportPage/SupportPage'));
const UpdatesPage = lazy(() => import('./pages/UpdatesPage/UpdatesPage'));

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
        <Route index element={<Navigate replace to="/overview" />} />
        <Route path="/overview" element={<Suspense fallback={<PageFallback />}><OverviewPage /></Suspense>} />
        <Route path="/applications" element={<Suspense fallback={<PageFallback />}><ApplicationsPage /></Suspense>} />
        <Route path="/updates" element={<Suspense fallback={<PageFallback />}><UpdatesPage /></Suspense>} />
        <Route path="/marketplace" element={<Suspense fallback={<PageFallback />}><MarketplacePage /></Suspense>} />
        <Route path="/devices" element={<Suspense fallback={<PageFallback />}><DevicesPage /></Suspense>} />
        <Route path="/network" element={<Suspense fallback={<PageFallback />}><NetworkPage /></Suspense>} />
        <Route path="/storage" element={<Suspense fallback={<PageFallback />}><StoragePage /></Suspense>} />
        <Route path="/backups" element={<Suspense fallback={<PageFallback />}><BackupsPage /></Suspense>} />
        <Route path="/monitoring" element={<Suspense fallback={<PageFallback />}><MonitoringPage /></Suspense>} />
        <Route path="/automation" element={<Suspense fallback={<PageFallback />}><AutomationPreviewPage /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
        <Route path="/terminal" element={<Suspense fallback={<PageFallback />}><SupportPage /></Suspense>} />
      </Route>
    </Routes>
  );
}

export default App;
