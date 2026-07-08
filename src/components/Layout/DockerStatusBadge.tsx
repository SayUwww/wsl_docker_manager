import { useAppStore } from '../../store';
import { DockerStatus } from '../../types';
import { translate } from '../../i18n';

const statusConfig: Record<DockerStatus, { labelKey: Parameters<typeof translate>[1]; color: string; dot: string }> = {
  connected: { labelKey: 'dockerConnected', color: 'text-green-400', dot: 'bg-green-500' },
  disconnected: { labelKey: 'dockerDisconnected', color: 'text-zinc-500', dot: 'bg-zinc-500' },
  connecting: { labelKey: 'connecting', color: 'text-amber-400', dot: 'bg-amber-500' },
  error: { labelKey: 'connectionError', color: 'text-red-400', dot: 'bg-red-500' },
};

export default function DockerStatusBadge() {
  const dockerStatus = useAppStore((s) => s.dockerStatus);
  const language = useAppStore((s) => s.language);
  const config = statusConfig[dockerStatus];

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${config.dot} ${dockerStatus === 'connected' ? 'animate-pulse' : ''}`} />
      <span className={`text-xs ${config.color}`}>{translate(language, config.labelKey)}</span>
    </div>
  );
}
