import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store';
import { NetworkInfo } from '../../types';
import { translate } from '../../i18n';
import { useDocker } from '../../hooks/useDocker';
import {
  ReactFlow, Node, Edge, Controls, Background, BackgroundVariant,
  MarkerType, useNodesState, useEdgesState, Handle, Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Trash2, Network as NetworkIcon, Container, Minimize2, Loader2, RefreshCw } from 'lucide-react';

const nodeTypes = {
  network: ({ data }: { data: { label: string } }) => (
    <div className="bg-indigo-600/90 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg border-2 border-indigo-400/50">
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-300 !border-indigo-100" />
      <div className="flex items-center gap-2">
        <NetworkIcon size={14} />
        {data.label}
      </div>
    </div>
  ),
  container: ({ data }: { data: { label: string; ip: string } }) => (
    <div className="bg-zinc-800/90 text-zinc-200 px-3 py-1.5 rounded-lg text-xs shadow-lg border border-zinc-700 hover:border-indigo-500/50 transition-colors">
      <Handle type="target" position={Position.Top} className="!bg-green-400 !border-green-200" />
      <div className="flex items-center gap-1.5 font-mono">
        <Container size={12} className="text-green-400" />
        {data.label}
      </div>
      <div className="text-zinc-500 text-[10px] mt-0.5">{data.ip}</div>
    </div>
  ),
};

