import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { Button } from '@/components/ui/button';
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
      <DialogContent className="border-slate-700 bg-slate-950 text-slate-100 sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-lg border border-amber-300/25 bg-amber-500/10 text-amber-200">
            <TriangleAlert className="size-5" />
          </div>
          <DialogTitle>Install a second copy?</DialogTitle>
          <DialogDescription className="leading-6 text-slate-400">
            Project OS already sees {appName} on your system. Installing another copy can cause confusing behavior across your network, especially from phones, TVs, or other devices that discover services automatically. Pin or adopt the existing service when possible. Install a second copy only if you intentionally want two separate instances.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 border-slate-800 bg-slate-900/80">
          {reviewHref ? (
            <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
              <Link to={reviewHref}>Review existing service</Link>
            </Button>
          ) : (
            <DisabledAction disabled reason="Project OS cannot open the existing service review yet. Refresh existing apps and try again.">
              <Button className="bg-slate-800 text-slate-300" disabled type="button">
                Review existing service
              </Button>
            </DisabledAction>
          )}
          <Button
            className="border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900"
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
