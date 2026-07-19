import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import SettingsPage from '@/pages/SettingsPage/SettingsPage';
import type { SettingsGroupId } from '@/pages/SettingsPage/SettingsPage.sections';

type SettingsDialogContextValue = {
  openSettings: (group?: SettingsGroupId) => void;
};

const SettingsDialogContext = createContext<SettingsDialogContextValue | null>(null);

export function SettingsDialogProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<SettingsGroupId>('general');
  const closeSettings = useCallback(() => setOpen(false), []);
  const requestDismissRef = useRef<() => void>(closeSettings);

  const registerDismissRequest = useCallback((requestDismiss: () => void) => {
    requestDismissRef.current = requestDismiss;
  }, []);

  const requestDismiss = useCallback(() => {
    requestDismissRef.current();
  }, []);

  const openSettings = useCallback((nextGroup: SettingsGroupId = 'general') => {
    requestDismissRef.current = closeSettings;
    setGroup(nextGroup);
    setOpen(true);
  }, [closeSettings]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('settings') === 'open') {
      requestDismissRef.current = closeSettings;
      setOpen(true);
    }
  }, [closeSettings, location.search]);

  const value = useMemo(() => ({ openSettings }), [openSettings]);

  return (
    <SettingsDialogContext.Provider value={value}>
      {children}
      <Dialog onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : requestDismiss())} open={open}>
        <DialogContent
          aria-describedby={undefined}
          className="flex h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden border-sky-400/30 bg-app-panel p-0 text-slate-50 sm:h-[min(90dvh,48rem)] sm:max-w-5xl"
          onEscapeKeyDown={(event) => { event.preventDefault(); requestDismiss(); }}
          onPointerDownOutside={(event) => { event.preventDefault(); requestDismiss(); }}
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Autark-OS settings</DialogTitle>
          <SettingsPage embedded initialGroup={group} key={group} onRequestClose={closeSettings} onRequestDismiss={registerDismissRequest} />
        </DialogContent>
      </Dialog>
    </SettingsDialogContext.Provider>
  );
}

export function useSettingsDialog() {
  const context = useContext(SettingsDialogContext);
  if (!context) throw new Error('useSettingsDialog must be used within SettingsDialogProvider');
  return context;
}
