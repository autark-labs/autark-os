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
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { Button } from '@/components/ui/button';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { useSettingsDialog } from '@/contexts/SettingsDialogContext';
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
  pro: ShieldCheck,
  settings: Settings,
  storage: Database,
};

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
};

export function sidebarUpdateIndicator(updateStatus?: string) {
  if (updateStatus === 'current') {
    return { label: 'Up to date', tone: 'current' as const };
  }
  if (updateStatus === 'available') {
    return { label: 'Update available', tone: 'available' as const };
  }
  return { label: 'Run autark-os update', tone: 'check' as const };
}

function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const { setViewMode, settings, viewMode } = useProjectSettings();
  const { openSettings } = useSettingsDialog();
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
  const deviceName = settings?.deviceName || setup?.runAsUser || 'Autark-OS';
  const versionLabel = version?.version ? `v${version.version}` : 'Version unknown';
  const updateIndicator = sidebarUpdateIndicator(version?.updateStatus);
  const navGroups = navigationGroups(viewMode) as NavGroup[];

  return (
    <aside className={cn(
      'z-30 hidden h-screen flex-col border-r border-sky-400/25 bg-slate-950 text-slate-50 shadow-xl shadow-slate-950/30 transition-[padding] duration-300 lg:sticky lg:top-0 lg:flex',
      collapsed ? 'items-center p-2' : 'p-3',
    )}>
      <div className={cn('mb-4 flex w-full items-center gap-3 lg:mb-6', collapsed ? 'px-0 lg:justify-center' : 'px-2')}>
        <div className={cn('grid place-items-center rounded-lg border border-cyan-300/35 bg-cyan-300 font-black text-slate-950 shadow-lg shadow-cyan-950/30', collapsed ? 'size-9 text-sm' : 'size-10')}>
          A
        </div>
        {!collapsed && <div className="min-w-0">
          <p className="m-0 text-xs font-semibold text-cyan-200">Autark-OS</p>
          <h1 className="m-0 text-base font-bold leading-none text-white">Console</h1>
        </div>}
      </div>

      <button
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={cn(
          'mb-5 hidden items-center justify-center rounded-lg border border-sky-400/30 bg-slate-900 text-sky-100/70 transition hover:border-cyan-300/45 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 lg:inline-flex',
          collapsed ? 'size-9' : 'h-8 w-full gap-2',
        )}
        onClick={onToggleCollapse}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        type="button"
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        {!collapsed && <span className="text-xs font-semibold">Collapse</span>}
      </button>

      <nav className={cn('grid gap-2 overflow-x-hidden overflow-y-auto pb-0', collapsed ? 'px-0' : 'pr-0')} aria-label="Primary navigation">
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
                      'group flex min-h-10 shrink-0 items-center rounded-lg text-sm font-medium text-slate-300 no-underline transition hover:bg-slate-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300',
                      collapsed ? 'gap-2 px-3 lg:w-10 lg:justify-center lg:px-0' : 'gap-3 px-3',
                      (navActive || isActive) &&
                        'bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/30 hover:bg-cyan-200 hover:text-slate-950',
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
                          'grid place-items-center rounded-md text-sky-200/70 transition group-hover:text-cyan-100',
                          collapsed ? 'size-7 bg-transparent' : 'size-7',
                          (navActive || isActive) && 'text-slate-950 group-hover:text-slate-950',
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
            aria-label="Open settings"
            className="grid size-9 place-items-center rounded-lg border border-sky-400/30 bg-slate-900 text-sky-100 transition hover:border-cyan-300/45 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            onClick={() => openSettings()}
            title="Settings"
            type="button"
          >
            <Settings className="size-4" />
          </button>
          <button
            aria-label={`Switch to ${viewMode === 'advanced' ? 'Basic' : 'Advanced'} view`}
            className="grid size-9 place-items-center rounded-lg border border-sky-400/30 bg-slate-900 text-xs font-bold text-sky-100 transition hover:border-cyan-300/45 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            onClick={() => setViewMode(viewMode === 'advanced' ? 'basic' : 'advanced')}
            title={`View mode: ${viewMode === 'advanced' ? 'Advanced' : 'Basic'}`}
            type="button"
          >
            {viewMode === 'advanced' ? 'A' : 'B'}
          </button>
          <div className={cn('mx-auto size-2 rounded-full', setupReady ? 'bg-cyan-300 shadow-lg shadow-cyan-400/30' : 'bg-orange-500 shadow-lg shadow-orange-500/30')} title={setupReady ? 'Ready for your apps' : 'Setup needs attention'} />
        </div>
      ) : <div className="mt-6 hidden rounded-xl border border-sky-400/25 bg-slate-900 p-3 shadow-lg shadow-slate-950/20 lg:mt-auto lg:block">
          <div className="flex items-start gap-3">
          <button
            aria-label="Open settings"
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-400/10 text-cyan-200 transition hover:bg-cyan-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            onClick={() => openSettings()}
            title="Settings"
            type="button"
          >
            <Settings className="size-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-bold text-white">{deviceName}</span>
              <span className="shrink-0 rounded-full border border-sky-400/25 bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300">{versionLabel}</span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-400">{setup?.devMode ? 'Development mode' : 'Autark-OS appliance'}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 rounded-lg border border-sky-400/20 bg-slate-800 p-2 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', setupReady ? 'bg-cyan-300 shadow-lg shadow-cyan-400/30' : 'bg-orange-500 shadow-lg shadow-orange-500/30')} />
            <span>{setupReady ? 'Ready for your apps' : 'Setup needs attention'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              'size-2 rounded-full',
              updateIndicator.tone === 'current' && 'bg-cyan-300 shadow-lg shadow-cyan-400/30',
              updateIndicator.tone === 'available' && 'bg-orange-500 shadow-lg shadow-orange-500/30',
              updateIndicator.tone === 'check' && 'bg-slate-400 shadow-lg shadow-slate-500/20',
            )} />
            <span>{updateIndicator.label}</span>
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
            <span>View mode</span>
            <span className="font-semibold text-white">{viewMode === 'advanced' ? 'Advanced' : 'Basic'}</span>
          </div>
          <SidebarViewModeToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
      </div>}
    </aside>
  );
}

function SidebarViewModeToggle({ onChange, viewMode }: { onChange: (value: 'basic' | 'advanced') => void; viewMode: 'basic' | 'advanced' }) {
  const advanced = viewMode === 'advanced';

  return (
    <div className="grid grid-cols-2 rounded-lg border border-sky-400/25 bg-slate-800 p-1 text-xs font-semibold">
      <Button
        className={cn(
          'h-7 rounded-md px-2 text-xs',
          !advanced ? 'bg-cyan-300 text-slate-950 shadow-md shadow-cyan-950/25 hover:bg-cyan-200' : 'bg-transparent text-slate-400 hover:bg-slate-700 hover:text-white',
        )}
        onClick={() => onChange('basic')}
        type="button"
        variant="ghost"
      >
        Basic
      </Button>
      <Button
        className={cn(
          'h-7 rounded-md px-2 text-xs',
          advanced ? 'bg-cyan-300 text-slate-950 shadow-md shadow-cyan-950/25 hover:bg-cyan-200' : 'bg-transparent text-slate-400 hover:bg-slate-700 hover:text-white',
        )}
        onClick={() => onChange('advanced')}
        type="button"
        variant="ghost"
      >
        Advanced
      </Button>
    </div>
  );
}

export default Sidebar;
