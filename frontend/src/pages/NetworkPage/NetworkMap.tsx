import { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AppRuntimeView } from '@/types/app';
import type { TailscaleDevice, TailscaleStatus } from '@/types/network';
import { networkNodeIcons, statusTone } from './extensions/NetworkPage.theme';
import type { AppExposureGroup, AppExposureLevel, NetworkFlowNode, NetworkNodeData } from './extensions/NetworkPage.types';

const nodeTypes = {
  networkNode: NetworkFlowNodeCard,
  securityZone: SecurityZoneNode,
};

type SecurityZoneData = {
  detail: string;
  label: string;
  tone: 'public' | 'tailnet' | 'lan' | 'local';
};

type NetworkDiagramNode = NetworkFlowNode | Node<SecurityZoneData, 'securityZone'>;

const NODE_WIDTH = 210;
const LANE_X = 28;
const LANE_WIDTH = 1040;
const LANE_HEIGHT = 146;
const LANE_GAP = 34;
const PUBLIC_Y = 72;
const TAILNET_Y = PUBLIC_Y + LANE_HEIGHT + LANE_GAP;
const LAN_Y = TAILNET_Y + LANE_HEIGHT + LANE_GAP;
const LOCAL_Y = LAN_Y + LANE_HEIGHT + LANE_GAP;
const NODE_OFFSET_Y = 38;

