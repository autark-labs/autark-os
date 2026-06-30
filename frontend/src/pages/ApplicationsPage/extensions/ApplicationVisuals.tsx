import { cn } from '@/lib/utils';
import type { ApplicationSurfaceItem } from './ApplicationsPage.types';

type ApplicationIconSize = 'sm' | 'md' | 'lg';

const iconSizeClasses: Record<ApplicationIconSize, { frame: string; image: string; fallback: string }> = {
  sm: {
    frame: 'size-10 rounded-lg',
    image: 'size-7',
    fallback: 'text-xs',
  },
  md: {
    frame: 'size-12 rounded-xl',
    image: 'size-9',
    fallback: 'text-sm',
  },
  lg: {
    frame: 'size-28 rounded-2xl shadow-sm',
    image: 'size-24',
    fallback: 'text-xl',
  },
};

export function ApplicationIcon({ item, size = 'md' }: { item: ApplicationSurfaceItem; size?: ApplicationIconSize }) {
  const classes = iconSizeClasses[size];

  return (
    <div className={cn('grid shrink-0 place-items-center border border-sky-300 bg-white', classes.frame)}>
      {item.iconUrl ? (
        <img alt="" className={cn('object-contain', classes.image)} src={item.iconUrl} />
      ) : (
        <span className={cn('font-semibold text-slate-700', classes.fallback)}>
          {item.name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}
