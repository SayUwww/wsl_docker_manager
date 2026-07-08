import { useAppStore } from '../../store';
import { DockerStatus } from '../../types';
import { Info, Server, Package, Container } from 'lucide-react';
import { translate } from '../../i18n';

const statusLabels: Record<DockerStatus, { labelKey: Parameters<typeof translate>[1]; className: string }> = {
  connected: { labelKey: 'connected', className: 'badge-success' },
  disconnected: { labelKey: 'disconnected', className: 'badge-error' },
  connecting: { labelKey: 'connecting', className: 'badge-warning' },
  error: { labelKey: 'error', className: 'badge-error' },
};

export default function DockerInfoCard() {
  const dockerStatus = useAppStore((s) => s.dockerStatus);
  const dockerInfo = useAppStore((s) => s.dockerInfo);
  const language = useAppStore((s) => s.language);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const status = statusLabels[dockerStatus];

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
        <Info size={16} className="text-indigo-400" />
        {t('dockerEngine')}
      </h3>

      <div className="mb-4">
        <span className={status.className}>{t(status.labelKey)}</span>
      </div>

      {dockerInfo ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Server size={14} className="text-zinc-500 flex-shrink-0" />
            <span className="text-zinc-400">v{dockerInfo.dockerVersion}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Package size={14} className="text-zinc-500 flex-shrink-0" />
            <span className="text-zinc-400">{dockerInfo.images} {t('images')}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Container size={14} className="text-zinc-500 flex-shrink-0" />
            <span className="text-zinc-400">
              {dockerInfo.containersRunning} {t('running')} / {dockerInfo.containers} {t('total')}
            </span>
          </div>
          <div className="pt-2 border-t border-zinc-800">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>{t('running')}</span>
              <span className="text-green-400 font-mono">{dockerInfo.containersRunning}</span>
            </div>
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>{t('stopped')}</span>
              <span className="text-zinc-400 font-mono">{dockerInfo.containersStopped}</span>
            </div>
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>{t('paused')}</span>
              <span className="text-amber-400 font-mono">{dockerInfo.containersPaused}</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-zinc-500 text-sm">{t('waitingDocker')}</p>
      )}
    </div>
  );
}
