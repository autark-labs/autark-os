import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { Surface } from './Surface';

type SearchFilterOption = {
  label: string;
  value: string;
};

type SearchFilterBarProps = {
  actions?: ReactNode;
  className?: string;
  filterAriaLabel: string;
  filterValue?: string;
  filters?: SearchFilterOption[];
  onFilterChange?: (value: string) => void;
  onSearchChange: (value: string) => void;
  searchAriaLabel: string;
  searchPlaceholder: string;
  searchValue: string;
};

export function SearchFilterBar({
  actions,
  className,
  filterAriaLabel,
  filterValue,
  filters,
  onFilterChange,
  onSearchChange,
  searchAriaLabel,
  searchPlaceholder,
  searchValue,
}: SearchFilterBarProps) {
  return (
    <Surface className={cn('p-3 shadow-slate-950/20', className)} tone="panel">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/70" />
          <Input
            aria-label={searchAriaLabel}
            className="h-9 border-sky-400/40 bg-slate-800 pl-9 text-white placeholder:text-sky-100/50 focus-visible:border-cyan-300"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            type="search"
            value={searchValue}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between xl:justify-end">
          {filters && filters.length > 0 && onFilterChange && (
            <ToggleGroup
              aria-label={filterAriaLabel}
              className="flex-wrap"
              onValueChange={onFilterChange}
              size="sm"
              type="single"
              value={filterValue}
              variant="outline"
            >
              {filters.map((filter) => (
                <ToggleGroupItem
                  className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950"
                  key={filter.value}
                  value={filter.value}
                >
                  {filter.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}

          {actions}
        </div>
      </div>
    </Surface>
  );
}
