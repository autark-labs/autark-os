import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import Sidebar from './Sidebar';
import SystemStatusHeader from './SystemStatusHeader';

const sidebarCollapsedStorageKey = 'project-os.sidebarCollapsed';

function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(sidebarCollapsedStorageKey) === 'true';
  });

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(sidebarCollapsedStorageKey, String(next));
      return next;
    });
  }

  return (
    <div className={cn(
      'grid min-h-screen grid-cols-1 bg-po-bg text-po-text transition-[grid-template-columns] duration-300',
      sidebarCollapsed ? 'lg:grid-cols-[76px_minmax(0,1fr)]' : 'lg:grid-cols-[272px_minmax(0,1fr)]',
    )}>
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
      <main className="min-w-0 bg-po-bg-mesh">
        <SystemStatusHeader />
        <div className="p-[var(--po-space-page-y)] md:p-[var(--po-space-page-x)]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default AppShell;
