import { useMemo } from 'react';
import {
  CheckCircle2,
  Code2,
  Database,
  Loader2,
  Network,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
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
function SettingsPage() {
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

  if (loading) return <SettingsLoadingState />;

  if (!draft) {
    return (
      <PageShell>
        <SettingsErrorState actionLabel="Try again" message={loadError || 'Autark-OS could not load settings.'} onAction={() => void load()} title="Settings are unavailable" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Surface as="header" className="overflow-hidden" tone="panel">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-sky-400/20 bg-slate-900 p-6 md:p-7">
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

      <Surface as="nav" className="grid gap-2 p-2 sm:grid-cols-2 xl:grid-cols-4" tone="panel">
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

      <Surface as="main" className="p-5" tone="panel">
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
        <div className="grid gap-5">
          {sectionsForGroup(activeGroupId).map((sectionId) => (
            <SettingsPanelBySection
              advancedChecks={advancedChecks}
              apps={appState.apps}
              backupRoot={state.backupRoot}
              backupSchedule={state.backupSchedule}
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
      </Surface>

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
    </PageShell>
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
