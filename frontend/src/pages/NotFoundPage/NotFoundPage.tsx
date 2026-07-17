import { useEffect } from 'react';
import { Compass } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { PageShell } from '@/components/layout/PageShell';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { ProjectPanel } from '@/components/primitives/Surface';
import { appRoutes } from '@/appRouteManifest';

function NotFoundPage() {
  const location = useLocation();

  useEffect(() => {
    document.title = 'Page not found · Autark-OS';
  }, []);

  return (
    <PageShell>
      <ProjectPanel aria-labelledby="not-found-title" className="overflow-hidden p-0">
        <div className="border-b border-cyan-300/20 bg-app-hero-default p-6 md:p-8">
          <MetadataBadge tone="info">Page not found</MetadataBadge>
          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl" id="not-found-title">That page is not part of this Autark-OS server.</h1>
              <p className="mt-4 text-base leading-7 text-sky-100/80">The address may be outdated, misspelled, or no longer available. Your apps and server data are unchanged.</p>
              <p className="mt-3 break-all text-sm text-sky-100/65">Requested address: {location.pathname}</p>
            </div>
            <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-100"><Compass className="size-7" /></span>
          </div>
        </div>
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between md:px-7">
          <p className="text-sm leading-6 text-slate-400">Start from Home to see what is installed and what needs attention.</p>
          <div className="flex flex-wrap gap-2">
            <ProjectDarkControlButton asChild><Link to={appRoutes.apps}>My Apps</Link></ProjectDarkControlButton>
            <ProjectPrimaryButton asChild><Link to={appRoutes.home}>Go to Home</Link></ProjectPrimaryButton>
          </div>
        </div>
      </ProjectPanel>
    </PageShell>
  );
}

export default NotFoundPage;
