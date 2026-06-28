import { ExternalLink, MoreHorizontal, RotateCw, ShieldCheck } from 'lucide-react';
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
import type { ApplicationSurfaceItem } from './ApplicationsPage.types';

type AdvancedApplicationsViewProps = {
  items: ApplicationSurfaceItem[];
  onSelect: (id: string) => void;
  selectedId?: string;
};

export function AdvancedApplicationsView({ items, onSelect, selectedId }: AdvancedApplicationsViewProps) {
  return (
    <Card className="overflow-visible rounded-2xl border-neutral-300 bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-neutral-950">Advanced operations</CardTitle>
        <CardDescription className="text-neutral-600">
          Dense management shape for runtime, access, backup, and found-service review. Controls are visual only in this pass.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border border-neutral-300">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-300 bg-neutral-100 hover:bg-neutral-100">
                <TableHead className="text-neutral-700">Name</TableHead>
                <TableHead className="text-neutral-700">Type</TableHead>
                <TableHead className="text-neutral-700">State</TableHead>
                <TableHead className="text-neutral-700">Access</TableHead>
                <TableHead className="text-neutral-700">Backup</TableHead>
                <TableHead className="text-right text-neutral-700">Controls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  className={selectedId === item.id ? 'border-neutral-300 bg-neutral-100' : 'border-neutral-300'}
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                >
                  <TableCell>
                    <div className="font-medium text-neutral-950">{item.name}</div>
                    <div className="max-w-sm truncate text-xs text-neutral-600">{item.description}</div>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-neutral-200 text-neutral-950">{labelForKind(item.kind)}</Badge>
                  </TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell>{item.access}</TableCell>
                  <TableCell>{item.backup}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button className="border-neutral-300 text-neutral-900" onClick={() => onSelect(item.id)} size="sm" type="button" variant="outline">
                        <ExternalLink data-icon="inline-start" />
                        Open
                      </Button>
                      <Button className="border-neutral-300 text-neutral-900" onClick={() => onSelect(item.id)} size="sm" type="button" variant="outline">
                        <RotateCw data-icon="inline-start" />
                        Restart
                      </Button>
                      <Button className="border-neutral-300 text-neutral-900" onClick={() => onSelect(item.id)} size="sm" type="button" variant="outline">
                        <ShieldCheck data-icon="inline-start" />
                        Backup
                      </Button>
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

function labelForKind(kind: ApplicationSurfaceItem['kind']) {
  if (kind === 'managed') {
    return 'Managed';
  }
  if (kind === 'pinned') {
    return 'Pinned';
  }
  return 'Found';
}
