import { Fragment, useCallback, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store';
import { ImageInfo } from '../../types';
import { translate } from '../../i18n';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  HardDrive,
  Layers,
  Loader2,
  RefreshCw,
  Tag,
  Trash2,
} from 'lucide-react';

function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return `${size.toFixed(1)} ${units[idx]}`;
}

function formatDate(ts: string): string {
  const numeric = Number(ts);
  const d = Number.isFinite(numeric) ? new Date(numeric * 1000) : new Date(ts);
  if (Number.isNaN(d.getTime())) return ts || '-';
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ImageList() {
  const images = useAppStore((s) => s.images);
  const setImages = useAppStore((s) => s.setImages);
  const language = useAppStore((s) => s.language);
  const addToast = useAppStore((s) => s.addToast);
  const requestConfirmation = useAppStore((s) => s.requestConfirmation);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pruning, setPruning] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [batchRemoving, setBatchRemoving] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [collapsedImageIds, setCollapsedImageIds] = useState<Set<string>>(new Set());
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  const totalSize = images.reduce((sum, img) => sum + img.size, 0);
  const danglingCount = images.filter((i) => i.dangling).length;
  const totalImages = images.length;
  const imageById = new Map(images.map((img) => [normalizeImageId(img.id), img]));
  const childrenByParent = images.reduce<Map<string, ImageInfo[]>>((acc, img) => {
    const parentKey = normalizeImageId(img.parentId);
    if (parentKey && imageById.has(parentKey)) {
      const children = acc.get(parentKey) || [];
      children.push(img);
      acc.set(parentKey, children);
    }
    return acc;
  }, new Map());
  const rootImages = images.filter((img) => {
    const parentKey = normalizeImageId(img.parentId);
    return !parentKey || !imageById.has(parentKey);
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCollapse = (id: string) => {
    const key = normalizeImageId(id);
    setCollapsedImageIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleManualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      const updated = await invoke<ImageInfo[]>('list_images');
      setImages(updated);
      addToast({ type: 'success', title: t('refreshCompleted'), message: t('images') });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: t('refreshFailed'), message: String(e) });
    } finally {
      setManualRefreshing(false);
    }
  }, [addToast, setImages, t]);

  const getDeleteOrder = useCallback((id: string): ImageInfo[] => {
    const visit = (currentId: string, visited: Set<string>): ImageInfo[] => {
      const key = normalizeImageId(currentId);
      if (!key || visited.has(key)) return [];
      visited.add(key);

      const current = imageById.get(key);
      if (!current) return [];

      const descendants = (childrenByParent.get(key) || []).flatMap((child) => visit(child.id, visited));
      return [...descendants, current];
    };

    return visit(id, new Set());
  }, [childrenByParent, imageById]);

  const handleRemove = useCallback(async (id: string) => {
    const deleteOrder = getDeleteOrder(id);
    const deleteIds = deleteOrder.map((img) => img.id);
    const confirmed = await requestConfirmation({
      title: t('deleteImageTitle'),
      message: deleteOrder.length > 1
        ? `${t('delete')} ${deleteOrder.length} ${t('images')} (${t('includingChildImages')}). ${t('cannotBeUndone')}`
        : `${t('delete')} ${shortImageId(id)}. ${t('cannotBeUndone')}`,
      confirmText: t('delete'),
      variant: 'danger',
    });
    if (!confirmed) return;

    setRemovingIds((prev) => new Set([...prev, ...deleteIds]));
    try {
      const errors: string[] = [];
      for (const image of deleteOrder) {
        try {
          await invoke('remove_image', { id: image.id, force: false });
        } catch (e) {
          console.error(e);
          errors.push(`${shortImageId(image.id)}: ${formatImageError(e, t)}`);
          break;
        }
      }
      const updated = await invoke<ImageInfo[]>('list_images');
      setImages(updated);
      if (errors.length > 0) {
        addToast({ type: 'error', title: t('removeImageFailed'), message: errors.join('; ') });
      } else {
        addToast({ type: 'success', title: t('imageRemoved') });
      }
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: t('removeImageFailed'), message: formatImageError(e, t) });
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        deleteIds.forEach((deleteId) => next.delete(deleteId));
        return next;
      });
    }
  }, [addToast, getDeleteOrder, requestConfirmation, setImages, t]);

  const handlePrune = useCallback(async () => {
    const confirmed = await requestConfirmation({
      title: t('pruneDanglingImagesTitle'),
      message: `${t('pruneDangling')}. ${t('cannotBeUndone')}`,
      confirmText: t('pruneDangling'),
      variant: 'danger',
    });
    if (!confirmed) return;

    setPruning(true);
    try {
      await invoke<string>('prune_images');
      const updated = await invoke<ImageInfo[]>('list_images');
      setImages(updated);
      addToast({ type: 'success', title: t('danglingImagesPruned') });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: t('pruneImagesFailed'), message: String(e) });
    } finally {
      setPruning(false);
    }
  }, [addToast, requestConfirmation, setImages, t]);

  const handleBatchRemove = useCallback(async () => {
    const deleteOrder = selectedIds.size > 0
      ? Array.from(selectedIds).flatMap((id) => getDeleteOrder(id))
      : [];
    const dedupedDeleteOrder = dedupeImages(deleteOrder);
    const deleteIds = dedupedDeleteOrder.map((img) => img.id);
    const confirmed = await requestConfirmation({
      title: t('deleteSelectedImagesTitle'),
      message: `${t('forceDelete')} ${dedupedDeleteOrder.length} ${t('images')} (${t('includingKnownChildImages')}). ${t('cannotBeUndone')}`,
      confirmText: t('delete'),
      variant: 'danger',
    });
    if (!confirmed) return;

    setBatchRemoving(true);
    setRemovingIds((prev) => new Set([...prev, ...deleteIds]));
    try {
      const errors: string[] = [];
      for (const image of dedupedDeleteOrder) {
        try {
          await invoke('remove_image', { id: image.id, force: true });
        } catch (e) {
          console.error(e);
          errors.push(`${shortImageId(image.id)}: ${formatImageError(e, t)}`);
        }
      }
      setSelectedIds(new Set());
      const updated = await invoke<ImageInfo[]>('list_images');
      setImages(updated);
      if (errors.length > 0) {
        addToast({ type: 'error', title: t('removeImageFailed'), message: errors.join('; ') });
      } else {
        addToast({ type: 'success', title: t('imagesRemoved'), message: `${dedupedDeleteOrder.length} ${t('images')}` });
      }
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: t('refreshImagesFailed'), message: String(e) });
    } finally {
      setBatchRemoving(false);
      setRemovingIds((prev) => {
        const next = new Set(prev);
        deleteIds.forEach((deleteId) => next.delete(deleteId));
        return next;
      });
    }
  }, [addToast, getDeleteOrder, requestConfirmation, selectedIds, setImages, t]);

  const renderImageRows = (img: ImageInfo, depth = 0, visited = new Set<string>()): ReactNode[] => {
    const imageKey = normalizeImageId(img.id);
    if (visited.has(imageKey)) return [];

    const nextVisited = new Set(visited).add(imageKey);
    const children = childrenByParent.get(imageKey) || [];
    const collapsed = collapsedImageIds.has(imageKey);
    const parentKey = normalizeImageId(img.parentId);
    const missingParent = depth === 0 && parentKey && !imageById.has(parentKey);
    const rows: ReactNode[] = [
      <tr key={img.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
        <td className="py-2.5 px-4">
          <input
            type="checkbox"
            checked={selectedIds.has(img.id)}
            onChange={() => toggleSelect(img.id)}
            className="rounded border-zinc-600 bg-zinc-800"
          />
        </td>
        <td className="py-2.5 px-3">
          <div className="flex min-w-0 items-start gap-2" style={{ paddingLeft: depth * 18 }}>
            {children.length > 0 ? (
              <button
                type="button"
                onClick={() => toggleCollapse(img.id)}
                className="mt-0.5 rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                title={collapsed ? t('expandChildImages') : t('collapseChildImages')}
              >
                {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
            ) : (
              <span className="w-[18px] shrink-0" />
            )}
            <div className="min-w-0">
              {depth > 0 && <span className="mr-2 text-zinc-600">-</span>}
              {img.repoTags.length > 0 ? (
                img.repoTags.map((tag) => (
                  <span key={tag} className="block truncate font-mono text-xs text-zinc-200" title={tag}>{tag}</span>
                ))
              ) : (
                <span className="text-xs text-amber-400">&lt;none&gt;:&lt;none&gt;</span>
              )}
              <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500">
                {children.length > 0 && <span>{children.length} {children.length > 1 ? t('childImages') : t('childImage')}</span>}
                {missingParent && <span>{t('parent')} {shortImageId(img.parentId)}</span>}
              </div>
            </div>
          </div>
        </td>
        <td className="py-2.5 px-3">
          <span className="font-mono text-xs text-zinc-500">
            {shortImageId(img.id)}
          </span>
        </td>
        <td className="py-2.5 px-3 text-xs text-zinc-500">
          <div className="flex items-center gap-1">
            <Clock size={12} />
            {formatDate(img.created)}
          </div>
        </td>
        <td className="py-2.5 px-3 font-mono text-xs text-zinc-400">{formatSize(img.size)}</td>
        <td className="py-2.5 px-3 text-xs text-zinc-400">{img.containers}</td>
        <td className="py-2.5 px-4">
          <div className="flex justify-end">
            <button
              onClick={() => handleRemove(img.id)}
              disabled={removingIds.has(img.id)}
              className="btn-danger btn-xs"
              title={children.length > 0 ? t('deleteThisImageAndChildren') : t('remove')}
            >
              {removingIds.has(img.id) ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </div>
        </td>
      </tr>,
    ];

    if (!collapsed) {
      for (const child of children) {
        rows.push(...renderImageRows(child, depth + 1, nextVisited));
      }
    }

    return rows;
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <header className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{t('images')}</h2>
              <p className="mt-1 text-sm text-zinc-400">{totalImages} {t('images')} &middot; {formatSize(totalSize)} {t('total')}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={manualRefreshing}
                className="btn-secondary text-xs"
                title={t('refresh')}
              >
                <RefreshCw size={14} className={`mr-1 ${manualRefreshing ? 'animate-spin' : ''}`} />
                {manualRefreshing ? t('refreshing') : t('refresh')}
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
                {pruning ? t('pruning') : `${t('pruneDangling')} (${danglingCount})`}
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="card p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
              <Layers size={14} />
              {t('totalImages')}
            </div>
            <div className="text-2xl font-bold">{totalImages}</div>
          </div>
          <div className="card p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
              <HardDrive size={14} />
              {t('totalSize')}
            </div>
            <div className="text-2xl font-bold">{formatSize(totalSize)}</div>
          </div>
          <div className="card p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
              <AlertTriangle size={14} />
              {t('dangling')}
            </div>
            <div className="text-2xl font-bold text-amber-400">{danglingCount}</div>
          </div>
          <div className="card p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
              <Tag size={14} />
              {t('usedByContainers')}
            </div>
            <div className="text-2xl font-bold">{images.reduce((s, i) => s + i.containers, 0)}</div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    className="rounded border-zinc-600 bg-zinc-800"
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(new Set(images.filter((i) => i.dangling).map((i) => i.id)));
                      else setSelectedIds(new Set());
                    }}
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-zinc-400">{t('repositoryTag')}</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-zinc-400">{t('imageId')}</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-zinc-400">{t('created')}</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-zinc-400">{t('size')}</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-zinc-400">{t('containers')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-zinc-400">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rootImages.map((img) => (
                <Fragment key={img.id}>{renderImageRows(img)}</Fragment>
              ))}
            </tbody>
          </table>
          {images.length === 0 && (
            <div className="py-16 text-center text-sm text-zinc-500">{t('noImages')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function dedupeImages(images: ImageInfo[]): ImageInfo[] {
  const seen = new Set<string>();
  return images.filter((img) => {
    const key = normalizeImageId(img.id);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatImageError(error: unknown, t: (key: Parameters<typeof translate>[1]) => string): string {
  const message = String(error);
  const containerRefs = extractContainerRefs(message);
  if (message.includes('dependent child images')) {
    return t('dependentChildImagesError');
  }
  if (message.includes('image is being used') || message.includes('must be forced')) {
    return `${t('imageUsedByContainerError')}${containerRefs}`;
  }
  return `${t('removeImageFailed')}: ${message}`;
}

function extractContainerRefs(message: string): string {
  const marker = ' Used by container(s):';
  const index = message.indexOf(marker);
  return index >= 0 ? message.slice(index) : '';
}

function normalizeImageId(id: string | undefined): string {
  return (id || '').replace(/^sha256:/, '');
}

function shortImageId(id: string): string {
  const normalized = normalizeImageId(id);
  return normalized ? normalized.slice(0, 12) : '-';
}