export default function NetworkGraph() {
  const networks = useAppStore((s) => s.networks);
  const language = useAppStore((s) => s.language);
  const addToast = useAppStore((s) => s.addToast);
  const requestConfirmation = useAppStore((s) => s.requestConfirmation);
  const isNetworksLoading = useAppStore((s) => Boolean(s.commandLoading.list_networks));
  const { refreshNetworks } = useDocker();
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkInfo | null>(null);
  const [removingNetworkId, setRemovingNetworkId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  const buildGraph = useCallback((network: NetworkInfo) => {
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Network node in center
    const networkNodeId = `net-${network.id}`;
    newNodes.push({
      id: networkNodeId,
      type: 'network',
      position: { x: 360, y: 40 },
      data: { label: network.name },
    });

    // Container nodes around it
    const count = network.containers.length;
    const radius = 200;
    network.containers.forEach((c, i) => {
      const angle = count > 1 ? (2 * Math.PI * i) / count - Math.PI / 2 : Math.PI / 2;
      const x = count > 1 ? 360 + radius * Math.cos(angle) : 360;
      const y = count > 1 ? 280 + radius * Math.sin(angle) : 280;
      const containerNodeId = `container-${c.id}`;

      newNodes.push({
        id: containerNodeId,
        type: 'container',
        position: { x, y },
        data: { label: c.name, ip: c.ipv4 },
      });

      newEdges.push({
        id: `edge-${network.id}-${c.id}`,
        source: networkNodeId,
        target: containerNodeId,
        sourceHandle: null,
        targetHandle: null,
        animated: true,
        type: 'smoothstep',
        style: { stroke: '#6366f1', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1', width: 14, height: 14 },
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [setNodes, setEdges]);

  const handleRemove = useCallback(async (id: string) => {
    const network = networks.find((item) => item.id === id);
    const confirmed = await requestConfirmation({
      title: t('deleteNetworkTitle'),
      message: `${t('delete')} "${network?.name || id}". ${t('cannotBeUndone')}`,
      confirmText: t('delete'),
      variant: 'danger',
    });
    if (!confirmed) return;

    setRemovingNetworkId(id);
    try {
      await invoke('remove_network', { id });
      await refreshNetworks();
      setSelectedNetwork(null);
      addToast({ type: 'success', title: t('networkRemoved') });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: t('removeNetworkFailed'), message: formatNetworkError(e, t) });
    } finally {
      setRemovingNetworkId(null);
    }
  }, [addToast, networks, refreshNetworks, requestConfirmation, t]);

  const handleManualRefresh = useCallback(async () => {
    if (isNetworksLoading) return;
    const refreshed = await refreshNetworks();
    if (refreshed) {
      const updated = useAppStore.getState().networks;
      if (selectedNetwork) {
        const nextSelected = updated.find((network) => network.id === selectedNetwork.id) ?? null;
        setSelectedNetwork(nextSelected);
        if (nextSelected) buildGraph(nextSelected);
      }
      addToast({ type: 'success', title: t('refreshCompleted'), message: t('networks') });
    } else {
      addToast({ type: 'info', title: t('refreshing'), message: t('networks') });
    }
  }, [addToast, buildGraph, isNetworksLoading, refreshNetworks, selectedNetwork, t]);

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('networkTopology')}</h2>
            <p className="text-zinc-400 text-sm mt-1">{networks.length} {t('customNetworks')}</p>
          </div>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isNetworksLoading}
            className="btn-secondary text-xs"
            title={t('refresh')}
          >
            <RefreshCw size={14} className={`mr-1 ${isNetworksLoading ? 'animate-spin' : ''}`} />
            {isNetworksLoading ? t('refreshing') : t('refresh')}
          </button>
        </div>
      </header>

      {!selectedNetwork ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {networks.map((network) => (
            <div
              key={network.id}
              className="card p-5 cursor-pointer hover:border-indigo-500/50 transition-all group"
              onClick={() => {
                setSelectedNetwork(network);
                buildGraph(network);
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <NetworkIcon size={16} className="text-indigo-400" />
                  <h3 className="font-semibold text-sm">{network.name}</h3>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(network.id); }}
                  disabled={removingNetworkId === network.id}
                  className="btn-ghost btn-xs opacity-0 group-hover:opacity-100 text-red-400"
                >
                  {removingNetworkId === network.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
              <div className="space-y-1 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>{t('driver')}</span>
                  <span className="text-zinc-300">{network.driver}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('scope')}</span>
                  <span className="text-zinc-300">{network.scope}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('containers')}</span>
                  <span className="text-indigo-400 font-mono">{network.containers.length}</span>
                </div>
              </div>
            </div>
          ))}
          {networks.length === 0 && (
            <div className="col-span-full card p-16 text-center text-zinc-500">
              {isNetworksLoading ? t('loadingData') : t('noNetworks')}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
              <div>
                <h3 className="font-semibold text-sm">{selectedNetwork.name}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {selectedNetwork.containers.length} {t('containers')}
                </p>
              </div>
              <button
                onClick={() => setSelectedNetwork(null)}
                className="btn-ghost btn-xs"
              >
                <Minimize2 size={16} />
                {t('backToNetworks')}
              </button>
            </div>
            <div style={{ height: 430 }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.25 }}
                className="bg-zinc-950"
                proOptions={{ hideAttribution: true }}
              >
                <Controls className="[&>button]:bg-zinc-800 [&>button]:border-zinc-700 [&>button]:text-zinc-300 [&>button]:fill-zinc-300" />
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
              </ReactFlow>
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[46%]" />
                <col className="w-[27%]" />
                <col className="w-[27%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-3 px-4 text-xs font-medium text-zinc-400 uppercase">{t('containers')}</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase">IPv4</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase">IPv6</th>
                </tr>
              </thead>
              <tbody>
                {selectedNetwork.containers.map((container) => (
                  <tr key={container.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <Container size={14} className="text-green-400 flex-shrink-0" />
                        <span className="truncate text-zinc-200 font-medium" title={container.name}>{container.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400 font-mono text-xs truncate" title={container.ipv4}>
                      {container.ipv4 || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-500 font-mono text-xs truncate" title={container.ipv6}>
                      {container.ipv6 || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selectedNetwork.containers.length === 0 && (
              <div className="py-12 text-center text-zinc-500 text-sm">
                {t('noContainers')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatNetworkError(error: unknown, t: (key: Parameters<typeof translate>[1]) => string): string {
  const message = String(error);
  if (message.includes('pre-defined network') || message.includes('predefined network')) {
    return t('predefinedNetworkRemoveError');
  }
  if (message.includes('has active endpoints')) {
    return t('activeEndpointsNetworkRemoveError');
  }
  return `${t('removeNetworkFailed')}: ${message}`;
}
