import * as React from 'react';
import { CheckIcon, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type MultiSelectOption = {
  label: string;
  value: string;
};

type MultiSelectProps = {
  className?: string;
  emptyText?: string;
  maxVisible?: number;
  onValueChange: (value: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  value: string[];
};

export function MultiSelect({
  className,
  emptyText = 'No results found.',
  maxVisible = 2,
  onValueChange,
  options,
  placeholder = 'Select options',
  searchPlaceholder = 'Search options',
  value,
}: MultiSelectProps) {
  const selected = new Set(value);
  const selectedOptions = options.filter((option) => selected.has(option.value));
  const hiddenCount = Math.max(0, selectedOptions.length - maxVisible);

  function toggleValue(optionValue: string) {
    const next = new Set(selected);
    if (next.has(optionValue)) {
      next.delete(optionValue);
    } else {
      next.add(optionValue);
    }
    onValueChange(Array.from(next));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            'min-h-9 w-full justify-between border-sky-400/40 bg-slate-800 px-2 text-sky-50 hover:bg-slate-700 hover:text-white sm:w-auto sm:min-w-56',
            className,
          )}
          type="button"
          variant="outline"
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {selectedOptions.length === 0 ? (
              <span className="truncate text-sky-100/65">{placeholder}</span>
            ) : (
              <>
                {selectedOptions.slice(0, maxVisible).map((option) => (
                  <Badge className="border-cyan-200/35 bg-cyan-300/15 text-cyan-50" key={option.value} variant="outline">
                    {option.label}
                  </Badge>
                ))}
                {hiddenCount > 0 && (
                  <Badge className="border-sky-400/25 bg-slate-900 text-sky-100/80" variant="outline">
                    +{hiddenCount}
                  </Badge>
                )}
              </>
            )}
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            <ChevronDown className="size-4 opacity-70" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,18rem)] border-cyan-300/35 bg-slate-800 p-0 text-slate-50 shadow-xl shadow-slate-950/35">
        <Command className="bg-slate-800 text-slate-50">
          <CommandInput className="text-slate-50 placeholder:text-sky-100/45" placeholder={searchPlaceholder} />
          <CommandList className="bg-slate-800 text-slate-50">
            <CommandEmpty className="text-sky-100/65">{emptyText}</CommandEmpty>
            <CommandGroup className="text-slate-50">
              {selectedOptions.length > 0 && (
                <CommandItem className="text-sky-100/80 data-selected:bg-slate-700 data-selected:text-white" onSelect={() => onValueChange([])} value="Clear filters">
                  <span>Clear filters</span>
                </CommandItem>
              )}
              {options.map((option) => {
                const checked = selected.has(option.value);
                return (
                  <CommandItem
                    className="text-slate-50 data-selected:bg-cyan-300/15 data-selected:text-white"
                    data-checked={checked}
                    key={option.value}
                    onSelect={() => toggleValue(option.value)}
                    value={option.label}
                  >
                    <span className={cn('grid size-4 place-items-center rounded border', checked ? 'border-cyan-300 bg-cyan-300 text-slate-950' : 'border-sky-400/35 text-transparent')}>
                      <CheckIcon className="size-3" />
                    </span>
                    <span>{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
