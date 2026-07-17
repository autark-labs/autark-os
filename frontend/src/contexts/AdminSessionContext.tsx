import { createContext, type ReactNode, useContext } from 'react';

const AdminSessionControlsContext = createContext(false);

export function AdminSessionControlsProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  return <AdminSessionControlsContext.Provider value={enabled}>{children}</AdminSessionControlsContext.Provider>;
}

export function useAdminSessionControlsEnabled() {
  return useContext(AdminSessionControlsContext);
}
