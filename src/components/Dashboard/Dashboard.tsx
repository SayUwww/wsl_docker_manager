import { useAppStore } from '../../store';
import ResourceRing from './ResourceRing';
import ActiveContainers from './ActiveContainers';
import DockerInfoCard from './DockerInfoCard';
import ExecutionLogPanel from './ExecutionLogPanel';
import { Cpu } from 'lucide-react';
import { translate } from '../../i18n';

export default function Dashboard() {
  const resourceStats = useAppStore((s) => s.resourceStats);
  const containers = useAppStore((s) => s.containers);
  const language = useAppStore((s) => s.language);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  const runningContainers = containers.filter((c) => c.state === 'running');
  const stoppedContainers = containers.filter((c) => c.state !== 'running');

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">{t('dashboard')}</h2>
        <p className="text-zinc-400 text-sm mt-1">WSL Docker environment overview</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="card p-5 col-span-1 lg:col-span-2">
          <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <Cpu size={16} className="text-indigo-400" />
            {t('systemResources')}
          </h3>
          {resourceStats ? (
            <div className="flex items-center justify-around">
              <ResourceRing
                value={Math.round(resourceStats.cpuPercent)}
                label="CPU"
                color="#6366f1"
                size={120}
                strokeWidth={10}
              />
              <ResourceRing
                value={Math.round(resourceStats.memPercent)}
                label="Memory"
                color="#22c55e"
                size={120}
                strokeWidth={10}
              />
              <div className="hidden md:block">
                <ResourceRing
                  value={Math.round((resourceStats.diskUsed / resourceStats.diskTotal) * 100)}
                  label="Disk"
                  color="#f59e0b"
                  size={120}
                  strokeWidth={10}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
              {t('loadingResources')}
            </div>
          )}
        </div>

        <DockerInfoCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ActiveContainers
          title={t('runningList')}
          containers={runningContainers}
          emptyMessage={t('noRunning')}
        />
        <ActiveContainers
          title={t('stoppedList')}
          containers={stoppedContainers.slice(0, 5)}
          emptyMessage={t('allRunning')}
        />
      </div>

      <div className="mt-6">
        <ExecutionLogPanel />
      </div>
    </div>
  );
}
