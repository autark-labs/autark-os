import { useEffect } from 'react';
import { ArrowRight, Layers3, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageShell } from '@/components/layout/PageShell';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, ProjectPanel } from '@/components/primitives/Surface';

function ProPage() {
  useEffect(() => {
    document.title = 'Autark Pro · Autark-OS';
  }, []);

  return (
    <PageShell>
      <ProjectPanel aria-labelledby="pro-page-title" className="overflow-hidden p-0">
        <div className="border-b border-cyan-300/20 bg-app-hero-default p-6 md:p-8">
          <MetadataBadge tone="info">Separate paid app</MetadataBadge>
          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl" id="pro-page-title">Autark Pro is being built as a standalone app.</h1>
              <p className="mt-4 text-base leading-7 text-sky-100/80">The free Autark-OS appliance stays fully local. It does not register this server, accept license codes, send heartbeats, or connect to a Pro service.</p>
            </div>
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-100"><Sparkles className="size-7" /></span>
          </div>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3 md:p-7">
          <Capability icon={Layers3} title="Multi-server oversight" text="A focused view of the home servers and services you care for." />
          <Capability icon={ShieldCheck} title="Maintenance guidance" text="Clear backup, recovery, and upkeep signals for a growing self-hosted setup." />
          <Capability icon={Sparkles} title="Curated workflows" text="Optional paid workflows and guidance designed for people who want more help operating their stack." />
        </div>
        <div className="flex flex-col gap-3 border-t border-sky-400/20 bg-slate-900 p-5 sm:flex-row sm:items-center sm:justify-between md:px-7">
          <p className="text-sm leading-6 text-slate-400">Availability, pricing, and account details will be announced with the standalone app.</p>
          <div className="flex flex-wrap gap-2">
            <ProjectDarkControlButton asChild><Link to="/home">Back to Home</Link></ProjectDarkControlButton>
            <ProjectPrimaryButton asChild><Link to="/discover">Explore free apps<ArrowRight className="size-4" /></Link></ProjectPrimaryButton>
          </div>
        </div>
      </ProjectPanel>
    </PageShell>
  );
}

function Capability({ icon: Icon, text, title }: { icon: typeof ShieldCheck; text: string; title: string }) {
  return (
    <ProjectInset className="grid gap-3">
      <span className="grid size-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100"><Icon className="size-5" /></span>
      <div><h2 className="font-bold text-white">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-400">{text}</p></div>
    </ProjectInset>
  );
}

export default ProPage;
