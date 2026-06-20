import type { AppRuntimeView } from '@/types/app';
import type { TailscaleDevice, TailscaleStatus } from '@/types/network';
import { NetworkMap } from './NetworkMap';
import { NetworkNodeDetails } from './NetworkNodeDetails';
import type { AppExposureGroup, AppExposureLevel, NetworkNodeData } from './extensions/NetworkPage.types';

export function NetworkMapWorkspace({
  apps,
  exposureGroups,
  onReviewPrivateLinks,
  onSelectNode,
  privateApps,
  runningApps,
  selectedNode,
  selectedNodeId,
  showAdvancedMetrics,
  tailnetDevices,
  tailscale,
}: {
  apps: AppRuntimeView[];
  exposureGroups: Record<AppExposureLevel, AppExposureGroup>;
  onReviewPrivateLinks: () => void;
  onSelectNode: (nodeId: string) => void;
  privateApps: AppRuntimeView[];
  runningApps: AppRuntimeView[];
  selectedNode: NetworkNodeData;
  selectedNodeId: string;
  showAdvancedMetrics: boolean;
  tailnetDevices: TailscaleDevice[];
  tailscale: TailscaleStatus | null;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <NetworkMap apps={apps} exposureGroups={exposureGroups} onSelectNode={onSelectNode} privateApps={privateApps} runningApps={runningApps} selectedNodeId={selectedNodeId} tailnetDevices={tailnetDevices} tailscale={tailscale} />
      <NetworkNodeDetails onReviewPrivateLinks={onReviewPrivateLinks} privateApps={privateApps} selectedNode={selectedNode} showAdvancedMetrics={showAdvancedMetrics} tailscale={tailscale} />
    </div>
  );
}
