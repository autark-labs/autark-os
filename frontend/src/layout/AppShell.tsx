import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import MobileAppBar from './MobileAppBar';
import Sidebar from './Sidebar';
import SystemStatusHeader from './SystemStatusHeader';

const sidebarCollapsedStorageKey = 'autark-os.sidebarCollapsed';

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
      'grid min-h-screen grid-cols-1 bg-slate-950 text-slate-50 transition-[grid-template-columns] duration-300',
      sidebarCollapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[210px_minmax(0,1fr)]',
    )}>
      <MobileAppBar />
      <div className="hidden lg:block">
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
      </div>
      <main className="min-w-0 bg-slate-800">
        <div className="hidden lg:block">
          <SystemStatusHeader />
        </div>
        <div className="px-3 pb-4 pt-3 sm:px-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default AppShell;
