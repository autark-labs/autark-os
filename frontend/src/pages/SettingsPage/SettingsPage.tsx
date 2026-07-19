import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AppWindow,
  CheckCircle2,
  Code2,
  Database,
  Loader2,
  Network,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { ApplicationStateNotice } from '@/components/autark-os/ApplicationStateNotice';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { PageLoadingState } from '@/components/autark-os/PageLoadingState';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, Surface } from '@/components/primitives/Surface';
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
  embedded = false,
  initialGroup,
  onRequestClose,
  onRequestDismiss,
}: {
  embedded?: boolean;
  initialGroup?: SettingsGroupId;
  onRequestClose?: () => void;
  onRequestDismiss?: (requestDismiss: () => void) => void;
}) {
  const {
    activeGroup,
    appState,
    confirmRefresh,
    continueNavigation,
    copy,
    copied,
    configureBackupDestination,
    doctor,
    draft,
    dirty,
    load,
    loadError,
    loading,
    pendingNavigation,
    refreshConfirmationOpen,
    refreshing,
    reload,
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
    () => state.setup?.checks?.filter((check) => ['service-user', 'runtime-root', 'docker', 'fileops', 'tailscale', 'tailscale-operator'].includes(check.id)) ?? [],
    [state.setup],
  );
  const advancedChecks = useMemo(
    () => state.setup?.checks?.filter((check) => !requiredChecks.includes(check)) ?? [],
    [requiredChecks, state.setup],
  );
  const activeGroupId = defaultSettingsGroup(activeGroup);
  const activeGroupMeta = topLevelSettingsGroups.find((group) => group.id === activeGroupId) || topLevelSettingsGroups[0];
  const ActiveGroupIcon = groupIcons[activeGroupId];

  useEffect(() => {
    if (initialGroup) setActiveGroup(initialGroup);
  }, [initialGroup, setActiveGroup]);

  const requestClose = useCallback(() => {
    if (!onRequestClose) return;
    if (dirty) {
      setCloseConfirmationOpen(true);
      return;
    }
    onRequestClose();
  }, [dirty, onRequestClose]);

  useEffect(() => {
    onRequestDismiss?.(requestClose);
  }, [onRequestDismiss, requestClose]);

  const saveAndClose = async () => {
    if (await save()) {
      setCloseConfirmationOpen(false);
      onRequestClose?.();
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
          apps={appState.apps}
          backupDestination={state.backupDestination}
          backupSchedule={state.backupSchedule}
          copied={copied}
          doctor={doctor}
          draft={draft}
          key={sectionId}
          metrics={state.metrics}
          onCopy={copy}
          onConfigureBackupDestination={configureBackupDestination}
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
    <PageShell contained={embedded} className={embedded ? 'min-h-0 flex-1 bg-app-panel' : undefined} contentClassName={embedded ? 'min-h-0 !gap-0 !overflow-hidden !p-0' : undefined}>
      {embedded && <ApplicationStateNotice className="m-3 mb-0" />}
      {embedded ? (
        <SettingsWorkbench
          activeGroupId={activeGroupId}
          activeGroupMeta={activeGroupMeta}
          activePanelContent={activePanelContent}
          deviceName={draft.deviceName}
          dirty={dirty}
          loadError={loadError}
          onRequestClose={requestClose}
          onRequestRefresh={requestRefresh}
          onSave={() => void save()}
          onSelectGroup={setActiveGroup}
          refreshing={refreshing}
          saveError={saveError}
          saving={saving}
          setupHeadline={state.setup?.headline}
        />
      ) : (
        <>
          <Surface as="header" className="sticky top-0 z-10 shrink-0 overflow-hidden" tone="panel">
        <div className={cn('flex flex-wrap items-start justify-between gap-4 border-b border-sky-400/20 bg-slate-900', embedded ? 'p-4' : 'p-6 md:p-7')}>
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-cyan-200">Settings</p>
            <h1 className="mt-2 text-3xl font-black leading-tight text-white md:text-4xl">Autark-OS controls</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Direct controls for this appliance: identity, managed-app defaults, backups, and advanced host details. Changes apply when you save them.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={dirty ? 'warning' : 'success'}>{dirty ? 'Unsaved changes' : 'Saved'}</StatusBadge>
            <DisabledAction disabled={refreshing || saving} reason={saving ? 'Wait for the current save to finish.' : 'Settings are already refreshing.'}>
              <ProjectDarkControlButton disabled={refreshing || saving} onClick={requestRefresh} type="button">
                <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                Refresh
              </ProjectDarkControlButton>
            </DisabledAction>
            <DisabledAction disabled={!dirty || saving} reason={saving ? 'Autark-OS is already saving these settings.' : 'Make a change before saving settings.'}>
              <ProjectPrimaryButton disabled={!dirty || saving} onClick={() => void save()} type="button">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {saving ? 'Saving' : 'Save changes'}
              </ProjectPrimaryButton>
            </DisabledAction>
            {embedded && (
              <ProjectDarkControlButton aria-label="Close settings" onClick={requestClose} type="button">
                <X className="size-4" />
                Close
              </ProjectDarkControlButton>
            )}
          </div>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <SettingsStatusCard icon={CheckCircle2} label="Save state" tone={dirty ? 'orange' : 'green'} value={dirty ? 'Review changes' : 'No pending changes'} />
          <SettingsStatusCard icon={ShieldCheck} label="Setup" tone={state.setup?.status === 'ready' ? 'green' : 'orange'} value={state.setup?.headline || 'Setup status unavailable'} />
          <SettingsStatusCard icon={ActiveGroupIcon} label="Selected" tone={activeGroupId === 'advanced' ? 'cyan' : 'slate'} value={activeGroupMeta.label} />
        </div>
          </Surface>

          {loadError && <SettingsErrorState message={loadError} onAction={reload} title="Settings could not refresh" />}
          {saveError && <SettingsErrorState actionLabel="Try save again" message={`${saveError} Your edits are still here.`} onAction={() => void save()} title="Settings could not save" />}

          <Surface as="nav" className="shrink-0 grid gap-2 p-2 sm:grid-cols-2 xl:grid-cols-4" tone="panel">
        {topLevelSettingsGroups.map((group) => {
          const groupId = group.id as SettingsGroupId;
          const Icon = groupIcons[groupId];
          const active = activeGroupId === group.id;
          return (
            <button
              className={cn(
                'flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left text-sm transition',
                active
                  ? 'border-cyan-300/45 bg-cyan-400/10 text-cyan-100 shadow-sm shadow-cyan-950/20'
                  : 'border-sky-400/20 bg-slate-800 text-sky-100/80 hover:border-cyan-300/35 hover:bg-slate-700 hover:text-white',
              )}
              key={group.id}
              onClick={() => setActiveGroup(groupId)}
              type="button"
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                <span className="block font-bold">{group.label}</span>
                <span className="mt-1 block text-xs leading-5 opacity-75">{group.description}</span>
              </span>
            </button>
          );
        })}
          </Surface>

          <Surface as="main" className="shrink-0 p-5" tone="panel">
        <ProjectInset className="mb-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-400/10 text-cyan-200">
              <ActiveGroupIcon className="size-4" />
            </span>
            <div>
              <h2 className="text-lg font-black text-white">{activeGroupMeta.label}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">{activeGroupMeta.description}</p>
            </div>
          </div>
        </ProjectInset>
            {activePanelContent}
          </Surface>
        </>
      )}

      <AlertDialog open={refreshConfirmationOpen} onOpenChange={setRefreshConfirmationOpen}>
        <AlertDialogContent className="border-orange-400/30 bg-slate-950 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">Refreshing reloads the saved appliance settings and removes the edits on this page.</AlertDialogDescription>
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
            <AlertDialogDescription className="text-slate-400">Your settings edits have not been saved. Keep editing or discard them before leaving this page.</AlertDialogDescription>
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
            <AlertDialogDescription className="text-slate-400">Your changes have not been saved yet.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <ProjectDarkControlButton onClick={() => { setCloseConfirmationOpen(false); onRequestClose?.(); }} type="button">Discard changes</ProjectDarkControlButton>
            <ProjectPrimaryButton disabled={saving} onClick={() => void saveAndClose()} type="button">{saving ? 'Saving' : 'Save and close'}</ProjectPrimaryButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function SettingsWorkbench({
  activeGroupId,
  activeGroupMeta,
  activePanelContent,
  deviceName,
  dirty,
  loadError,
  onRequestClose,
  onRequestRefresh,
  onSave,
  onSelectGroup,
  refreshing,
  saveError,
  saving,
  setupHeadline,
}: {
  activeGroupId: SettingsGroupId;
  activeGroupMeta: (typeof topLevelSettingsGroups)[number];
  activePanelContent: ReactNode;
  deviceName: string;
  dirty: boolean;
  loadError: string | null;
  onRequestClose: () => void;
  onRequestRefresh: () => void;
  onSave: () => void;
  onSelectGroup: (group: SettingsGroupId) => void;
  refreshing: boolean;
  saveError: string | null;
  saving: boolean;
  setupHeadline?: string;
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
        <div className="mt-auto rounded-xl border border-emerald-300/15 bg-emerald-400/5 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-100"><CheckCircle2 className="size-3.5" />Appliance ready</div>
          <p className="mt-1 text-[0.68rem] leading-4 text-emerald-100/65">{setupHeadline || 'Core services and private access are healthy.'}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-sky-300/15 bg-app-header-surface/90 px-4 py-3 sm:px-5">
          <div className="min-w-0"><p className="truncate text-xs font-semibold text-cyan-200">{deviceName || 'Autark-OS'}</p><h1 className="mt-1 text-lg font-semibold text-white">Appliance settings</h1></div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge tone={dirty ? 'warning' : 'success'}>{dirty ? 'Unsaved changes' : 'Saved'}</StatusBadge>
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
            {loadError && <SettingsErrorState message={loadError} onAction={onRequestRefresh} title="Settings could not refresh" />}
            {saveError && <SettingsErrorState actionLabel="Try save again" message={`${saveError} Your edits are still here.`} onAction={onSave} title="Settings could not save" />}
            {activePanelContent}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-sky-300/15 bg-slate-950/30 px-4 py-3 sm:px-5">
          <p className="text-xs text-sky-100/55">{dirty ? 'Changes apply to this appliance after saving.' : 'All appliance settings are saved.'}</p>
          <DisabledAction disabled={!dirty || saving} reason={saving ? 'Autark-OS is already saving these settings.' : 'Make a change before saving settings.'}>
            <ProjectPrimaryButton disabled={!dirty || saving} onClick={onSave} size="sm" type="button">{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}{saving ? 'Saving' : 'Save changes'}</ProjectPrimaryButton>
          </DisabledAction>
        </footer>
      </div>
    </section>
  );
}

function SettingsStatusCard({ icon: Icon, label, tone, value }: { icon: LucideIcon; label: string; tone: 'green' | 'orange' | 'slate' | 'cyan'; value: string }) {
  const tones = {
    cyan: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100',
    green: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
    orange: 'border-orange-300/30 bg-orange-500/10 text-orange-100',
    slate: 'border-slate-700/60 bg-slate-900/55 text-slate-300',
  };
  return (
    <div className={cn('rounded-lg border p-4', tones[tone])}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-current/70">{label}</p>
        <Icon className="size-4" />
      </div>
      <p className="mt-3 line-clamp-2 text-sm font-black text-white">{value}</p>
    </div>
  );
}

export default SettingsPage;
