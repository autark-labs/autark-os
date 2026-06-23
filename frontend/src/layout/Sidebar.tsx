import { useEffect, useState } from 'react';
import {
  Archive,
  Activity,
  ChevronLeft,
  ChevronRight,
  Compass,
  Database,
  House,
  LayoutGrid,
  Settings,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { ViewModeToggle } from '@/components/project-os/ProjectOSComponents';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import type { ProjectVersionInfo, SystemSetupStatus } from '@/types/system';
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

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
};

function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const { setViewMode, settings, viewMode } = useProjectSettings();
  const [version, setVersion] = useState<ProjectVersionInfo | null>(null);
  const [setup, setSetup] = useState<SystemSetupStatus | null>(null);

  useEffect(() => {
    let ignore = false;

    Promise.allSettled([
      SystemAPIClient.version(),
      SystemAPIClient.setupStatus(),
    ]).then(([versionResult, setupResult]) => {
      if (ignore) {
        return;
      }
      if (versionResult.status === 'fulfilled') {
        setVersion(versionResult.value);
      }
      if (setupResult.status === 'fulfilled') {
        setSetup(setupResult.value);
      }
    });

    return () => {
      ignore = true;
    };
  }, []);

  const setupReady = setup?.status === 'ready' || setup?.status === 'ready_with_notes';
  const deviceName = settings?.deviceName || setup?.runAsUser || 'Project OS';
  const versionLabel = version?.version ? `v${version.version}` : 'Version unknown';
  const updateCurrent = version?.updateStatus === 'current' || !version?.updateStatus;
  const navGroups = navigationGroups(viewMode) as NavGroup[];

  return (
    <aside className={cn(
      'z-30 flex h-auto flex-col border-b border-slate-700/40 bg-slate-950/80 shadow-po-sidebar backdrop-blur-xl transition-[padding] duration-300 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r',
      collapsed ? 'p-2 lg:items-center' : 'p-3',
    )}>
      <div className={cn('mb-4 flex w-full items-center gap-3 lg:mb-6', collapsed ? 'px-0 lg:justify-center' : 'px-2')}>
        <div className={cn('grid place-items-center rounded-lg bg-sky-500 font-black text-white shadow-po-info-glow', collapsed ? 'size-9 text-sm' : 'size-10')}>
          P
        </div>
        {!collapsed && <div className="min-w-0">
          <p className="m-0 text-xs font-semibold text-slate-400">Project OS</p>
          <h1 className="m-0 text-base font-bold leading-none text-white">Console</h1>
        </div>}
      </div>

      <button
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={cn(
          'mb-5 hidden items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/50 text-slate-400 transition hover:border-sky-500/50 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 lg:inline-flex',
          collapsed ? 'size-9' : 'h-8 w-full gap-2',
        )}
        onClick={onToggleCollapse}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        type="button"
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        {!collapsed && <span className="text-xs font-semibold">Collapse</span>}
      </button>

      <nav className={cn('flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-x-hidden lg:overflow-y-auto lg:pb-0', collapsed ? 'lg:gap-2 lg:px-0' : 'lg:gap-2 lg:pr-0')} aria-label="Primary navigation">
        {navGroups.map((group, groupIndex) => (
          <div className={cn('contents lg:grid', collapsed ? 'lg:gap-2' : 'lg:gap-2')} key={group.label || `group-${groupIndex}`}>
            {!collapsed && group.label && <p className="sr-only">{group.label}</p>}
            {group.items.map((item) => {
              const Icon = navIcons[item.icon] || House;
              const isActive = item.activePaths?.includes(location.pathname);

              return (
                <NavLink
                  aria-label={item.label}
                  className={({ isActive: navActive }) =>
                    cn(
                      'group flex min-h-10 shrink-0 items-center rounded-lg text-sm font-medium text-slate-200 no-underline transition hover:bg-slate-800/75 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
                      collapsed ? 'gap-2 px-3 lg:w-10 lg:justify-center lg:px-0' : 'gap-3 px-3',
                      (navActive || isActive) &&
                        'bg-sky-500 text-white shadow-po-info-glow hover:bg-sky-500',
                    )
                  }
                  key={item.label}
                  title={collapsed ? item.label : undefined}
                  to={item.to}
                >
                  {({ isActive: navActive }) => (
                    <>
                      <span
                        className={cn(
                          'grid place-items-center rounded-md text-slate-400 transition group-hover:text-white',
                          collapsed ? 'size-7 bg-transparent' : 'size-7',
                          (navActive || isActive) && 'text-white',
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className={cn('truncate', collapsed && 'lg:hidden')}>{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {collapsed ? (
        <div className="mt-6 hidden gap-3 lg:mt-auto lg:grid">
          <button
            aria-label={`Switch to ${viewMode === 'advanced' ? 'Basic' : 'Advanced'} view`}
            className="grid size-9 place-items-center rounded-lg border border-slate-700/50 bg-slate-900/50 text-xs font-bold text-slate-300 transition hover:border-sky-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            onClick={() => setViewMode(viewMode === 'advanced' ? 'basic' : 'advanced')}
            title={`View mode: ${viewMode === 'advanced' ? 'Advanced' : 'Basic'}`}
            type="button"
          >
            {viewMode === 'advanced' ? 'A' : 'B'}
          </button>
          <div className={cn('mx-auto size-2 rounded-full', setupReady ? 'bg-sky-400 shadow-po-info-glow' : 'bg-amber-400 shadow-po-warning-glow')} title={setupReady ? 'Ready for your apps' : 'Setup needs attention'} />
        </div>
      ) : <div className="mt-6 hidden rounded-xl border border-slate-700/45 bg-slate-900/45 p-3 shadow-po-sm lg:mt-auto lg:block">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-500/12 text-sky-300">
            <Settings className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-bold text-white">{deviceName}</span>
              <span className="shrink-0 rounded-full border border-slate-700/45 bg-slate-950/55 px-2 py-0.5 text-xs font-semibold text-slate-400">{versionLabel}</span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-400">{setup?.devMode ? 'Development mode' : 'Project OS appliance'}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 rounded-lg border border-slate-700/45 bg-slate-950/45 p-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', setupReady ? 'bg-sky-400 shadow-po-info-glow' : 'bg-amber-400 shadow-po-warning-glow')} />
            <span>{setupReady ? 'Ready for your apps' : 'Setup needs attention'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', updateCurrent ? 'bg-sky-400 shadow-po-info-glow' : 'bg-po-info shadow-po-info-glow')} />
            <span>{updateCurrent ? 'Up to date' : 'Update available'}</span>
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
            <span>View mode</span>
            <span className="font-semibold text-slate-200">{viewMode === 'advanced' ? 'Advanced' : 'Basic'}</span>
          </div>
          <ViewModeToggle />
        </div>
      </div>}
    </aside>
  );
}

export default Sidebar;
