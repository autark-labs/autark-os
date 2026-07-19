import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const appArtworkGradients = [
  'from-[#416f9c] via-[#315979] to-[#233d5b]',
  'from-[#497ba4] via-[#335f81] to-[#26445f]',
  'from-[#3f7398] via-[#2f5877] to-[#213f5b]',
  'from-[#4c7fa6] via-[#385f80] to-[#284761]',
  'from-[#3e6d95] via-[#2d5271] to-[#213d58]',
  'from-[#47769d] via-[#315a7b] to-[#243f5d]',
];

export function AppArtwork({ className, iconUrl, index = 0, name, overlay }: { className?: string; iconUrl?: string | null; index?: number; name: string; overlay?: ReactNode }) {
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden bg-gradient-to-br', appArtworkGradients[index % appArtworkGradients.length], className)}>
      <span aria-hidden="true" className="absolute -right-8 top-0 size-32 rounded-full bg-cyan-100/30 blur-3xl" />
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-slate-950/25 via-transparent to-white/5" />
      <span className="relative z-10 grid size-28 place-items-center rounded-3xl border border-sky-100/25 bg-app-card-harbor-icon text-cyan-100 shadow-lg shadow-slate-950/20">
        <Sparkles aria-hidden="true" className="size-12" />
        {iconUrl && <img alt="" className="absolute size-12 object-contain" onError={(event) => { event.currentTarget.style.display = 'none'; }} src={iconUrl} />}
      </span>
      {overlay}
      <span className="sr-only">{name} artwork</span>
    </div>
  );
}
