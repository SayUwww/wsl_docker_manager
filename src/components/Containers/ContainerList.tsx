import { Fragment, useState, useCallback, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openPath } from '@tauri-apps/plugin-shell';
import { useAppStore } from '../../store';
import { ContainerInfo } from '../../types';
import { translate } from '../../i18n';
import { describeDockerCommand } from '../../utils/executionLog';
import { useDocker } from '../../hooks/useDocker';
import {
  Play, Square, RotateCcw, Trash2, Terminal, ScrollText,
  Search, ExternalLink, FolderOpen, Loader2, Pencil,
  RefreshCw,
} from 'lucide-react';

export default function ContainerList() {
  const containers = useAppStore((s) => s.containers);
  const selectedContainers = useAppStore((s) => s.selectedContainers);
  const toggleContainerSelection = useAppStore((s) => s.toggleContainerSelection);
  const clearContainerSelection = useAppStore((s) => s.clearContainerSelection);
  const setLogContainer = useAppStore((s) => s.setLogContainer);
  const setTerminalContainer = useAppStore((s) => s.setTerminalContainer);
  const language = useAppStore((s) => s.language);
  const addExecutionLog = useAppStore((s) => s.addExecutionLog);
  const addToast = useAppStore((s) => s.addToast);
  const requestConfirmation = useAppStore((s) => s.requestConfirmation);
  const isContainersLoading = useAppStore((s) => Boolean(s.commandLoading.list_containers));
  const { refreshContainers } = useDocker();
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [groupValue, setGroupValue] = useState('');
  const [batchGroupValue, setBatchGroupValue] = useState('');
  const [showBatchGroup, setShowBatchGroup] = useState(false);
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [editingOriginalUrl, setEditingOriginalUrl] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState('');
  const [openUrlMenu, setOpenUrlMenu] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const [pendingBatchAction, setPendingBatchAction] = useState<string | null>(null);
  const groupOptions = Array.from(new Set(containers.map((c) => c.group?.trim() || '__ungrouped__'))).sort((a, b) => {
    if (a === '__ungrouped__') return 1;
    if (b === '__ungrouped__') return -1;
    return a.localeCompare(b);
  });

  const filtered = containers.filter((c) => {
    if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase()) && !c.image.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    const normalizedGroup = c.group?.trim() || '__ungrouped__';
    if (groupFilter !== 'all' && normalizedGroup !== groupFilter) return false;
    if (statusFilter === 'running' && c.state !== 'running') return false;
    if (statusFilter === 'stopped' && c.state === 'running') return false;
    if (statusFilter === 'paused' && c.state !== 'paused') return false;
    return true;
  });
  const grouped = filtered.reduce<Record<string, ContainerInfo[]>>((acc, container) => {
    const group = container.group?.trim() || t('ungrouped');
    acc[group] = acc[group] || [];
    acc[group].push(container);
    return acc;
  }, {});
  const groupNames = Object.keys(grouped).sort((a, b) => {
    if (a === t('ungrouped')) return 1;
    if (b === t('ungrouped')) return -1;
    return a.localeCompare(b);
  });

  const selectedIds = Array.from(selectedContainers);
  const runInvoke = useCallback(async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
    const started = performance.now();
    try {
      const result = await invoke<T>(command, args);
      addExecutionLog({ command, displayCommand: describeDockerCommand(command, args), args, status: 'ok', durationMs: Math.round(performance.now() - started) });
      return result;
    } catch (error) {
      addExecutionLog({ command, displayCommand: describeDockerCommand(command, args), args, status: 'error', durationMs: Math.round(performance.now() - started), message: String(error) });
      throw error;
    }
  }, [addExecutionLog]);

  const refreshContainerList = useCallback(() => refreshContainers(true), [refreshContainers]);

  const handleSelectAllFiltered = useCallback((checked: boolean) => {
    if (checked) {
      useAppStore.getState().selectAllContainers(filtered.map((c) => c.id));
    } else {
      clearContainerSelection();
    }
  }, [clearContainerSelection, filtered]);

  const handleManualRefresh = useCallback(async () => {
    if (isContainersLoading) return;
    const refreshed = await refreshContainerList();
    if (refreshed) {
      addToast({ type: 'success', title: t('refreshCompleted'), message: t('containers') });
    } else {
      addToast({ type: 'info', title: t('refreshing'), message: t('containers') });
    }
  }, [addToast, isContainersLoading, refreshContainerList, t]);

  const handleBatch = useCallback(async (action: string) => {
    if (action === 'remove') {
      const confirmed = await requestConfirmation({
        title: t('deleteSelectedContainersTitle'),
        message: `${t('forceDelete')} ${selectedIds.length} ${t('containers')}. ${t('cannotBeUndone')}`,
        confirmText: t('delete'),
        variant: 'danger',
      });
      if (!confirmed) return;
    }

    setPendingBatchAction(action);
    try {
      await runInvoke(`batch_${action}_containers`, action === 'remove' ? { ids: selectedIds, force: true } : { ids: selectedIds });
      clearContainerSelection();
      await refreshContainerList();
      addToast({
        type: 'success',
        title: `${containerActionLabel(action, t)} ${t('completed')}`,
        message: `${selectedIds.length} ${t('containers')}`,
      });
    } catch (e) {
      console.error(e);
      addToast({
        type: 'error',
        title: `${containerActionLabel(action, t)} ${t('failed')}`,
        message: String(e),
      });
    } finally {
      setPendingBatchAction(null);
    }
  }, [addToast, selectedIds, clearContainerSelection, refreshContainerList, requestConfirmation, runInvoke, t]);

  const handleSingleAction = useCallback(async (action: string, id: string) => {
    const key = `${action}:${id}`;
    const container = containers.find((item) => item.id === id);
    setPendingActions((prev) => new Set(prev).add(key));
    try {
      await runInvoke(`${action}_container`, { id });
      await refreshContainerList();
      addToast({
        type: 'success',
        title: `${containerActionLabel(action, t)} ${t('completed')}`,
        message: container?.name,
      });
    } catch (e) {
      console.error(e);
      addToast({
        type: 'error',
        title: `${containerActionLabel(action, t)} ${t('failed')}`,
        message: `${container?.name ? `${container.name}: ` : ''}${String(e)}`,
      });
    } finally {
      setPendingActions((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [addToast, containers, refreshContainerList, runInvoke, t]);

  const saveGroup = useCallback(async (id: string) => {
    if (savingGroupId === id) return;
    const container = containers.find((item) => item.id === id);
    setSavingGroupId(id);
    try {
      await runInvoke('update_container_meta', { id, group: groupValue, urls: null });
      await refreshContainerList();
      addToast({ type: 'success', title: t('groupSaved'), message: container?.name });
    } catch (e) {
      console.error(e);
      addToast({
        type: 'error',
        title: t('saveGroupFailed'),
        message: `${container?.name ? `${container.name}: ` : ''}${String(e)}`,
      });
    }
    setSavingGroupId(null);
    setEditingGroup(null);
  }, [addToast, containers, groupValue, savingGroupId, refreshContainerList, runInvoke, t]);

  const saveBatchGroup = useCallback(async () => {
    setPendingBatchAction('group');
    try {
      for (const id of selectedIds) {
        await runInvoke('update_container_meta', { id, group: batchGroupValue, urls: null });
      }
      clearContainerSelection();
      setBatchGroupValue('');
      setShowBatchGroup(false);
      await refreshContainerList();
      addToast({ type: 'success', title: t('groupsSaved'), message: `${selectedIds.length} ${t('containers')}` });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: t('saveGroupsFailed'), message: String(e) });
    } finally {
      setPendingBatchAction(null);
    }
  }, [addToast, selectedIds, batchGroupValue, clearContainerSelection, refreshContainerList, runInvoke, t]);

  const saveUrl = useCallback(async (id: string, existingUrls: string[] | undefined) => {
    const nextUrl = normalizeUrl(urlValue);
    if (!nextUrl) {
      setEditingUrl(null);
      setUrlValue('');
      return;
    }

    const currentUrls = existingUrls || [];
    const urls = editingOriginalUrl
      ? currentUrls.map((url) => (url === editingOriginalUrl ? nextUrl : url))
      : [...currentUrls, nextUrl];
    const container = containers.find((item) => item.id === id);
    try {
      await runInvoke('update_container_meta', { id, group: null, urls: Array.from(new Set(urls)) });
      await refreshContainerList();
      addToast({ type: 'success', title: editingOriginalUrl ? t('urlUpdated') : t('urlAdded'), message: container?.name });
    } catch (e) {
      console.error(e);
      addToast({
        type: 'error',
        title: t('saveUrlFailed'),
        message: `${container?.name ? `${container.name}: ` : ''}${String(e)}`,
      });
    }
    setEditingUrl(null);
    setEditingOriginalUrl(null);
    setUrlValue('');
  }, [addToast, containers, urlValue, editingOriginalUrl, refreshContainerList, runInvoke, t]);

  const deleteUrl = useCallback(async (id: string, existingUrls: string[] | undefined, urlToDelete: string) => {
    const confirmed = await requestConfirmation({
      title: t('deleteUrlTitle'),
      message: `${t('deleteUrlMessage')} ${urlToDelete}`,
      confirmText: t('delete'),
      variant: 'danger',
    });
    if (!confirmed) return;

    const urls = (existingUrls || []).filter((url) => url !== urlToDelete);
    const container = containers.find((item) => item.id === id);
    try {
      await runInvoke('update_container_meta', { id, group: null, urls });
      await refreshContainerList();
      setOpenUrlMenu(null);
      setEditingUrl(null);
      setEditingOriginalUrl(null);
      setUrlValue('');
      addToast({ type: 'success', title: t('urlRemoved'), message: container?.name });
    } catch (e) {
      console.error(e);
      addToast({
        type: 'error',
        title: t('removeUrlFailed'),
        message: `${container?.name ? `${container.name}: ` : ''}${String(e)}`,
      });
    }
  }, [addToast, containers, refreshContainerList, requestConfirmation, runInvoke, t]);

  const openExternalUrl = useCallback(async (url: string) => {
    try {
      await openPath(normalizeUrl(url) || url);
      setOpenUrlMenu(null);
      addToast({ type: 'success', title: t('urlOpened'), message: normalizeUrl(url) || url });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: t('openUrlFailed'), message: String(e) });
    }
  }, [addToast, t]);

  const stateBadge = (state: string) => {
    switch (state) {
      case 'running': return <span className="badge-success">{t('running')}</span>;
      case 'exited': return <span className="badge-error">{t('stopped')}</span>;
      case 'paused': return <span className="badge-warning">{t('paused')}</span>;
      default: return <span className="badge-info">{state}</span>;
    }
  };

  const ActionIcon = ({ action, id, icon }: { action: string; id: string; icon: ReactNode }) =>
    pendingActions.has(`${action}:${id}`) ? <Loader2 size={14} className="animate-spin" /> : <>{icon}</>;

  const displayPorts = (container: ContainerInfo) => Array.from(new Set(
    container.ports
      .filter((p) => p.publicPort)
      .map((p) => `${p.publicPort}:${p.privatePort}`),
  ));

  const renderTableColGroup = () => (
    <colgroup>
      <col className="w-[4%]" />
      <col className="w-[17%]" />
      <col className="w-[20%]" />
      <col className="w-[10%]" />
      <col className="w-[12%]" />
      <col className="w-[6%]" />
      <col className="w-[8%]" />
      <col className="w-[10%]" />
      <col className="w-[13%]" />
    </colgroup>
  );

  const renderTableHeader = () => (
    <thead>
      <tr className="border-b border-zinc-800">
        <th className="py-3 px-3">
          <input
            type="checkbox"
            className="rounded border-zinc-600 bg-zinc-800"
            onChange={(e) => handleSelectAllFiltered(e.target.checked)}
          />
        </th>
        <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('name')}</th>
        <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('image')}</th>
        <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('status')}</th>
        <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('ports')}</th>
        <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('cpu')}</th>
        <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('memory')}</th>
        <th className="text-left py-3 px-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('group')}</th>
        <th className="text-right py-3 px-4 text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('actions')}</th>
      </tr>
    </thead>
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="sticky -top-6 z-40 -mx-6 -mt-6 mb-4 border-b border-zinc-800 bg-zinc-950 px-6 pb-4 pt-10 shadow-lg shadow-black/20">
        <header className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{t('containers')}</h2>
              <p className="text-zinc-400 text-sm mt-1">{containers.length} {t('containers')}</p>
            </div>
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isContainersLoading}
              className="btn-secondary text-xs"
              title={t('refresh')}
            >
              <RefreshCw size={14} className={`mr-1 ${isContainersLoading ? 'animate-spin' : ''}`} />
              {isContainersLoading ? t('refreshing') : t('refresh')}
            </button>
          </div>
        </header>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              className="input pl-9"
              placeholder={t('searchContainers')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="input w-44 text-xs"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            title={t('filterByGroup')}
          >
            <option value="all">{t('allGroups')}</option>
            {groupOptions.map((group) => (
              <option key={group} value={group}>
                {group === '__ungrouped__' ? t('ungrouped') : group}
              </option>
            ))}
          </select>

          <select
            className="input w-40 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title={t('filterByStatus')}
          >
            <option value="all">{t('allStatuses')}</option>
            <option value="running">{t('running')}</option>
            <option value="stopped">{t('stopped')}</option>
            <option value="paused">{t('paused')}</option>
          </select>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500 mr-1">{selectedIds.length} {t('selected')}</span>
              <button disabled={pendingBatchAction !== null} onClick={() => handleBatch('start')} className="btn-ghost btn-xs" title={t('start')}>
                {pendingBatchAction === 'start' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              </button>
              <button disabled={pendingBatchAction !== null} onClick={() => handleBatch('stop')} className="btn-ghost btn-xs" title={t('stop')}>
                {pendingBatchAction === 'stop' ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
              </button>
              <button disabled={pendingBatchAction !== null} onClick={() => handleBatch('restart')} className="btn-ghost btn-xs" title={t('restart')}>
                {pendingBatchAction === 'restart' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              </button>
              <button disabled={pendingBatchAction !== null} onClick={() => handleBatch('remove')} className="btn-danger btn-xs" title={t('remove')}>
                {pendingBatchAction === 'remove' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
              <button disabled={pendingBatchAction !== null} onClick={() => setShowBatchGroup((show) => !show)} className="btn-ghost btn-xs" title={t('group')}>
                {pendingBatchAction === 'group' ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
              </button>
            </div>
          )}

          {selectedIds.length > 0 && showBatchGroup && (
            <div className="flex items-center gap-2">
              <input
                className="input w-40 text-xs py-1.5"
                placeholder={t('group')}
                value={batchGroupValue}
                onChange={(e) => setBatchGroupValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveBatchGroup()}
                autoFocus
              />
              <button
                disabled={pendingBatchAction !== null}
                onClick={saveBatchGroup}
                className="btn-secondary btn-xs"
              >
                {pendingBatchAction === 'group' ? <Loader2 size={14} className="animate-spin" /> : t('group')}
              </button>
            </div>
          )}
        </div>

        {isContainersLoading && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-300">
            <Loader2 size={14} className="animate-spin" />
            {t('loadingData')}
          </div>
        )}

        <div className="card mt-4 overflow-hidden rounded-b-none border-b-0">
          <table className="w-full table-fixed text-sm">
            {renderTableColGroup()}
            {renderTableHeader()}
          </table>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden rounded-t-none">
        <div>
          <table className="w-full table-fixed text-sm">
            {renderTableColGroup()}
            <tbody>
              {groupNames.map((groupName) => (
                <Fragment key={groupName}>
                  <tr key={`group-${groupName}`} className="bg-zinc-950/60 border-b border-zinc-800/70">
                    <td colSpan={9} className="px-4 py-2 text-xs font-medium text-zinc-400">
                      {groupName} <span className="text-zinc-600 font-mono">({grouped[groupName].length})</span>
                    </td>
                  </tr>
                  {grouped[groupName].map((c) => (
                    <tr
                  key={c.id}
                  className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${
                    selectedContainers.has(c.id) ? 'bg-indigo-600/5' : ''
                  }`}
                >
                  <td className="py-2.5 px-3">
                    <input
                      type="checkbox"
                      checked={selectedContainers.has(c.id)}
                      onChange={() => toggleContainerSelection(c.id)}
                      className="rounded border-zinc-600 bg-zinc-800"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-medium text-zinc-200 block truncate" title={c.name}>{c.name}</span>
                  </td>
                  <td className="py-2.5 px-3 text-zinc-400 font-mono text-xs truncate" title={c.image}>{c.image}</td>
                  <td className="py-2.5 px-3">{stateBadge(c.state)}</td>
                  <td className="py-2.5 px-3 text-zinc-500 text-xs font-mono truncate" title={displayPorts(c).join(', ')}>
                    {displayPorts(c).join(', ') || '-'}
                  </td>
                  <td className="py-2.5 px-3 text-zinc-400 font-mono text-xs">
                    {c.state === 'running' ? `${c.cpuPercent.toFixed(1)}%` : '-'}
                  </td>
                  <td className="py-2.5 px-3 text-zinc-400 font-mono text-xs">
                    {c.state === 'running' ? `${c.memPercent.toFixed(1)}%` : '-'}
                  </td>
                  <td className="py-2.5 px-3">
                    {editingGroup === c.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          className="input w-24 text-xs py-1"
                          value={groupValue}
                          disabled={savingGroupId === c.id}
                          onChange={(e) => setGroupValue(e.target.value)}
                          onBlur={() => saveGroup(c.id)}
                          onKeyDown={(e) => e.key === 'Enter' && saveGroup(c.id)}
                          autoFocus
                        />
                        {savingGroupId === c.id && <Loader2 size={14} className="animate-spin text-zinc-400" />}
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingGroup(c.id); setGroupValue(c.group || ''); }}
                        className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer max-w-full truncate inline-flex items-center gap-1"
                        title={c.group || t('ungrouped')}
                      >
                        {c.group || <><FolderOpen size={14} /> {t('ungrouped')}</>}
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="relative flex items-center justify-end gap-1">
                      {c.state === 'running' && (
                        <>
                          <button
                            onClick={() => handleSingleAction('stop', c.id)}
                            className="btn-ghost btn-xs text-amber-400 hover:text-amber-300"
                            title={t('stop')}
                            disabled={pendingActions.has(`stop:${c.id}`)}
                          >
                            <ActionIcon action="stop" id={c.id} icon={<Square size={14} />} />
                          </button>
                          <button
                            onClick={() => handleSingleAction('restart', c.id)}
                            className="btn-ghost btn-xs"
                            title={t('restart')}
                            disabled={pendingActions.has(`restart:${c.id}`)}
                          >
                            <ActionIcon action="restart" id={c.id} icon={<RotateCcw size={14} />} />
                          </button>
                          <button
                            onClick={() => setLogContainer(c.id, c.name)}
                            className="btn-ghost btn-xs text-cyan-400"
                            title={t('logs')}
                          >
                            <ScrollText size={14} />
                          </button>
                          <button
                            onClick={() => setTerminalContainer(c.id, c.name)}
                            className="btn-ghost btn-xs text-purple-400"
                            title={t('terminal')}
                          >
                            <Terminal size={14} />
                          </button>
                        </>
                      )}
                      {c.state !== 'running' && (
                        <button
                          onClick={() => handleSingleAction('start', c.id)}
                          className="btn-ghost btn-xs text-green-400 hover:text-green-300"
                          title={t('start')}
                          disabled={pendingActions.has(`start:${c.id}`)}
                        >
                          <ActionIcon action="start" id={c.id} icon={<Play size={14} />} />
                        </button>
                      )}
                      {c.urls && c.urls.length > 0 && (
                        <div className="relative">
                          <button
                            onClick={() => {
                              setOpenUrlMenu(openUrlMenu === c.id ? null : c.id);
                            }}
                            className="btn-ghost btn-xs text-indigo-400"
                            title={c.urls.length === 1 ? c.urls[0] : `${c.urls.length} URLs`}
                          >
                            <ExternalLink size={14} />
                            {c.urls.length > 1 && <span className="text-[10px] leading-none">{c.urls.length}</span>}
                          </button>
                          {openUrlMenu === c.id && (
                            <div className="absolute right-0 top-full mt-1 z-20 w-72 rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
                              {c.urls.map((url) => (
                                <div
                                  key={url}
                                  className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-zinc-800"
                                >
                                  <button
                                    onClick={() => openExternalUrl(url)}
                                    className="min-w-0 flex-1 truncate px-1 py-1 text-left text-xs text-zinc-300"
                                    title={url}
                                  >
                                    {url}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingUrl(c.id);
                                      setEditingOriginalUrl(url);
                                      setUrlValue(url);
                                      setOpenUrlMenu(null);
                                    }}
                                    className="btn-ghost btn-xs text-zinc-400"
                                    title={t('editUrl')}
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    onClick={() => deleteUrl(c.id, c.urls, url)}
                                    className="btn-ghost btn-xs text-red-400"
                                    title={t('deleteUrl')}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => { setEditingUrl(c.id); setEditingOriginalUrl(null); setUrlValue(''); }}
                        className="btn-ghost btn-xs text-zinc-600 hover:text-zinc-400"
                        title={t('addUrl')}
                      >
                        +
                      </button>
                      {editingUrl === c.id && (
                        <div className="absolute right-0 top-full mt-1 z-10 bg-zinc-800 border border-zinc-700 rounded-lg p-2 shadow-xl">
                          <input
                            className="input text-xs py-1 w-48"
                            placeholder="https://..."
                            value={urlValue}
                            onChange={(e) => setUrlValue(e.target.value)}
                            onBlur={() => { saveUrl(c.id, c.urls); }}
                            onKeyDown={(e) => e.key === 'Enter' && saveUrl(c.id, c.urls)}
                            autoFocus
                          />
                          {editingOriginalUrl && (
                            <button
                              className="mt-2 w-full btn-danger btn-xs justify-center"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => deleteUrl(c.id, c.urls, editingOriginalUrl)}
                            >
                              {t('remove')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-zinc-500 text-sm">
              {isContainersLoading ? t('loadingData') : t('noContainers')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function containerActionLabel(action: string, t: (key: Parameters<typeof translate>[1]) => string): string {
  switch (action) {
    case 'start':
      return t('start');
    case 'stop':
      return t('stop');
    case 'restart':
      return t('restart');
    case 'remove':
      return t('remove');
    default:
      return action;
  }
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}
