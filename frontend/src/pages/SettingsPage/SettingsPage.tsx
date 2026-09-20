import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AppWindow,
  Code2,
  Database,
  Loader2,
  Network,
  RefreshCw,
  Save,
  Settings,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ContextChip } from '@/components/autark-os/ContextChip';
import { Button } from '@/components/ui/button';
import { ApplicationStateNotice } from '@/components/autark-os/ApplicationStateNotice';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { PageLoadingState } from '@/components/autark-os/PageLoadingState';
import { PageShell } from '@/components/layout/PageShell';
import { ExtensionActionTarget } from '@/extensions/ExtensionActionTarget';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset } from '@/components/primitives/Surface';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { SettingsPanelBySection } from './SettingsPage.panels';
import {
  defaultSettingsGroup,
  sectionsForGroup,
  settingsGroups as topLevelSettingsGroups,
  type SettingsGroupId,
} from './SettingsPage.sections';
import { useSettingsPageController } from './useSettingsPageController';

const groupIcons: Record<SettingsGroupId, LucideIcon> = {
  advanced: Code2,
  apps: AppWindow,
  backups: Database,
  general: Settings,
  network: Network,
};

function SettingsLoadingState() {
  return (
    <PageShell>
      <PageLoadingState model={{ description: 'Reading appliance preferences, setup checks, and app defaults.', title: 'Loading settings' }} />
    </PageShell>
  );
}

function SettingsErrorState({ actionLabel = 'Retry', message, onAction, title }: { actionLabel?: string; message: string; onAction: () => void; title: string }) {
  return <PageLoadError model={{ actionLabel, message, title }} onRetry={onAction} />;
}

