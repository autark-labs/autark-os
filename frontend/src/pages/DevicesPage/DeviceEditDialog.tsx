import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { DeviceTrustUpdateRequest, TrustedDeviceView } from '@/types/network';
import { displayName } from './DevicesPage.logic';

export function DeviceEditDialog({ deviceView, form, onChange, onClose, onSave, saving }: { deviceView: TrustedDeviceView | null; form: DeviceTrustUpdateRequest; onChange: (form: DeviceTrustUpdateRequest) => void; onClose: () => void; onSave: () => void; saving: boolean }) {
  const device = deviceView?.device ?? null;
  return (
    <Dialog open={Boolean(deviceView)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-slate-700 bg-slate-950 text-slate-100 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Device access settings</DialogTitle>
          <DialogDescription className="text-slate-400">
            Add a friendly label and decide whether this device should use Project OS private app links.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-3 text-sm text-slate-300">
            <p className="font-bold text-white">{device ? displayName(device) : 'Selected device'}</p>
            <p className="mt-1 text-xs text-slate-500">{device?.dnsName || device?.tailnetIps[0] || 'No private address reported'}</p>
          </div>

          <label className="grid gap-2 text-sm font-bold text-slate-200">
            Friendly name
            <Input className="border-slate-700 bg-slate-950/70 text-slate-100" onChange={(event) => onChange({ ...form, nickname: event.target.value })} placeholder="Kitchen tablet, Jack's laptop..." value={form.nickname} />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-200">
            Trust group
            <select className="h-10 rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-cyan-300/60" onChange={(event) => onChange({ ...form, trustGroup: event.target.value })} value={form.trustGroup}>
              <option>Personal devices</option>
              <option>Family devices</option>
              <option>Admin devices</option>
              <option>Guest devices</option>
              <option>Project OS host</option>
            </select>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <Checkbox checked={form.trusted} className="mt-0.5 border-slate-600 data-checked:border-cyan-300 data-checked:bg-cyan-500" onCheckedChange={(checked) => onChange({ ...form, trusted: Boolean(checked) })} />
            <span>
              <span className="block text-sm font-bold text-white">Expected to use private apps</span>
              <span className="mt-1 block text-xs text-slate-400">Turn this off for devices that are online in Tailscale but should not be shown as private-app ready.</span>
            </span>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-200">
            Notes
            <Textarea className="min-h-24 border-slate-700 bg-slate-950/70 text-slate-100" onChange={(event) => onChange({ ...form, notes: event.target.value })} placeholder="Optional note for other admins." value={form.notes} />
          </label>
        </div>

        <DialogFooter>
          <Button className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-900" onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button className="bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={saving} onClick={onSave} type="button">
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save device
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
