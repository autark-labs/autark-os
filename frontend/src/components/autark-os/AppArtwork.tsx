import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { renderableAppImageUrl } from '@/lib/appImage';
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
  const imageUrl = renderableAppImageUrl(iconUrl);

  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden bg-gradient-to-br', appArtworkGradients[index % appArtworkGradients.length], className)}>

      <span className="relative z-10 grid size-28 place-items-center rounded-3xl border border-sky-100/25 bg-radial-[at_center] from-slate-200 to-slate-600/70 text-cyan-100 shadow-lg shadow-slate-950/20">
        {!imageUrl ? <Sparkles aria-hidden="true" className="size-12 text-purple-400" /> : null}
        {imageUrl ? (
          <img
            alt=""
            className="absolute inset-0 size-full object-contain p-1.5"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
            src={imageUrl}
          />
        ) : null}
      </span>
      {overlay}
      <span className="sr-only">{name} artwork</span>
    </div>
  );
}
