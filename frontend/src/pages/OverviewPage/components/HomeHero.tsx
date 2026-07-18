import type { ReactNode } from 'react';
import { Check, CircleAlert, Clock3, Container, Network, type LucideIcon } from 'lucide-react';
import overviewBackground from '@/assets/overviewBackground.webp';
import type { SystemSummary } from '@/types/system';
import type { HomeSummaryAvailability } from '../extensions/OverviewPage.systemStatus';

export function HomeHero({
  deviceName,
  children,
  summaryAvailability,
  summary,
}: {
  children?: ReactNode;
  deviceName: string;
  summaryAvailability: HomeSummaryAvailability;
  summary: SystemSummary | null;
}) {
  const needsReview = Boolean(summary?.issues.length);
  const loading = summaryAvailability === 'loading';
  const unavailable = summaryAvailability === 'unavailable';
  const statusTone = loading ? 'info' : unavailable || needsReview ? 'warning' : 'success';
  const readyStatus = loading ? 'Checking' : unavailable ? 'Status unavailable' : needsReview ? 'Needs review' : 'System healthy';
  const accessStatus = accessHeroStatus(summary);

  return (
    <header className="relative isolate h-[clamp(26rem,calc(100dvh-25rem),36rem)] min-h-[26rem] overflow-hidden bg-[#070d21] text-slate-50">
      <img alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-[58%_46%] opacity-95" src={overviewBackground} />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(5_13_32_/_0.92)_0%,rgb(5_13_32_/_0.5)_32%,rgb(5_13_32_/_0.06)_70%,rgb(5_13_32_/_0.12)_100%)]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(5_13_32_/_0.08)_0%,rgb(5_13_32_/_0.01)_52%,rgb(7_13_33_/_0.42)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-36 bg-gradient-to-b from-transparent via-[#08112a]/20 to-[#071022]/90" />

      <div className="relative flex h-full flex-col justify-between gap-5 p-5 md:p-7">
        <div className="flex items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Autark-OS Console</p>
            <h1 className="m-0 mt-4 text-[clamp(2.5rem,4.5vw,3.35rem)] font-black leading-[0.98] tracking-[-0.04em] text-white">
              {timeGreeting()}, {shortName(deviceName)}.
            </h1>
            <p className="mt-4 text-lg font-medium leading-7 text-slate-100/85">
              {homeHeroSubtitle(summary, summaryAvailability)}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Home server status">
              <HeroStatusChip icon={statusTone === 'warning' ? CircleAlert : Check} label={readyStatus} tone={statusTone} />
              {loading && <HeroStatusChip icon={Clock3} label="Updating" tone="info" />}
              {!loading && <HeroStatusChip icon={Container} label={summary?.docker.ready ? 'Docker ready' : 'Docker needs setup'} tone={summary?.docker.ready ? 'success' : 'warning'} />}
              {!loading && <HeroStatusChip icon={Network} label={accessStatus.label} tone={accessStatus.tone} />}
            </div>
          </div>
        </div>

        {children}
      </div>
    </header>
  );
}

function HeroStatusChip({ icon: Icon, label, tone }: { icon: LucideIcon; label: string; tone: 'info' | 'success' | 'warning' }) {
  const toneClass = tone === 'success'
    ? 'border-emerald-300/20 bg-slate-950/45 text-emerald-100'
    : tone === 'warning'
      ? 'border-amber-300/25 bg-slate-950/55 text-amber-100'
      : 'border-cyan-300/20 bg-slate-950/45 text-cyan-100';
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium backdrop-blur-sm ${toneClass}`}>
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

function homeHeroSubtitle(summary: SystemSummary | null, availability: HomeSummaryAvailability) {
  if (availability === 'loading' && !summary) return 'Autark-OS is checking your home server.';
  if (availability === 'unavailable' && !summary) return 'Autark-OS could not load the current server status.';
  if (summary?.issues.length) return 'Your server needs a quick look.';
  if (summary?.setup.complete === false) return summary.setup.summary || 'Finish setup to unlock the full Autark-OS experience.';
  return 'Your digital home is ready.';
}

function accessHeroStatus(summary: SystemSummary | null) {
  if (summary?.access.mode === 'private_ready') return { label: 'Private access ready', tone: 'success' as const };
  if (summary?.access.mode === 'local_only') return { label: 'Local access ready', tone: 'success' as const };
  if (summary?.access.mode === 'mocked_dev') return { label: 'Development access', tone: 'info' as const };
  if (summary?.access.mode === 'private_needs_setup' || summary?.access.mode === 'not_ready') return { label: 'Access needs setup', tone: 'warning' as const };
  return { label: 'Access unavailable', tone: 'warning' as const };
}

function timeGreeting() {
  const hour = new Date(Date.now()).getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function shortName(value: string) {
  return value.split(/[\s.-]+/).filter(Boolean)[0]?.replace(/^./, (first) => first.toUpperCase()) || 'there';
}
