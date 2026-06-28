import { AlertTriangle, ExternalLink, MoreHorizontal, Pause, Play, RotateCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ApplicationActionHandlers, ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type AdvancedApplicationsViewProps = {
  actions: ApplicationActionHandlers;
  items: ApplicationSurfaceItem[];
  onSelect: (id: string) => void;
  selectedId?: string;
};

export function AdvancedApplicationsView({ actions, items, onSelect, selectedId }: AdvancedApplicationsViewProps) {
  return (
    <Card className="overflow-visible rounded-2xl border border-neutral-300 bg-white shadow-none ring-0">
      <CardHeader>
        <CardTitle className="text-neutral-950">Operations</CardTitle>
        <CardDescription className="text-neutral-600">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse vitae sem at arcu porta pretium.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border border-neutral-300">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-300 bg-neutral-100 hover:bg-neutral-100">
                <TableHead className="text-neutral-700">Name</TableHead>
                <TableHead className="text-neutral-700">Type</TableHead>
                <TableHead className="text-neutral-700">State</TableHead>
                <TableHead className="text-neutral-700">Access</TableHead>
                <TableHead className="text-neutral-700">Backup</TableHead>
                <TableHead className="text-neutral-700">Next</TableHead>
                <TableHead className="text-right text-neutral-700">Controls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  className={cn(
                    'cursor-pointer border-neutral-300',
                    item.nextAction && 'bg-amber-50 hover:bg-amber-50',
                    selectedId === item.id && 'bg-neutral-100',
                  )}
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <AppIcon item={item} />
                      <div className="min-w-0">
                        <div className="font-medium text-neutral-950">{item.name}</div>
                        <div className="max-w-sm truncate text-xs text-neutral-600">{item.description}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-neutral-200 text-neutral-950">{labelForKind(item.kind)}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge item={item} />
                  </TableCell>
                  <TableCell>{item.access}</TableCell>
                  <TableCell>{item.backup}</TableCell>
                  <TableCell>
                    {item.nextAction ? (
                      <Button className="bg-amber-500 text-neutral-950 hover:bg-amber-400" onClick={(event) => {
                        event.stopPropagation();
                        onSelect(item.id);
                        actions.onRunNextAction(item.id);
                      }} size="sm" type="button">
                        <AlertTriangle data-icon="inline-start" />
                        {item.nextAction.label}
                      </Button>
                    ) : (
                      <span className="text-sm text-neutral-600">Clear</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {item.href && (
                        <Button asChild className="border-neutral-300 text-neutral-900" size="sm" variant="outline">
                          <a href={item.href} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">
                            <ExternalLink data-icon="inline-start" />
                            Open
                          </a>
                        </Button>
                      )}
                      {item.kind === 'managed' && (
                        item.runtimeState === 'paused' ? (
                          <Button className="border-neutral-300 text-neutral-900" onClick={(event) => {
                            event.stopPropagation();
                            actions.onStart(item.id);
                          }} size="sm" type="button" variant="outline">
                            <Play data-icon="inline-start" />
                            Start
                          </Button>
                        ) : (
                          <Button className="border-neutral-300 text-neutral-900" onClick={(event) => {
                            event.stopPropagation();
                            actions.onStop(item.id);
                          }} size="sm" type="button" variant="outline">
                            <Pause data-icon="inline-start" />
                            Stop
                          </Button>
                        )
                      )}
                      {item.kind === 'managed' && (
                        <Button className="border-neutral-300 text-neutral-900" onClick={(event) => {
                          event.stopPropagation();
                          actions.onRestart(item.id);
                        }} size="sm" type="button" variant="outline">
                        <RotateCw data-icon="inline-start" />
                        Restart
                        </Button>
                      )}
                      {item.kind === 'managed' && (
                        <Button className="border-neutral-300 text-neutral-900" onClick={(event) => {
                          event.stopPropagation();
                          actions.onCreateBackup(item.id);
                        }} size="sm" type="button" variant="outline">
                          <ShieldCheck data-icon="inline-start" />
                          Backup
                        </Button>
                      )}
                      <Button aria-label={`More controls for ${item.name}`} className="border-neutral-300 text-neutral-900" onClick={() => onSelect(item.id)} size="icon-sm" type="button" variant="outline">
                        <MoreHorizontal />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ item }: { item: ApplicationSurfaceItem }) {
  if (item.status === 'Ready') {
    return <Badge className="bg-emerald-600 text-white">Ready</Badge>;
  }
  if (item.status === 'Needs review') {
    return <Badge className="bg-amber-500 text-neutral-950">Needs review</Badge>;
  }
  if (item.status === 'Paused') {
    return <Badge className="bg-neutral-700 text-white">Paused</Badge>;
  }
  return <Badge className="bg-neutral-200 text-neutral-950">{item.status}</Badge>;
}

function AppIcon({ item }: { item: ApplicationSurfaceItem }) {
  return (
    <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-neutral-300 bg-white">
      {item.iconUrl ? (
        <img alt="" className="size-7 object-contain" src={item.iconUrl} />
      ) : (
        <span className="text-xs font-semibold text-neutral-700">{item.name.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}

function labelForKind(kind: ApplicationSurfaceItem['kind']) {
  if (kind === 'managed') {
    return 'Managed';
  }
  if (kind === 'pinned') {
    return 'Pinned';
  }
  return 'Found';
}
