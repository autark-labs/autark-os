import { Activity, Archive, CheckCircle2, CircleAlert, Compass, Database, House, LayoutGrid, Loader2, Menu, Settings, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { TailscaleControlPopover } from '@/components/project-os/TailscaleControlPopover';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import { jobTypeLabel, useGlobalActiveProjectOsJob } from '@/repositories/jobRepository';
import { useSystemDoctorQuery } from '@/repositories/systemRepository';
import { navigationGroups } from './navigationModel';

type NavItem = {
  label: string;
  to: string;
  icon: string;
  activePaths?: string[];
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

const navIcons: Record<string, LucideIcon> = {
  access: Users,
  activity: Activity,
  apps: LayoutGrid,
  backups: Archive,
  diagnostics: Activity,
  discover: Compass,
  home: House,
  settings: Settings,
  storage: Database,
};

function MobileAppBar() {
  const location = useLocation();
  const { viewMode } = useProjectSettings();
  const doctorQuery = useSystemDoctorQuery();
  const activeJobQuery = useGlobalActiveProjectOsJob();
  const navGroups = navigationGroups(viewMode) as NavGroup[];
  const activeJob = activeJobQuery.activeJob;
  const checks = doctorQuery.data?.checks ?? [];
  const tailscaleCheck = checks.find((check) => check.id === 'tailscale') ?? null;
  const issueCount = checks.filter((check) => check.status !== 'ok').length;
  const statusLabel = activeJob ? 'Working' : doctorQuery.isLoading ? 'Checking' : issueCount ? 'Needs attention' : 'Ready';
  const statusTone = activeJob ? 'info' : issueCount ? 'warning' : 'success';

  return (
    <div className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-po-border bg-po-sidebar px-4 text-sidebar-foreground shadow-po-sidebar lg:hidden">
      <div className="min-w-0">
        <p className="m-0 truncate text-xs font-semibold uppercase tracking-normal text-po-brand-strong">Project OS</p>
        <h1 className="m-0 truncate text-base font-black leading-none text-sidebar-foreground">Appliance</h1>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Sheet>
          <SheetTrigger asChild>
            <Button aria-label="Open system status" className="border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80" size="sm" type="button" variant="outline">
              {activeJob ? <Loader2 className="size-4 animate-spin" /> : statusTone === 'success' ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
              <span className="sr-only">Status</span>
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[min(92vw,22rem)] overflow-y-auto border-sidebar-border bg-po-sidebar p-0 text-sidebar-foreground" side="right">
            <SheetHeader className="border-b border-sidebar-border p-4">
              <SheetTitle className="text-sidebar-foreground">System status</SheetTitle>
              <SheetDescription>Project OS health and active work.</SheetDescription>
            </SheetHeader>
            <div className="grid gap-4 p-4">
              <div className={cn(
                'rounded-xl border p-3',
                statusTone === 'success' && 'border-po-info-border bg-po-info-soft',
                statusTone === 'warning' && 'border-po-warning-border bg-po-warning-soft',
                statusTone === 'info' && 'border-po-info-border bg-po-info-soft',
              )}>
                <p className="m-0 text-xs font-black uppercase tracking-normal text-sidebar-foreground/62">Current state</p>
                <p className="m-0 mt-1 text-base font-black text-sidebar-foreground">{statusLabel}</p>
                <p className="m-0 mt-1 text-sm text-sidebar-foreground/75">
                  {activeJob ? `${jobTypeLabel(activeJob.type)} is in progress.` : issueCount ? `${issueCount} setup check${issueCount === 1 ? '' : 's'} need attention.` : 'Project OS is ready for core app flows.'}
                </p>
              </div>

              <div className="rounded-xl border border-sidebar-border bg-po-surface-inset p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="m-0 text-xs font-black uppercase tracking-normal text-sidebar-foreground/62">Private access</p>
                    <p className="m-0 mt-1 text-sm text-sidebar-foreground/75">Check or manage secure Tailscale access without leaving mobile navigation.</p>
                  </div>
                  <TailscaleControlPopover align="start" check={tailscaleCheck} className="shrink-0" loading={doctorQuery.isLoading} triggerLabel="compact" />
                </div>
              </div>

              {checks.length > 0 && (
                <div className="grid gap-2">
                  {checks.slice(0, 4).map((check) => (
                    <div className="rounded-lg border border-sidebar-border bg-po-surface-inset p-3" key={check.id}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="m-0 text-sm font-semibold text-sidebar-foreground">{check.label || check.id}</p>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', check.status === 'ok' ? 'bg-po-info-soft text-po-brand-strong' : 'bg-po-warning-soft text-orange-200')}>{check.status === 'ok' ? 'Ready' : 'Check'}</span>
                      </div>
                      <p className="m-0 mt-1 text-xs text-sidebar-foreground/62">{check.message}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button asChild className="border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80" size="sm" variant="outline">
                  <Link to="/diagnostics">Diagnostics</Link>
                </Button>
                <Button asChild className="border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80" size="sm" variant="outline">
                  <Link to="/settings">Settings</Link>
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <Sheet>
          <SheetTrigger asChild>
            <Button aria-label="Open navigation" className="border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80" size="sm" type="button" variant="outline">
              <Menu data-icon="inline-start" />
              Menu
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[min(92vw,22rem)] overflow-y-auto border-sidebar-border bg-po-sidebar p-0 text-sidebar-foreground" side="left">
            <SheetHeader className="border-b border-sidebar-border p-4">
              <SheetTitle className="text-sidebar-foreground">Project OS navigation</SheetTitle>
              <SheetDescription>Move between core appliance flows and advanced tools.</SheetDescription>
            </SheetHeader>
            <nav aria-label="Mobile navigation" className="grid gap-5 p-4">
              {navGroups.map((group, groupIndex) => (
                <section className="grid gap-2" key={group.label || `group-${groupIndex}`}>
                  {group.label && <p className="m-0 text-xs font-black uppercase tracking-normal text-sidebar-foreground/50">{group.label}</p>}
                  <div className="grid gap-1">
                    {group.items.map((item) => {
                      const Icon = navIcons[item.icon] || House;
                      const activeByAlias = item.activePaths?.includes(location.pathname);
                      return (
                        <SheetClose asChild key={item.label}>
                          <NavLink
                            aria-label={item.label}
                            className={({ isActive }) => cn(
                              'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-sidebar-foreground/82 no-underline transition hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-po-info',
                              (isActive || activeByAlias) && 'bg-po-brand text-sidebar-primary-foreground shadow-po-info-glow hover:bg-po-brand'
                            )}
                            to={item.to}
                          >
                            <Icon className="size-4" />
                            <span>{item.label}</span>
                          </NavLink>
                        </SheetClose>
                      );
                    })}
                  </div>
                </section>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

export default MobileAppBar;
