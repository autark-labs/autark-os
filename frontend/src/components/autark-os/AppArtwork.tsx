import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const appArtworkGradients = [
  'from-emerald-950 via-slate-950 to-cyan-950',
  'from-blue-950 via-slate-950 to-indigo-950',
  'from-cyan-950 via-slate-950 to-sky-950',
  'from-fuchsia-950 via-slate-950 to-indigo-950',
  'from-orange-950 via-slate-950 to-rose-950',
  'from-violet-950 via-slate-950 to-blue-950',
];

export function AppArtwork({ className, iconUrl, index = 0, name }: { className?: string; iconUrl?: string | null; index?: number; name: string }) {
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden bg-gradient-to-br', appArtworkGradients[index % appArtworkGradients.length], className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgb(56_189_248_/_0.22),transparent_55%)] opacity-80" />
      <Sparkles aria-hidden="true" className="relative z-10 size-14 text-cyan-100/80" />
      {iconUrl && <img alt="" className="absolute z-20 size-20 object-contain drop-shadow-[0_8px_18px_rgb(0_0_0_/_0.5)]" onError={(event) => { event.currentTarget.style.display = 'none'; }} src={iconUrl} />}
      <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#102644] to-transparent" />
      <span className="sr-only">{name} artwork</span>
    </div>
  );
}
