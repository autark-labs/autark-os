import { Check, Palette } from 'lucide-react';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTheme, type AutarkOsThemeId } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { autarkOsThemes } from '@/lib/themeModel';

const themeSwatches: Record<AutarkOsThemeId, string> = {
  'project-slate': 'from-slate-950 via-slate-800 to-cyan-300',
  harbor: 'from-sky-950 via-blue-800 to-cyan-300',
  forest: 'from-emerald-950 via-teal-800 to-emerald-300',
  ember: 'from-stone-950 via-orange-900 to-orange-400',
};

export function ThemeSelectorPopover({ className }: { className?: string }) {
  const { setTheme, theme } = useTheme();
  const activeTheme = autarkOsThemes.find((option) => option.id === theme) ?? autarkOsThemes[0];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <ProjectDarkControlButton
          aria-label={`Theme: ${activeTheme.label}`}
          className={cn('h-8 gap-2 rounded-lg px-2.5 text-xs', className)}
          size="sm"
          type="button"
        >
          <Palette className="size-3.5" />
          <span className="hidden font-semibold sm:inline">Theme</span>
          <span className="hidden font-semibold xl:inline">{activeTheme.label}</span>
        </ProjectDarkControlButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,12rem)] gap-3 border-sky-400/25 bg-slate-950 p-3 text-slate-50 shadow-xl shadow-slate-950/30">
        <div className="grid gap-2">
          {autarkOsThemes.map((option) => {
            const selected = option.id === theme;
            return (
              <button
                aria-pressed={selected}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border border-sky-400/20 bg-slate-900 p-2 text-left text-sky-100 transition hover:border-cyan-300/45 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300',
                  selected && 'border-cyan-300/60 bg-cyan-400/10 text-white',
                )}
                key={option.id}
                onClick={() => setTheme(option.id as AutarkOsThemeId)}
                type="button"
              >
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br shadow-sm shadow-slate-950/30', themeSwatches[option.id as AutarkOsThemeId])}>
                  {selected && <Check className="size-4 text-white drop-shadow" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{option.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