/** Composes the Settings controller, navigation, and typed section panels. */
function SettingsPage({
  initialGroup,
  onRequestClose,
  onRequestDismiss,
}: {
  initialGroup: SettingsGroupId;
  onRequestClose: () => void;
  onRequestDismiss: (requestDismiss: () => void) => void;
}) {
  const {
    activeGroup,
    appState,
    confirmRefresh,
    continueNavigation,
    copy,
    copied,
    doctor,
    draft,
    dirty,
    load,
    loadError,
    loading,
    pendingNavigation,
    refreshConfirmationOpen,
    refreshing,
    requestRefresh,
    save,
    saveError,
    saving,
    setActiveGroup,
    setPendingNavigation,
    setRefreshConfirmationOpen,
    state,
    updateDraft,
  } = useSettingsPageController();
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);

  const requiredChecks = useMemo(
    () => state.setup?.checks?.filter((check) => ['runtime-privileges', 'runtime-root', 'docker', 'tailscale'].includes(check.id)) ?? [],
    [state.setup],
  );
  const advancedChecks = useMemo(
    () => state.setup?.checks?.filter((check) => !requiredChecks.includes(check)) ?? [],
    [requiredChecks, state.setup],
  );
  const activeGroupId = defaultSettingsGroup(activeGroup);
  const activeGroupMeta = topLevelSettingsGroups.find((group) => group.id === activeGroupId) || topLevelSettingsGroups[0];

  useEffect(() => {
    setActiveGroup(initialGroup);
  }, [initialGroup, setActiveGroup]);

  const requestClose = useCallback(() => {
    if (dirty) {
      setCloseConfirmationOpen(true);
      return;
    }
    onRequestClose();
  }, [dirty, onRequestClose]);

  useEffect(() => {
    onRequestDismiss(requestClose);
  }, [onRequestDismiss, requestClose]);

  const saveAndClose = async () => {
    if (await save()) {
      setCloseConfirmationOpen(false);
      onRequestClose();
    }
  };

  if (loading) return <SettingsLoadingState />;

  if (!draft) {
    return (
      <PageShell>
        <SettingsErrorState actionLabel="Try again" message={loadError || 'Autark-OS could not load settings.'} onAction={() => void load()} title="Settings are unavailable" />
      </PageShell>
    );
  }

  const activePanelContent = (
    <div className="grid gap-5">
      {sectionsForGroup(activeGroupId).map((sectionId) => (
        <SettingsPanelBySection
          advancedChecks={advancedChecks}
          apps={appState.freshness.hasUsableData ? appState.applications.flatMap((application) => application.relationship === 'managed' && application.runtime ? [application.runtime] : []) : null}
          copied={copied}
          doctor={doctor}
          draft={draft}
          key={sectionId}
          metrics={state.metrics}
          onCopy={copy}
          onUpdate={updateDraft}
          requiredChecks={requiredChecks}
          sectionId={sectionId}
          setup={state.setup}
          version={state.version}
        />
      ))}
    </div>
  );

  return (
    <PageShell contained className="min-h-0 flex-1 bg-app-panel" contentClassName="min-h-0 !gap-0 !overflow-hidden !p-0">
      <ExtensionActionTarget actionId="review-pro" className="flex min-h-0 flex-1" routeId="settings">
        <SettingsWorkbench
          activeGroupId={activeGroupId}
          activeGroupMeta={activeGroupMeta}
          activePanelContent={activePanelContent}
          dirty={dirty}
          loadError={loadError}
          onRequestClose={requestClose}
          onRequestRefresh={requestRefresh}
          onSave={() => void save()}
          onSelectGroup={setActiveGroup}
          refreshing={refreshing}
          saveError={saveError}
          saving={saving}
        />
      </ExtensionActionTarget>

      <AlertDialog open={refreshConfirmationOpen} onOpenChange={setRefreshConfirmationOpen}>
        <AlertDialogContent className="border-orange-400/30 bg-slate-950 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">Refreshing reloads saved settings and discards unsaved edits. Applied backup location changes are not undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refreshing}>Keep editing</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-500 text-white hover:bg-orange-400" disabled={refreshing} onClick={confirmRefresh}>Discard and refresh</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingNavigation)} onOpenChange={(open) => !open && setPendingNavigation(null)}>
        <AlertDialogContent className="border-orange-400/30 bg-slate-950 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">Your settings edits have not been saved. Discarding them does not undo applied backup location changes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-500 text-white hover:bg-orange-400" onClick={continueNavigation}>Discard and leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={closeConfirmationOpen} onOpenChange={setCloseConfirmationOpen}>
        <AlertDialogContent className="border-orange-400/30 bg-slate-950 text-slate-100 sm:!max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Save settings before closing?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">Your settings edits have not been saved. Discarding them does not undo applied backup location changes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <ProjectDarkControlButton onClick={() => { setCloseConfirmationOpen(false); onRequestClose(); }} type="button">Discard changes</ProjectDarkControlButton>
            <ProjectPrimaryButton disabled={saving} onClick={() => void saveAndClose()} type="button">{saving ? 'Saving' : 'Save and close'}</ProjectPrimaryButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function SettingsFeedback({ dirty, loadError, saveError, onRefresh }: { dirty: boolean; loadError: string | null; saveError: string | null; onRefresh: () => void }) {
  return <ContextChip label={saveError ? 'Save failed' : loadError ? 'Refresh paused' : dirty ? 'Unsaved changes' : 'Saved'} title="Settings / Current status" tone={saveError ? 'danger' : loadError || dirty ? 'warning' : 'muted'}>
    <p>{saveError ? `${saveError} Your edits are still here. Use Save changes to retry.` : dirty ? 'Your edits have not been saved yet.' : 'Settings are saved.'}</p>
    {loadError && <><p>{loadError}</p><Button onClick={onRefresh} size="sm" type="button">Refresh settings</Button></>}
  </ContextChip>;
}

