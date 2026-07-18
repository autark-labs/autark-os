import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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

  const openSettings = useCallback((nextGroup: SettingsGroupId = 'general') => {
    setGroup(nextGroup);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('settings') === 'open') {
      setOpen(true);
    }
  }, [location.search]);

  const value = useMemo(() => ({ openSettings }), [openSettings]);

  return (
    <SettingsDialogContext.Provider value={value}>
      {children}
      <Dialog onOpenChange={(nextOpen) => nextOpen && setOpen(true)} open={open}>
        <DialogContent
          aria-describedby={undefined}
          className="flex h-[min(90dvh,54rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden border-sky-400/30 bg-slate-800 p-0 text-slate-50 sm:max-w-5xl"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Autark-OS settings</DialogTitle>
          <SettingsPage embedded initialGroup={group} key={group} onRequestClose={() => setOpen(false)} />
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
