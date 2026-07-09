import { ContainerInfo } from '../../types';
import { useAppStore } from '../../store';
import { translate } from '../../i18n';

interface ActiveContainersProps {
  title: string;
  containers: ContainerInfo[];
  emptyMessage: string;
}

export default function ActiveContainers({ title, containers, emptyMessage }: ActiveContainersProps) {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const language = useAppStore((s) => s.language);
  const visibleContainers = containers.slice(0, 3);

  const formatPorts = (ports: ContainerInfo['ports']) => {
    return ports
      .filter((p) => p.publicPort)
      .map((p) => `${p.publicPort}:${p.privatePort}`)
      .join(', ');
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-300">{title}</h3>
        <span className="text-xs text-zinc-500">{containers.length}</span>
      </div>

      {containers.length === 0 ? (
        <p className="text-zinc-500 text-sm py-6 text-center">{emptyMessage}</p>
      ) : (
        <div className="space-y-2">
          {visibleContainers.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/40 hover:bg-zinc-800/70 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${c.state === 'running' ? 'bg-green-500' : 'bg-zinc-500'}`} />
                  <span className="text-sm font-medium text-zinc-200 truncate">{c.name}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                  <span className="truncate">{c.image}</span>
                  {formatPorts(c.ports) && (
                    <span className="text-zinc-600">{formatPorts(c.ports)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500 ml-4">
                {c.state === 'running' && (
                  <>
                    <span className="font-mono text-zinc-400">{c.cpuPercent.toFixed(1)}% CPU</span>
                    <span className="font-mono text-zinc-400">{c.memPercent.toFixed(1)}% Mem</span>
                  </>
                )}
              </div>
            </div>
          ))}
          {containers.length > 0 && (
            <button
              onClick={() => setActiveTab('containers')}
              className="w-full mt-2 py-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {translate(language, 'viewAllContainers')} {'->'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
