import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type ResponsiveDetailsSheetModel = {
  description: ReactNode;
  title: ReactNode;
};

type ResponsiveDetailsSheetProps = {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  headerAccessory?: ReactNode;
  model: ResponsiveDetailsSheetModel;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  titleClassName?: string;
};

/** Responsive Sheet primitive for focused, route-backed details on narrow and wide screens. */
export function ResponsiveDetailsSheet({ children, className, footer, headerAccessory, model, onOpenChange, open, titleClassName }: ResponsiveDetailsSheetProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className={cn('w-full overflow-y-auto border-slate-700 bg-slate-950 text-slate-100 sm:max-w-xl lg:max-w-2xl', className)}>
        <SheetHeader className="border-b border-slate-800 pb-4 pr-10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className={cn('break-words text-xl font-bold text-white', titleClassName)}>{model.title}</SheetTitle>
              <SheetDescription className="mt-2 leading-6 text-slate-400">{model.description}</SheetDescription>
            </div>
            {headerAccessory}
          </div>
        </SheetHeader>
        <div className="p-4">{children}</div>
        {footer && <SheetFooter className="border-t border-slate-800">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