function SettingsWorkbench({
  activeGroupId,
  activeGroupMeta,
  activePanelContent,
  dirty,
  loadError,
  onRequestClose,
  onRequestRefresh,
  onSave,
  onSelectGroup,
  refreshing,
  saveError,
  saving,
}: {
  activeGroupId: SettingsGroupId;
  activeGroupMeta: (typeof topLevelSettingsGroups)[number];
  activePanelContent: ReactNode;
  dirty: boolean;
  loadError: string | null;
  onRequestClose: () => void;
  onRequestRefresh: () => void;
  onSave: () => void;
  onSelectGroup: (group: SettingsGroupId) => void;
  refreshing: boolean;
  saveError: string | null;
  saving: boolean;
}) {
  const ActiveGroupIcon = groupIcons[activeGroupId];

  return (
    <section aria-label="Autark-OS settings" className="flex min-h-0 flex-1 overflow-hidden bg-app-panel text-slate-50">
      <aside className="hidden w-52 shrink-0 flex-col border-r border-sky-300/15 bg-slate-950/30 p-3 sm:flex">
        <div className="flex items-center gap-2 px-2 py-2">
          <span className="grid size-7 place-items-center rounded-lg bg-cyan-300 text-slate-950"><Settings className="size-4" /></span>
          <span className="text-sm font-semibold text-white">Settings</span>
        </div>
        <p className="px-2 pb-2 pt-5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-sky-100/60">Appliance controls</p>
        <nav aria-label="Settings categories" className="grid gap-1">
          {topLevelSettingsGroups.map((group) => {
            const groupId = group.id as SettingsGroupId;
            const Icon = groupIcons[groupId];
            const active = groupId === activeGroupId;
            return (
              <button
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                  active ? 'bg-cyan-300/15 text-cyan-100 ring-1 ring-cyan-300/25' : 'text-sky-100/70 hover:bg-slate-800 hover:text-white',
                )}
                key={groupId}
                onClick={() => onSelectGroup(groupId)}
                type="button"
              >
                <Icon className={cn('size-4 shrink-0', active ? 'text-cyan-200' : 'text-sky-100/60')} />
                <span className="min-w-0"><span className="block text-sm font-medium">{group.label}</span><span className="block truncate text-[0.68rem] text-sky-100/60">{group.description}</span></span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-sky-300/15 bg-app-header-surface/90 px-4 py-3 sm:px-5">
          <div className="min-w-0"><ApplicationStateNotice className="max-w-40 [&>span]:max-sm:hidden [&>svg:last-child]:max-sm:hidden" /><h1 className="mt-1 text-lg font-semibold text-white">Appliance settings</h1></div>
          <div className="flex shrink-0 items-center gap-2">
            <SettingsFeedback dirty={dirty} loadError={loadError} saveError={saveError} onRefresh={onRequestRefresh} />
            <DisabledAction disabled={refreshing || saving} reason={saving ? 'Wait for the current save to finish.' : 'Settings are already refreshing.'}>
              <ProjectDarkControlButton aria-label="Refresh settings" className="size-8 px-0" disabled={refreshing || saving} onClick={onRequestRefresh} size="icon-sm" type="button"><RefreshCw className={cn('size-4', refreshing && 'animate-spin')} /></ProjectDarkControlButton>
            </DisabledAction>
            <ProjectDarkControlButton aria-label="Close settings" className="size-8 px-0" onClick={onRequestClose} size="icon-sm" type="button"><X className="size-4" /></ProjectDarkControlButton>
          </div>
        </header>

        <nav aria-label="Settings categories" className="flex shrink-0 gap-1 overflow-x-auto border-b border-sky-300/15 bg-slate-950/25 p-2 sm:hidden">
          {topLevelSettingsGroups.map((group) => {
            const groupId = group.id as SettingsGroupId;
            const Icon = groupIcons[groupId];
            const active = groupId === activeGroupId;
            return <button aria-current={active ? 'page' : undefined} className={cn('flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs transition-colors', active ? 'bg-cyan-300/15 text-cyan-100' : 'text-sky-100/55 hover:bg-slate-800 hover:text-white')} key={groupId} onClick={() => onSelectGroup(groupId)} type="button"><Icon className="size-3.5" />{group.label}</button>;
          })}
        </nav>

        <div aria-label="Settings workspace" className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="settings-workspace-scroll-area" role="region" tabIndex={0}>
          <div className="mx-auto grid max-w-3xl gap-4 p-4 sm:p-5">
            <ProjectInset>
              <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-200"><ActiveGroupIcon className="size-4" /></span><div><p className="text-xs text-sky-100/55">Settings / {activeGroupMeta.label}</p><h2 className="mt-1 text-lg font-semibold text-white">{activeGroupMeta.label}</h2><p className="mt-1 text-sm leading-5 text-sky-100/65">{activeGroupMeta.description}</p></div></div>
            </ProjectInset>
            {activePanelContent}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-sky-300/15 bg-slate-950/30 px-4 py-3 sm:px-5">
          <p className="text-xs text-sky-100/55">{saveError ? 'Save failed. Your edits are still here.' : dirty ? 'Unsaved settings edits' : 'No unsaved settings'}{activeGroupId === 'backups' && <span className="mt-1 block">Backup location is applied separately.</span>}</p>
          <DisabledAction disabled={!dirty || saving} reason={saving ? 'Autark-OS is already saving these settings.' : 'Make a change before saving settings.'}>
            <ProjectPrimaryButton disabled={!dirty || saving} onClick={onSave} size="sm" type="button">{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}{saving ? 'Saving' : 'Save changes'}</ProjectPrimaryButton>
          </DisabledAction>
        </footer>
      </div>
    </section>
  );
}

export default SettingsPage;
