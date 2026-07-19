import { BookOpen, ChevronDown, ExternalLink, PackageOpen } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { MarketplaceApp } from '@/types/marketplace';

export function MarketplaceAppDetailsCard({ app, className, compact = false }: { app: MarketplaceApp; className?: string; compact?: boolean }) {
  return (
    <section className={cn('rounded-xl border border-sky-300/15 bg-slate-950/25 p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-white">App details</h4>
          {!compact && <p className="mt-1 text-xs leading-5 text-slate-300">The essentials stay visible; technical context is available when you need it.</p>}
        </div>
        <DocsSourceMenu app={app} />
      </div>

      <dl className={cn('grid gap-x-4 gap-y-2 text-xs', compact ? 'mt-3' : 'mt-4 sm:grid-cols-2')}>
        <DetailLine label="Access" value={accessLabel(app.access.defaultMode)} />
        <DetailLine label="Backups" value="Enabled by default" />
        {!compact && <>
          <DetailLine label="Type" value={serviceKindLabel(app.usage.kind)} />
          <DetailLine label="Data" value="Managed app storage" />
          <DetailLine label="Version" value={app.version || 'Unavailable'} />
          <DetailLine label="Size" value={app.size || 'Unavailable'} />
          <DetailLine label="Last updated" value={app.lastUpdated || 'Unavailable'} />
          <DetailLine label="Source" value={app.source || 'Unavailable'} />
          <DetailLine label="Maintainer" value={app.maintainer || 'Unavailable'} />
          <DetailLine label="Downloads" value={app.downloads || 'Unavailable'} />
        </>}
      </dl>

      <Collapsible className="mt-3 border-t border-sky-300/10 pt-3">
        <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-3 text-left text-xs font-semibold text-slate-300 hover:text-white">
          Advanced app info
          <ChevronDown className="size-4" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 grid gap-3 text-xs leading-5 text-slate-300">
            {app.technicalSummary && <p>{app.technicalSummary}</p>}
            {app.requirements.length > 0 && <InfoList label="Requirements" values={app.requirements} />}
            {app.includes.length > 0 && <InfoList label="Included services" values={app.includes} />}
            {app.usage.notes.length > 0 && <InfoList label="Good to know" values={app.usage.notes} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

export function DocsSourceMenu({ app }: { app: MarketplaceApp }) {
  if (!app.sourceUrl && !app.documentationUrl) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-sky-300/20 bg-slate-900/60 px-2 text-xs font-medium text-slate-100 transition hover:border-cyan-300/60 hover:text-white" type="button">
          Docs + source
          <ChevronDown className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 border-sky-300/20 bg-[#0b1831] text-slate-50 shadow-xl shadow-slate-950/20">
        <DropdownMenuLabel>{app.name}</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-sky-300/10" />
        {app.documentationUrl && (
          <DropdownMenuItem asChild className="focus:bg-slate-800 focus:text-white">
            <a href={app.documentationUrl} rel="noreferrer" target="_blank">
              <BookOpen className="mr-2 size-4" />
              Read docs
              <ExternalLink className="ml-auto size-3.5 text-slate-400" />
            </a>
          </DropdownMenuItem>
        )}
        {app.sourceUrl && (
          <DropdownMenuItem asChild className="focus:bg-slate-800 focus:text-white">
            <a href={app.sourceUrl} rel="noreferrer" target="_blank">
              <PackageOpen className="mr-2 size-4" />
              View source
              <ExternalLink className="ml-auto size-3.5 text-slate-400" />
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 gap-y-1">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-100" title={value}>{value}</dd>
    </div>
  );
}

function InfoList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="font-semibold text-slate-100">{label}</p>
      <ul className="mt-1 grid gap-1 pl-4">
        {values.map((value) => <li className="list-disc" key={value}>{value}</li>)}
      </ul>
    </div>
  );
}

function serviceKindLabel(kind: string) {
  const labels: Record<string, string> = {
    'web-app': 'Web app',
    'companion-service': 'Companion service',
    'admin-service': 'Admin service',
    'background-service': 'Background service',
    infrastructure: 'Infrastructure',
  };
  return labels[kind] || kind.replaceAll('-', ' ');
}

function accessLabel(mode: string) {
  const labels: Record<string, string> = {
    local: 'Home network',
    private: 'Private access',
    'local-and-private': 'Home + private',
    none: 'No browser access',
  };
  return labels[mode] || mode.replaceAll('-', ' ');
}
