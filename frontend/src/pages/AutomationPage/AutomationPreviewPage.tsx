import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, Bell, CheckCircle2, Clock3, RotateCw, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { AutomationAPIClient } from '@/api/AutomationAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageHero, PageShell, SoftCard, SurfaceInset } from '@/components/project-os/ProjectOSComponents';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import type { AutomationRecipe } from '@/types/automation';

const recipeIcons: Record<string, typeof Archive> = {
  'backup-before-update': Archive,
  'restart-unhealthy-app': RotateCw,
  'low-disk-space-attention': AlertTriangle,
  'repair-missing-private-link': ShieldCheck,
  'notify-backup-failure': Bell,
};

function AutomationPreviewPage() {
  const [recipes, setRecipes] = useState<AutomationRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRecipeId, setSavingRecipeId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    AutomationAPIClient.recipes()
      .then((nextRecipes) => {
        if (mounted) {
          setRecipes(nextRecipes);
          setError('');
        }
      })
      .catch((nextError) => mounted && setError(apiErrorMessage(nextError, 'Unable to load automation recipes.')))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const summary = useMemo(() => {
    const active = recipes.filter((recipe) => recipe.status === 'active').length;
    const enabled = recipes.filter((recipe) => recipe.enabled).length;
    const configurable = recipes.filter((recipe) => recipe.configurable).length;
    return { active, enabled, configurable };
  }, [recipes]);

  async function updateRecipe(recipe: AutomationRecipe, enabled: boolean) {
    const previous = recipes;
    setSavingRecipeId(recipe.id);
    setRecipes((current) => current.map((item) => item.id === recipe.id ? { ...item, enabled } : item));
    try {
      const updated = await AutomationAPIClient.updateRecipe(recipe.id, { enabled });
      setRecipes((current) => current.map((item) => item.id === updated.id ? updated : item));
      setError('');
    } catch (nextError) {
      setRecipes(previous);
      setError(apiErrorMessage(nextError, 'Unable to update automation recipe.'));
    } finally {
      setSavingRecipeId(null);
    }
  }

  return (
    <PageShell>
      <PageHero
        accent="automation"
        className="bg-po-hero-automation"
        description="Project OS automation uses narrow recipes with clear triggers, visible activity, and no arbitrary scripts."
        eyebrow={<Badge className="border-violet-400/30 bg-violet-500/15 text-violet-100">Safe recipes</Badge>}
        icon={Sparkles}
        status={(
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-white/10 bg-slate-950/45 p-3 text-center">
            <Metric value={summary.enabled} label="Enabled" />
            <Metric value={summary.active} label="Active" />
            <Metric value={summary.configurable} label="Adjustable" />
          </div>
        )}
        title="Automation"
      />

      {error && <PageErrorState message={error} title="Automation recipes could not refresh" />}

      {loading ? (
        <PageLoadingState label="Loading automation recipes" sublabel="Checking safe recipes, enabled states, and configurable actions." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              saving={savingRecipeId === recipe.id}
              onToggle={(enabled) => updateRecipe(recipe, enabled)}
            />
          ))}
        </div>
      )}

      <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-5 text-emerald-50">
        <div className="flex items-center gap-3 font-semibold">
          <CheckCircle2 className="size-5" />
          Risky automation remains approval-based.
        </div>
        <p className="mt-2 text-sm text-emerald-100/75">
          Recipes can use Project OS systems like verified backups, app health checks, and private-link repair. They cannot run user-provided shell scripts.
        </p>
      </div>
    </PageShell>
  );
}

function RecipeCard({ recipe, saving, onToggle }: { recipe: AutomationRecipe; saving: boolean; onToggle: (enabled: boolean) => void }) {
  const Icon = recipeIcons[recipe.id] || Sparkles;
  const status = statusCopy(recipe.status);

  return (
    <SoftCard className="bg-slate-950/60 text-slate-100 shadow-po-card">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-violet-500/15 text-violet-100">
            <Icon className="size-5" />
          </div>
          <div className="flex items-center gap-3">
            <Badge className={status.className}>{status.label}</Badge>
            <Switch
              checked={recipe.enabled}
              disabled={!recipe.configurable || saving}
              aria-label={`${recipe.title} enabled`}
              onCheckedChange={onToggle}
            />
          </div>
        </div>
        <h2 className="mt-4 text-xl font-bold text-white">{recipe.title}</h2>
        <p className="mt-2 min-h-10 text-sm leading-6 text-slate-400">{recipe.summary}</p>
        <div className="mt-4 grid gap-3 text-sm">
          <Fact label="When" value={recipe.trigger} />
          <Fact label="Then" value={recipe.action} />
          <Fact label="Safety" value={recipe.safetyLimit} />
        </div>
        <SurfaceInset className="mt-4 grid gap-3 border-white/10 bg-slate-950/55 text-sm">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-slate-500">
            <Clock3 className="size-3.5" />
            Last result
          </div>
          <p className="text-slate-200">{recipe.lastResult}</p>
          <p className="text-xs text-slate-500">{formatLastRun(recipe.lastRun)}</p>
        </SurfaceInset>
      </div>
    </SoftCard>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-slate-500">
        <Zap className="size-3.5" />
        {label}
      </div>
      <p className="mt-1 text-slate-200">{value}</p>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-20 rounded-md border border-white/10 bg-slate-950/50 px-3 py-2">
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-xs font-semibold text-slate-400">{label}</div>
    </div>
  );
}

function statusCopy(status: string) {
  if (status === 'active') {
    return { label: 'Active', className: 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100' };
  }
  if (status === 'unavailable') {
    return { label: 'Unavailable', className: 'border-rose-400/25 bg-rose-500/15 text-rose-100' };
  }
  return { label: 'Preview', className: 'border-sky-400/25 bg-sky-500/15 text-sky-100' };
}

function formatLastRun(lastRun: string) {
  if (!lastRun || lastRun === 'No recent runs') {
    return 'No recent run recorded.';
  }
  const date = new Date(lastRun);
  if (Number.isNaN(date.getTime())) {
    return lastRun;
  }
  return `Recorded ${date.toLocaleString()}`;
}

export default AutomationPreviewPage;
