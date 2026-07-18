import { Search } from 'lucide-react';
import { ProjectEmptyState } from '@/components/primitives/EmptyState';
import { ApplicationCard } from './components/ApplicationCard';
import type { ApplicationEmptyState, ApplicationRuntimeAction, ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type BasicApplicationsViewProps = {
  emptyState: ApplicationEmptyState;
  items: ApplicationSurfaceItem[];
  actionLoadingByItemId?: Record<string, ApplicationRuntimeAction | null | undefined>;
  managementOpen: boolean;
  onAction?: (item: ApplicationSurfaceItem, actionId: string) => void;
  onSelect: (id: string) => void;
  selectedId?: string;
};

export function BasicApplicationsView({ actionLoadingByItemId, emptyState, items, managementOpen, onAction, onSelect, selectedId }: BasicApplicationsViewProps) {
  if (!items.length) {
    return <ApplicationsEmptyState emptyState={emptyState} />;
  }

  return (
    <section className="grid h-full min-h-0 grid-cols-[repeat(auto-fill,13rem)] content-start items-start justify-start gap-3 overflow-y-auto overscroll-contain pr-1">
      {items.map((item) => (
        <ApplicationCard
          key={item.id}
          item={item}
          actionLoading={actionLoadingByItemId?.[item.id]}
          managementOpen={managementOpen}
          obscured={Boolean(selectedId) && selectedId !== item.id}
          onAction={onAction}
          onSelect={onSelect}
          selected={selectedId === item.id}
        />
      ))}
    </section>
  );
}

function ApplicationsEmptyState({ emptyState }: { emptyState: ApplicationEmptyState }) {
  return (
    <ProjectEmptyState
      description={emptyState.description}
      icon={<Search />}
      title={emptyState.title}
    />
  );
}
