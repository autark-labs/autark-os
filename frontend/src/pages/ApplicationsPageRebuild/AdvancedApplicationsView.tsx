import { ExternalLink, MoreHorizontal, Pause, Play, RotateCw, ShieldCheck } from 'lucide-react';
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
import { ApplicationIcon, ApplicationKindBadge, ApplicationStatusBadge } from './ApplicationVisuals';
import type { ApplicationActionHandlers, ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type AdvancedApplicationsViewProps = {
  actions: ApplicationActionHandlers;
  items: ApplicationSurfaceItem[];
  onSelect: (id: string) => void;
  selectedId?: string;
};

export function AdvancedApplicationsView({ actions, items, onSelect, selectedId }: AdvancedApplicationsViewProps) {
  return (
    <Card className="overflow-visible rounded-2xl border border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30 ring-0">
      <CardHeader>
        <CardTitle className="text-white">Operations</CardTitle>
        <CardDescription className="text-sky-100/70">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse vitae sem at arcu porta pretium.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border border-sky-400/25 bg-slate-800 px-2 pb-2">
          <Table className="border-separate border-spacing-y-2">
            <TableHeader>
              <TableRow className="border-transparent hover:bg-transparent">
                <TableHead className="text-sky-100/70">Name</TableHead>
                <TableHead className="text-sky-100/70">Type</TableHead>
                <TableHead className="text-sky-100/70">State</TableHead>
                <TableHead className="text-sky-100/70">Access</TableHead>
                <TableHead className="text-sky-100/70">Backup</TableHead>
                <TableHead className="text-right text-sky-100/70">Controls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  className={cn(
                    'cursor-pointer border-transparent bg-sky-100 text-slate-950 shadow-md shadow-slate-950/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-sky-50 hover:shadow-lg',
                    item.nextAction && 'bg-orange-200 hover:bg-orange-100',
                    item.runtimeState === 'paused' && 'bg-slate-200 hover:bg-slate-100',
                    selectedId === item.id && 'bg-cyan-100 shadow-xl shadow-cyan-300/35 ring-2 ring-cyan-300/40 hover:bg-cyan-50',
                  )}
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                >
                  <TableCell className="rounded-l-xl">
                    <div className="flex items-center gap-3">
                      <ApplicationIcon item={item} size="sm" />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-950">{item.name}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ApplicationKindBadge kind={item.kind} />
                  </TableCell>
                  <TableCell>
                    <ApplicationStatusBadge item={item} />
                  </TableCell>
                  <TableCell className="text-slate-700">{item.access}</TableCell>
                  <TableCell className="text-slate-700">{item.backup}</TableCell>
                  <TableCell className="rounded-r-xl">
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      {item.href && (
                        <Button asChild className="border-cyan-300 bg-cyan-300 text-slate-950 shadow-sm shadow-cyan-700/20 hover:bg-cyan-200" size="sm" variant="outline">
                          <a href={item.href} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">
                            <ExternalLink data-icon="inline-start" />
                            Open
                          </a>
                        </Button>
                      )}
                      {item.kind === 'managed' && (
                        item.runtimeState === 'paused' ? (
                          <Button className="border-sky-300 bg-white text-slate-950 hover:bg-sky-100" onClick={(event) => {
                            event.stopPropagation();
                            actions.onStart(item.id);
                          }} size="sm" type="button" variant="outline">
                            <Play data-icon="inline-start" />
                            Start
                          </Button>
                        ) : (
                          <Button className="border-sky-300 bg-white text-slate-950 hover:bg-sky-100" onClick={(event) => {
                            event.stopPropagation();
                            actions.onStop(item.id);
                          }} size="sm" type="button" variant="outline">
                            <Pause data-icon="inline-start" />
                            Stop
                          </Button>
                        )
                      )}
                      {item.kind === 'managed' && (
                        <Button className="border-sky-300 bg-white text-slate-950 hover:bg-sky-100" onClick={(event) => {
                          event.stopPropagation();
                          actions.onRestart(item.id);
                        }} size="sm" type="button" variant="outline">
                        <RotateCw data-icon="inline-start" />
                        Restart
                        </Button>
                      )}
                      {item.kind === 'managed' && (
                        <Button className="border-sky-300 bg-white text-slate-950 hover:bg-sky-100" onClick={(event) => {
                          event.stopPropagation();
                          actions.onCreateBackup(item.id);
                        }} size="sm" type="button" variant="outline">
                          <ShieldCheck data-icon="inline-start" />
                          Backup
                        </Button>
                      )}
                      <Button aria-label={`More controls for ${item.name}`} className="border-sky-300 bg-white text-slate-950 hover:bg-sky-100" onClick={() => onSelect(item.id)} size="icon-sm" type="button" variant="outline">
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