export function NetworkMap({
  apps,
  exposureGroups,
  onSelectNode,
  privateApps,
  runningApps,
  selectedNodeId,
  tailnetDevices,
  tailscale,
}: {
  apps: AppRuntimeView[];
  exposureGroups: Record<AppExposureLevel, AppExposureGroup>;
  onSelectNode: (nodeId: string) => void;
  privateApps: AppRuntimeView[];
  runningApps: AppRuntimeView[];
  selectedNodeId: string;
  tailnetDevices: TailscaleDevice[];
  tailscale: TailscaleStatus | null;
}) {
  const connected = Boolean(tailscale?.connected);
  const publicApps = exposureGroups.public;
  const tailnetApps = exposureGroups.tailnet;
  const lanApps = exposureGroups.lan;
  const localApps = exposureGroups.local;
  const graphNodes = useMemo<NetworkDiagramNode[]>(() => [
    {
      className: 'pointer-events-none',
      data: {
        detail: publicApps.apps.length > 0 ? 'Anyone on the internet may be able to reach these apps' : 'No apps cross this boundary',
        label: 'Internet',
        tone: 'public',
      },
      draggable: false,
      id: 'zone-public',
      position: { x: LANE_X, y: PUBLIC_Y },
      selectable: false,
      type: 'securityZone',
      zIndex: -10,
    },
    {
      className: 'pointer-events-none',
      data: {
        detail: tailnetApps.apps.length > 0 ? 'Your approved phones, laptops, and family devices can reach these apps' : 'No apps are shared with trusted devices yet',
        label: 'My Devices',
        tone: 'tailnet',
      },
      draggable: false,
      id: 'zone-tailnet',
      position: { x: LANE_X, y: TAILNET_Y },
      selectable: false,
      type: 'securityZone',
      zIndex: -10,
    },
    {
      className: 'pointer-events-none',
      data: {
        detail: lanApps.apps.length > 0 ? 'Devices connected at home can reach these apps' : 'No apps are shared on the home network yet',
        label: 'Home Network',
        tone: 'lan',
      },
      draggable: false,
      id: 'zone-lan',
      position: { x: LANE_X, y: LAN_Y },
      selectable: false,
      type: 'securityZone',
      zIndex: -10,
    },
    {
      className: 'pointer-events-none',
      data: {
        detail: 'Only this Project OS server should open these apps',
        label: 'This Server',
        tone: 'local',
      },
      draggable: false,
      id: 'zone-local',
      position: { x: LANE_X, y: LOCAL_Y },
      selectable: false,
      type: 'securityZone',
      zIndex: -10,
    },
    {
      id: 'internet',
      selected: selectedNodeId === 'internet',
      type: 'networkNode',
      position: { x: 780, y: PUBLIC_Y + NODE_OFFSET_Y },
      data: {
        detail: 'Outside your home',
        insight: 'This is everyone outside your home and private network. Apps should only appear here when you intentionally make them public.',
        kind: 'internet',
        label: 'Internet',
        status: 'neutral',
      },
    },
    {
      id: 'public-apps',
      selected: selectedNodeId === 'public-apps',
      type: 'networkNode',
      position: { x: 150, y: PUBLIC_Y + NODE_OFFSET_Y },
      data: {
        count: publicApps.apps.length,
        detail: publicApps.detail,
        insight: publicApps.apps.length > 0 ? 'These apps appear reachable by people outside your home network. Review them carefully.' : 'No apps are currently shown as reachable by the wider internet.',
        items: appExamples(publicApps),
        kind: 'public-apps',
        label: 'Public apps',
        status: publicApps.status,
      },
    },
    {
      id: 'project-os',
      selected: selectedNodeId === 'project-os',
      type: 'networkNode',
      position: { x: 780, y: TAILNET_Y + NODE_OFFSET_Y },
      data: {
        detail: connected ? tailscale?.dnsName || tailscale?.deviceName || 'Connected to Tailscale' : 'Connect this device first',
        insight: connected ? 'Project OS creates private links and keeps app access aligned with your chosen sharing level.' : 'Connect Project OS to Tailscale before creating private app links.',
        kind: 'project-os',
        label: 'Project OS',
        status: connected ? 'connected' : 'warning',
      },
    },
    {
      id: 'router',
      selected: selectedNodeId === 'router',
      type: 'networkNode',
      position: { x: 150, y: LAN_Y + NODE_OFFSET_Y },
      data: {
        detail: 'Trusted home network',
        insight: 'Devices connected to your home network can reach apps intentionally shared in the Home Network zone.',
        kind: 'router',
        label: 'Home Network',
        status: 'connected',
      },
    },
    {
      id: 'network-apps',
      selected: selectedNodeId === 'network-apps',
      type: 'networkNode',
      position: { x: 465, y: TAILNET_Y + NODE_OFFSET_Y },
      data: {
        count: tailnetApps.apps.length,
        detail: tailnetApps.detail,
        insight: 'These apps can be reached from your approved devices through private Tailscale links. Project OS verifies those links when Tailscale Serve data is available.',
        items: appExamples(tailnetApps),
        kind: 'network-apps',
        label: 'Private apps',
        status: tailnetApps.status,
      },
    },
    {
      id: 'lan',
      selected: selectedNodeId === 'lan',
      type: 'networkNode',
      position: { x: 465, y: LAN_Y + NODE_OFFSET_Y },
      data: {
        count: lanApps.apps.length,
        detail: lanApps.detail,
        insight: 'These apps are reachable from trusted devices while they are on your home network. They do not need a private Tailscale link unless you want access away from home.',
        items: appExamples(lanApps),
        kind: 'lan',
        label: 'Home apps',
        status: lanApps.status,
      },
    },
    {
      id: 'devices',
      selected: selectedNodeId === 'devices',
      type: 'networkNode',
      position: { x: 150, y: TAILNET_Y + NODE_OFFSET_Y },
      data: {
        count: tailnetDevices.length,
        detail: connected ? `${tailnetDevices.filter((device) => device.online).length} online now` : 'Waiting for setup',
        insight: connected ? 'These trusted devices can reach private app links when they are online.' : 'After setup, your phone, laptop, or family devices can join this private network.',
        kind: 'devices',
        label: 'My Devices',
        status: connected && tailnetDevices.some((device) => device.online) ? 'connected' : 'warning',
      },
    },
    {
      id: 'local-apps',
      selected: selectedNodeId === 'local-apps',
      type: 'networkNode',
      position: { x: 465, y: LOCAL_Y + NODE_OFFSET_Y },
      data: {
        count: localApps.apps.length,
        detail: localApps.detail,
        insight: 'These apps are only available from this Project OS server. Other devices should not be able to open them directly.',
        items: appExamples(localApps),
        kind: 'local-apps',
        label: 'Server-only apps',
        status: localApps.status,
      },
    },
  ], [connected, lanApps, localApps, publicApps, selectedNodeId, tailnetApps, tailnetDevices, tailscale?.deviceName, tailscale?.dnsName]);

  const graphEdges = useMemo<Edge[]>(() => {
    const privateEdge = connected
      ? { stroke: '#38bdf8', strokeWidth: 2.25 }
      : { stroke: '#475569', strokeDasharray: '7 7', strokeWidth: 2 };
    const publicEdge = publicApps.apps.length > 0
      ? { stroke: '#f97316', strokeWidth: 2.5 }
      : { stroke: '#64748b', strokeDasharray: '8 8', strokeWidth: 2 };
    return [
      { id: 'public-apps-internet', source: 'public-apps', sourceHandle: 'right', target: 'internet', targetHandle: 'left', animated: publicApps.apps.length > 0, style: publicEdge, type: 'smoothstep' },
      { id: 'devices-network-apps', source: 'devices', sourceHandle: 'right', target: 'network-apps', targetHandle: 'left', animated: connected && tailnetApps.apps.length > 0, style: privateEdge, type: 'smoothstep' },
      { id: 'network-apps-project-os', source: 'network-apps', sourceHandle: 'right', target: 'project-os', targetHandle: 'left', animated: connected && tailnetApps.apps.length > 0, style: privateEdge, type: 'smoothstep' },
      { id: 'router-lan-apps', source: 'router', sourceHandle: 'right', target: 'lan', targetHandle: 'left', animated: lanApps.apps.length > 0, style: { stroke: '#22c55e', strokeWidth: 2.25 }, type: 'smoothstep' },
      { id: 'lan-apps-project-os', source: 'lan', sourceHandle: 'right', target: 'project-os', targetHandle: 'bottom', animated: false, style: { stroke: '#22c55e', strokeDasharray: '7 7', strokeWidth: 2 }, type: 'smoothstep' },
      { id: 'project-os-local-apps', source: 'project-os', sourceHandle: 'bottom', target: 'local-apps', targetHandle: 'top', animated: false, style: { stroke: '#22d3ee', strokeDasharray: '6 6', strokeWidth: 2 }, type: 'smoothstep' },
    ];
  }, [connected, lanApps.apps.length, publicApps.apps.length, tailnetApps.apps.length]);
  const [nodes, setNodes, onNodesChange] = useNodesState<NetworkDiagramNode>(graphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);

  useEffect(() => {
    setNodes(graphNodes);
  }, [graphNodes, setNodes]);

  useEffect(() => {
    setEdges(graphEdges);
  }, [graphEdges, setEdges]);

  return (
    <Card className="min-h-[760px] overflow-hidden border-sky-400/30 bg-slate-900 py-0 text-slate-100 shadow-xl shadow-slate-950/30">
      <CardContent className="relative h-[760px] p-0">
        <MapZoneChips />
        <MapLegend />
        <ReactFlow
          className="network-flow bg-transparent"
          defaultViewport={{ x: 32, y: 18, zoom: 0.82 }}
          edges={edges}
          minZoom={0.45}
          maxZoom={1.3}
          nodeTypes={nodeTypes}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={false}
          onNodeClick={(_, node) => onSelectNode(node.id)}
          onEdgesChange={onEdgesChange}
          onNodesChange={onNodesChange}
          panOnDrag
          proOptions={{ hideAttribution: true }}
        >
          <Background color="rgba(148,163,184,0.45)" gap={22} size={1} />
          <Controls className="!bottom-5 !left-5 !border !border-sky-400/25 !bg-slate-900 [&_button]:!border-sky-400/25 [&_button]:!bg-slate-900 [&_button]:!text-slate-100 [&_button:hover]:!bg-slate-800 [&_button_svg]:!fill-slate-100" />
        </ReactFlow>
      </CardContent>
    </Card>
  );
}

