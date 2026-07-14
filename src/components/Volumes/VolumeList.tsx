import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store';
import { translate } from '../../i18n';
import { useDocker } from '../../hooks/useDocker';
import { Trash2, HardDrive, AlertTriangle, Database, FolderInput, Loader2, RefreshCw } from 'lucide-react';

export default function VolumeList() {
  const volumes = useAppStore((s) => s.volumes);
  const language = useAppStore((s) => s.language);
  const addToast = useAppStore((s) => s.addToast);
  const requestConfirmation = useAppStore((s) => s.requestConfirmation);
  const isVolumesLoading = useAppStore((s) => Boolean(s.commandLoading.list_volumes));
  const { refreshVolumes } = useDocker();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pruning, setPruning] = useState(false);
  const [removingNames, setRemovingNames] = useState<Set<string>>(new Set());
  const [batchRemoving, setBatchRemoving] = useState(false);
  const emptyRefreshAttemptedRef = useRef(false);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  useEffect(() => {
    if (emptyRefreshAttemptedRef.current || volumes.length > 0 || isVolumesLoading) return;
    emptyRefreshAttemptedRef.current = true;
    void refreshVolumes();
  }, [isVolumesLoading, refreshVolumes, volumes.length]);

  const orphanVolumes = volumes.filter((v) => v.orphan);
  const usedVolumes = volumes.filter((v) => !v.orphan);

  const toggleSelect = (name: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleManualRefresh = useCallback(async () => {
    if (isVolumesLoading) return;
    const refreshed = await refreshVolumes();
    if (refreshed) {
      addToast({ type: 'success', title: t('refreshCompleted'), message: t('volumes') });
    } else {
      addToast({ type: 'info', title: t('refreshing'), message: t('volumes') });
    }
  }, [addToast, isVolumesLoading, refreshVolumes, t]);

  const handleRemove = useCallback(async (name: string) => {
    const confirmed = await requestConfirmation({
      title: t('deleteVolumeTitle'),
      message: `${t('delete')} "${name}". ${t('cannotBeUndone')}`,
      confirmText: t('delete'),
      variant: 'danger',
    });
    if (!confirmed) return;

    setRemovingNames((prev) => new Set(prev).add(name));
    try {
      await invoke('remove_volume', { name, force: false });
      await refreshVolumes();
      addToast({ type: 'success', title: t('volumeRemoved'), message: name });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: t('removeVolumeFailed'), message: String(e) });
    } finally {
      setRemovingNames((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  }, [addToast, refreshVolumes, requestConfirmation, t]);

  const handlePrune = useCallback(async () => {
    const confirmed = await requestConfirmation({
      title: t('pruneOrphanVolumesTitle'),
      message: `${t('pruneOrphans')}. ${t('cannotBeUndone')}`,
      confirmText: t('pruneOrphans'),
      variant: 'danger',
    });
    if (!confirmed) return;

    setPruning(true);
    try {
      await invoke('prune_volumes');
      await refreshVolumes();
      addToast({ type: 'success', title: t('orphanVolumesPruned') });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: t('pruneVolumesFailed'), message: String(e) });
    } finally {
      setPruning(false);
    }
  }, [addToast, refreshVolumes, requestConfirmation, t]);

  const handleBatchRemove = useCallback(async () => {
    const confirmed = await requestConfirmation({
      title: t('deleteSelectedVolumesTitle'),
      message: `${t('forceDelete')} ${selectedIds.size} ${t('volumes')}. ${t('cannotBeUndone')}`,
      confirmText: t('delete'),
      variant: 'danger',
    });
    if (!confirmed) return;

    setBatchRemoving(true);
    try {
      const errors: string[] = [];
      for (const name of selectedIds) {
        try {
          await invoke('remove_volume', { name, force: true });
        } catch (e) {
          console.error(e);
          errors.push(`${name}: ${String(e)}`);
        }
      }
      setSelectedIds(new Set());
      await refreshVolumes();
      if (errors.length > 0) {
        addToast({ type: 'error', title: t('removeVolumesFailed'), message: errors.join('; ') });
      } else {
        addToast({ type: 'success', title: t('volumesRemoved'), message: `${selectedIds.size} ${t('volumes')}` });
      }
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: t('refreshVolumesFailed'), message: String(e) });
    } finally {
      setBatchRemoving(false);
    }
  }, [addToast, refreshVolumes, requestConfirmation, selectedIds, t]);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <header className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{t('volumes')}</h2>
              <p className="text-zinc-400 text-sm mt-1">
                {volumes.length} {t('volumes')} &middot; {orphanVolumes.length} {t('orphaned')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isVolumesLoading}
                className="btn-secondary text-xs"
                title={t('refresh')}
              >
                <RefreshCw size={14} className={`mr-1 ${isVolumesLoading ? 'animate-spin' : ''}`} />
                {isVolumesLoading ? t('refreshing') : t('refresh')}
              </button>
              {selectedIds.size > 0 && (
                <button onClick={handleBatchRemove} disabled={batchRemoving} className="btn-danger text-xs">
                  {batchRemoving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Trash2 size={14} className="mr-1" />}
                  {t('delete')} ({selectedIds.size})
                </button>
              )}
              <button
                onClick={handlePrune}
                disabled={pruning}
                className="btn-secondary text-xs"
              >
                {pruning ? <Loader2 size={14} className="mr-1 animate-spin" /> : <AlertTriangle size={14} className="mr-1" />}
                {pruning ? t('pruning') : t('pruneOrphans')}
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
              <Database size={14} />
              {t('totalVolumes')}
            </div>
            <div className="text-2xl font-bold">{volumes.length}</div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
              <HardDrive size={14} />
              {t('inUse')}
            </div>
            <div className="text-2xl font-bold text-green-400">{usedVolumes.length}</div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
              <AlertTriangle size={14} />
              {t('orphaned')}
            </div>
            <div className="text-2xl font-bold text-amber-400">{orphanVolumes.length}</div>
          </div>
        </div>
      </div>

      {/* Volume list */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="w-10 py-3 px-4">
                  <input
                    type="checkbox"
                    className="rounded border-zinc-600 bg-zinc-800"
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(new Set(orphanVolumes.map((v) => v.name)));
                      else setSelectedIds(new Set());
                    }}
                  />
                </th>
                <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase">{t('name')}</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase">{t('driver')}</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase">{t('mountpoint')}</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase">{t('containers')}</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase">{t('status')}</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-zinc-400 uppercase">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {volumes.map((vol) => (
                <tr key={vol.name} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${vol.orphan ? 'bg-amber-500/2' : ''}`}>
                  <td className="py-2.5 px-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(vol.name)}
                      onChange={() => toggleSelect(vol.name)}
                      className="rounded border-zinc-600 bg-zinc-800"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <FolderInput size={14} className="text-zinc-500" />
                      <span className="font-mono text-xs text-zinc-200">{vol.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-zinc-400 text-xs">{vol.driver}</td>
                  <td className="py-2.5 px-3 text-zinc-500 font-mono text-[11px] max-w-[300px] truncate">{vol.mountpoint}</td>
                  <td className="py-2.5 px-3 text-zinc-400 text-xs">
                    {vol.containers.length > 0 ? (
                      <span className="block max-w-[180px] truncate" title={vol.containers.join(', ')}>
                        {vol.containers.join(', ')}
                      </span>
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {vol.orphan ? (
                      <span className="badge-warning">{t('orphaned')}</span>
                    ) : (
                      <span className="badge-success">{t('inUse')}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex justify-end">
                      {vol.orphan && (
                        <button
                          onClick={() => handleRemove(vol.name)}
                          disabled={removingNames.has(vol.name)}
                          className="btn-danger btn-xs"
                          title={t('remove')}
                        >
                          {removingNames.has(vol.name) ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {volumes.length === 0 && (
            <div className="py-16 text-center text-zinc-500 text-sm">{isVolumesLoading ? t('loadingData') : t('noVolumes')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
