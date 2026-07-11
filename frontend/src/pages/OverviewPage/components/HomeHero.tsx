import { Clock3 } from 'lucide-react';
import overviewBackground from '@/assets/overviewBackground.webp';
import { StatusPill } from '@/components/primitives/StatusPill';
import type { SystemSummary } from '@/types/system';
import type { HomeSummaryAvailability } from '../extensions/OverviewPage.systemStatus';

export function HomeHero({
  deviceName,
  summaryAvailability,
  summary,
}: {
  deviceName: string;
  summaryAvailability: HomeSummaryAvailability;
  summary: SystemSummary | null;
}) {
  const needsReview = Boolean(summary?.issues.length);
  const loading = summaryAvailability === 'loading';
  const unavailable = summaryAvailability === 'unavailable';
  const statusTone = loading ? 'info' : unavailable || needsReview ? 'warning' : 'success';
  const readyStatus = loading ? 'Checking' : unavailable ? 'Status unavailable' : needsReview ? 'Needs review' : 'Ready';

  return (
    <header className="relative overflow-hidden rounded-2xl border border-cyan-800/20 bg-slate-900/70 shadow-2xl shadow-cyan-950/20">
      <div className="relative min-h-[360px] overflow-hidden md:min-h-[430px]">
        <img alt="" className="absolute inset-x-0 top-0 h-full w-full object-cover object-center opacity-95" src={overviewBackground} />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(13_23_40_/_0.48)_0%,rgb(13_23_40_/_0.12)_46%,rgb(13_23_40_/_0.24)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(13_23_40_/_0.03)_0%,rgb(13_23_40_/_0)_40%,rgb(13_23_40_/_0.34)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#0d1728]" />

        <div className="relative z-10 flex min-h-[360px] flex-col justify-between gap-7 p-5 md:min-h-[430px] md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <p className="m-0 text-xs font-black uppercase tracking-normal text-cyan-600">Autark-OS</p>
              <h1 className="m-0 mt-3 text-4xl font-black leading-none text-slate-100 md:text-5xl">
                {timeGreeting()}, {shortName(deviceName)}.
              </h1>
              <p className="mt-4 max-w-xl text-lg font-semibold leading-7 text-slate-100/90">
                {homeHeroSubtitle(summary, summaryAvailability)}
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Open apps, handle the next setup step, and keep your home server calm.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              <StatusPill tone={statusTone}>{readyStatus}</StatusPill>
              {loading && (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 shadow-md shadow-cyan-950/15">
                  <Clock3 className="size-3.5" />
                  Updating
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function homeHeroSubtitle(summary: SystemSummary | null, availability: HomeSummaryAvailability) {
  if (availability === 'loading' && !summary) return 'Autark-OS is checking your home server.';
  if (availability === 'unavailable' && !summary) return 'Autark-OS could not load the current server status.';
  if (summary?.issues.length) return 'Your server needs a quick look.';
  if (summary?.setup.complete === false) return summary.setup.summary || 'Finish setup to unlock the full Autark-OS experience.';
  return 'Your digital home is ready.';
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function shortName(value: string) {
  return value.split(/[\s.-]+/).filter(Boolean)[0]?.replace(/^./, (first) => first.toUpperCase()) || 'there';
}