function NetworkFlowNodeCard({ data, selected }: NodeProps) {
  const nodeData = data as NetworkNodeData;
  const Icon = networkNodeIcons[nodeData.kind];

  return (
    <div className={cn('group grid h-[104px] rounded-lg border px-3.5 py-3 shadow-xl backdrop-blur transition hover:-translate-y-0.5 hover:border-cyan-300/45', statusTone(nodeData.status, 'node'), selected && 'ring-2 ring-cyan-300/70')} style={{ width: NODE_WIDTH }}>
      <FlowHandle id="top" position={Position.Top} type="target" />
      <FlowHandle id="bottom" position={Position.Bottom} type="source" />
      <FlowHandle id="left" position={Position.Left} type="target" />
      <FlowHandle id="right" position={Position.Right} type="source" />
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-sky-400/25 bg-slate-800">
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{nodeData.label}</span>
          <span className="block max-w-[140px] truncate text-xs text-slate-400">{nodeData.detail}</span>
        </span>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3">
        {typeof nodeData.count === 'number' ? (
          <div>
            <span className="block text-xl font-bold text-white">{nodeData.count}</span>
            <span className="text-[11px] text-slate-500">tracked</span>
          </div>
        ) : (
          <span className="text-xs text-slate-500">access point</span>
        )}
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/30">
          <div className={cn('h-full rounded-full', nodeData.status === 'connected' && 'bg-emerald-400', nodeData.status === 'warning' && 'bg-amber-300', nodeData.status === 'neutral' && 'bg-slate-500')} style={{ width: `${nodeData.count ? Math.min(100, Math.max(18, nodeData.count * 18)) : 52}%` }} />
        </div>
      </div>
    </div>
  );
}

