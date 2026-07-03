import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type DuplicateInstallWarningDialogProps = {
  appName: string;
  onInstallCopy: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  reviewHref: string | null;
};

export function DuplicateInstallWarningDialog({ appName, onInstallCopy, onOpenChange, open, reviewHref }: DuplicateInstallWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30 sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-lg border border-orange-400/40 bg-orange-500/10 text-orange-200">
            <TriangleAlert className="size-5" />
          </div>
          <DialogTitle>Install a second copy?</DialogTitle>
          <DialogDescription className="leading-6 text-slate-400">
            Project OS already sees {appName} on your system. Installing another copy can cause confusing behavior across your network, especially from phones, TVs, or other devices that discover services automatically. Pin or adopt the existing service when possible. Install a second copy only if you intentionally want two separate instances.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 border-sky-400/25 bg-slate-800">
          {reviewHref && (
            <ProjectWarningButton asChild>
              <Link to={reviewHref}>Review existing service</Link>
            </ProjectWarningButton>
          )}
          <Button
            className="border-sky-400/25 bg-slate-900 text-slate-300 hover:bg-slate-700 hover:text-slate-50"
            onClick={() => {
              onOpenChange(false);
              onInstallCopy();
            }}
            type="button"
            variant="outline"
          >
            Install second copy anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
