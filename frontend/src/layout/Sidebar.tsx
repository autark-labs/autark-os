import { useEffect, useState } from 'react';
import {
  Archive,
  Bot,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Database,
  HardDrive,
  MonitorDot,
  Network,
  Settings,
  SquareTerminal,
  StoreIcon,
  UploadCloud,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { ViewModeToggle } from '@/components/project-os/ProjectOSComponents';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import type { ProjectVersionInfo, SystemSetupStatus } from '@/types/system';

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  activePaths?: string[];
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    items: [
      { label: 'Home', to: '/overview', icon: CircleGauge },
    ],
  },
  {
    label: 'My Homelab',
    items: [
      { label: 'Applications', to: '/applications', icon: Boxes },
      { label: 'Marketplace', to: '/marketplace', icon: StoreIcon },
      { label: 'Files & Storage', to: '/storage', icon: Database },
      { label: 'Devices', to: '/devices', icon: HardDrive },
      { label: 'Access Map', to: '/network', icon: Network },
    ],
  },
  {
    label: 'Protection',
    items: [
      { label: 'Backups', to: '/backups', icon: Archive },
      { label: 'Updates', to: '/updates', icon: UploadCloud },
    ],
  },
  {
    label: 'Automation',
    items: [
      { label: 'Automation', to: '/automation', icon: Bot },
      { label: 'System Activity', to: '/monitoring', icon: MonitorDot },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Settings', to: '/settings', icon: Settings },
      { label: 'Safe Diagnostics', to: '/terminal', icon: SquareTerminal },
    ],
  },
];

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

  return (
    <aside className={cn(
      'sticky top-0 flex h-auto flex-col border-r border-po-border bg-po-sidebar shadow-po-sidebar backdrop-blur-xl transition-[padding] duration-300 lg:h-screen',
      collapsed ? 'items-center p-2' : 'p-3',
    )}>
      <div className={cn('mb-4 flex w-full items-center gap-3', collapsed ? 'justify-center px-0' : 'px-1')}>
        <div className={cn('grid place-items-center rounded-po-md bg-po-brand-gradient font-black text-white shadow-po-brand-glow', collapsed ? 'size-9 text-sm' : 'size-10')}>
          P
        </div>
        {!collapsed && <div className="min-w-0">
          <p className="m-0 text-[0.68rem] font-bold uppercase tracking-normal text-po-text-muted">Project OS</p>
          <h1 className="m-0 text-lg font-bold leading-none text-po-text">Home</h1>
        </div>}
      </div>

      <button
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={cn(
          'mb-4 inline-flex items-center justify-center rounded-po-sm border border-po-border bg-po-surface-inset text-po-text-muted transition hover:border-po-border-accent hover:bg-po-surface-hover hover:text-po-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-po-brand',
          collapsed ? 'size-9' : 'h-8 w-full gap-2',
        )}
        onClick={onToggleCollapse}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        type="button"
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        {!collapsed && <span className="text-xs font-semibold">Collapse</span>}
      </button>

      <nav className={cn('grid overflow-y-auto', collapsed ? 'gap-2 px-0' : 'gap-4 pr-1')} aria-label="Primary navigation">
        {navGroups.map((group, groupIndex) => (
          <div className={cn('grid', collapsed ? 'gap-2' : 'gap-1.5')} key={group.label || `group-${groupIndex}`}>
            {!collapsed && group.label && <p className="mb-1 px-3 text-[0.68rem] font-bold uppercase tracking-normal text-po-text-disabled">{group.label}</p>}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.activePaths?.includes(location.pathname);

              return (
                <NavLink
                  aria-label={item.label}
                  className={({ isActive: navActive }) =>
                    cn(
                      'group flex min-h-9 items-center rounded-po-sm text-sm font-medium text-po-text-secondary no-underline transition hover:bg-po-surface-hover hover:text-po-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-po-brand',
                      collapsed ? 'w-10 justify-center px-0' : 'gap-3 px-3',
                      (navActive || isActive) &&
                        'bg-po-brand-gradient text-white shadow-po-brand-glow',
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
                          'grid place-items-center rounded-po-xs bg-white/10 text-po-text-muted transition group-hover:text-po-text',
                          collapsed ? 'size-7 bg-transparent' : 'size-7',
                          (navActive || isActive) && 'text-white',
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {collapsed ? (
        <div className="mt-6 grid gap-3 lg:mt-auto">
          <button
            aria-label={`Switch to ${viewMode === 'advanced' ? 'Basic' : 'Advanced'} view`}
            className="grid size-9 place-items-center rounded-po-sm border border-po-border bg-po-surface-inset text-[0.68rem] font-bold text-po-text-secondary transition hover:border-po-border-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-po-brand"
            onClick={() => setViewMode(viewMode === 'advanced' ? 'basic' : 'advanced')}
            title={`View mode: ${viewMode === 'advanced' ? 'Advanced' : 'Basic'}`}
            type="button"
          >
            {viewMode === 'advanced' ? 'A' : 'B'}
          </button>
          <div className={cn('mx-auto size-2 rounded-full', setupReady ? 'bg-po-success shadow-po-success-glow' : 'bg-po-warning shadow-po-warning-glow')} title={setupReady ? 'Ready for your apps' : 'Setup needs attention'} />
        </div>
      ) : <div className="mt-6 rounded-po-lg border border-po-border bg-po-surface p-3 shadow-po-sm lg:mt-auto">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-po-sm bg-po-info/10 text-po-info">
            <SquareTerminal className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-bold text-po-text">{deviceName}</span>
              <span className="shrink-0 rounded-full border border-po-border bg-po-surface-inset px-2 py-0.5 text-[0.68rem] font-semibold text-po-text-muted">{versionLabel}</span>
            </div>
            <p className="mt-1 truncate text-xs text-po-text-muted">{setup?.devMode ? 'Development mode' : 'Project OS appliance'}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 rounded-po-sm border border-po-border bg-po-surface-inset p-2 text-xs text-po-text-muted">
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', setupReady ? 'bg-po-success shadow-po-success-glow' : 'bg-po-warning shadow-po-warning-glow')} />
            <span>{setupReady ? 'Ready for your apps' : 'Setup needs attention'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', updateCurrent ? 'bg-po-success shadow-po-success-glow' : 'bg-po-info shadow-[0_0_0_5px_rgb(56_189_248/0.16)]')} />
            <span>{updateCurrent ? 'Up to date' : 'Update available'}</span>
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          <div className="flex items-center justify-between gap-2 text-xs text-po-text-muted">
            <span>View mode</span>
            <span className="font-semibold text-po-text-secondary">{viewMode === 'advanced' ? 'Advanced' : 'Basic'}</span>
          </div>
          <ViewModeToggle />
        </div>
      </div>}
    </aside>
  );
}

export default Sidebar;