function FlowHandle({ id, position, type }: { id: string; position: Position; type: 'source' | 'target' }) {
  return <Handle className="!size-2 !border-slate-950 !bg-sky-300/80" id={id} position={position} type={type} />;
}

function SecurityZoneNode({ data }: NodeProps) {
  const zone = data as SecurityZoneData;
  const tones = {
    public: 'border-orange-400/30 bg-orange-500/5 text-orange-100',
    tailnet: 'border-sky-400/35 bg-sky-500/5 text-sky-100',
    lan: 'border-emerald-400/25 bg-emerald-500/5 text-emerald-100',
    local: 'border-cyan-400/25 bg-cyan-500/5 text-cyan-100',
  };
  return (
    <div className={cn('rounded-xl border border-dashed px-4 py-3', tones[zone.tone])} style={{ width: LANE_WIDTH, height: LANE_HEIGHT }}>
      <p className="text-xs font-bold uppercase tracking-wide">{zone.label}</p>
      <p className="mt-1 max-w-[420px] text-xs text-slate-400">{zone.detail}</p>
    </div>
  );
}

function MapZoneChips() {
  return (
    <div className="absolute left-5 top-5 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-sky-400/25 bg-slate-900 px-3 py-2 text-xs text-slate-300 shadow-lg shadow-slate-950/30">
      <span className="mr-1 text-slate-400">Zones</span>
      <ZoneChip className="border-orange-400/25 bg-orange-500/10 text-orange-200" label="Internet" />
      <ZoneChip className="border-sky-400/25 bg-sky-500/10 text-sky-200" label="My Devices" />
      <ZoneChip className="border-emerald-400/25 bg-emerald-500/10 text-emerald-200" label="Home Network" />
      <ZoneChip className="border-cyan-400/25 bg-cyan-500/10 text-cyan-200" label="This Server" />
    </div>
  );
}

function ZoneChip({ className, label }: { className: string; label: string }) {
  return <span className={cn('rounded-md border px-2.5 py-1 font-medium', className)}>{label}</span>;
}

function MapLegend() {
  return (
    <div className="absolute bottom-5 left-5 z-10 grid gap-2 rounded-lg border border-sky-400/25 bg-slate-900 px-3 py-2 text-xs text-slate-300 shadow-lg shadow-slate-950/30">
      <div className="flex flex-wrap gap-3">
        <LegendLine color="bg-orange-400" label="Public access" />
        <LegendLine color="bg-sky-400" label="Private device access" />
        <LegendLine color="bg-emerald-400" label="At-home access" />
        <LegendLine color="bg-cyan-400" label="Server-only boundary" />
      </div>
      <p className="text-slate-500">Pan the canvas to explore. Zones stay fixed so access boundaries stay clear.</p>
    </div>
  );
}

function LegendLine({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('h-0.5 w-8 rounded-full', color)} />
      {label}
    </span>
  );
}

function appExamples(group: AppExposureGroup) {
  const names = group.apps.slice(0, 3).map((app) => app.appName);
  if (group.apps.length > 3) {
    names.push(`+${group.apps.length - 3} more`);
  }
  return names;
}
