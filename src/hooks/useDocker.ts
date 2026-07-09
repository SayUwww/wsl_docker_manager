import { useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import { ConnectionMode, DockerInfo, ResourceStats, ContainerInfo, ImageInfo, NetworkInfo, VolumeInfo } from '../types';
import { describeDockerCommand } from '../utils/executionLog';

export function useDocker() {
  const setDockerStatus = useAppStore((s) => s.setDockerStatus);
  const setDockerInfo = useAppStore((s) => s.setDockerInfo);
  const setConnectionModeStore = useAppStore((s) => s.setConnectionMode);
  const setResourceStats = useAppStore((s) => s.setResourceStats);
  const setContainers = useAppStore((s) => s.setContainers);
  const setImages = useAppStore((s) => s.setImages);
  const setNetworks = useAppStore((s) => s.setNetworks);
  const setVolumes = useAppStore((s) => s.setVolumes);
  const addExecutionLog = useAppStore((s) => s.addExecutionLog);
  const refreshIntervalMs = useAppStore((s) => s.refreshIntervalMs);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runInvoke = useCallback(async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
    const started = performance.now();
    try {
      const result = await invoke<T>(command, args);
      addExecutionLog({
        command,
        displayCommand: describeDockerCommand(command, args),
        args,
        status: 'ok',
        durationMs: Math.round(performance.now() - started),
      });
      return result;
    } catch (error) {
      addExecutionLog({
        command,
        displayCommand: describeDockerCommand(command, args),
        args,
        status: 'error',
        durationMs: Math.round(performance.now() - started),
        message: String(error),
      });
      throw error;
    }
  }, [addExecutionLog]);

  const refreshConnectionMode = useCallback(async () => {
    try {
      const persistedMode = useAppStore.getState().connectionMode;
      const result = await runInvoke<{ mode: ConnectionMode }>('set_connection_mode', { mode: persistedMode });
      setConnectionModeStore(result.mode);
    } catch {
      // status polling will surface connection problems
    }
  }, [runInvoke, setConnectionModeStore]);

  const refreshDockerStatus = useCallback(async () => {
    try {
      const result = await runInvoke<{ connected: boolean; info: DockerInfo | null }>('get_docker_status');
      setDockerStatus(result.connected ? 'connected' : 'disconnected');
      setDockerInfo(result.info ?? null);
    } catch {
      setDockerStatus('error');
    }
  }, [runInvoke, setDockerStatus, setDockerInfo]);

  const refreshResourceStats = useCallback(async () => {
    try {
      const stats = await runInvoke<ResourceStats>('get_resource_stats');
      setResourceStats(stats);
    } catch {
      // silently ignore
    }
  }, [runInvoke, setResourceStats]);

  const refreshContainers = useCallback(async (all: boolean) => {
    try {
      const containers = await runInvoke<ContainerInfo[]>('list_containers', { all });
      setContainers(containers);
    } catch {
      // silently ignore
    }
  }, [runInvoke, setContainers]);

  const setConnectionMode = useCallback(async (mode: ConnectionMode) => {
    const result = await runInvoke<{ mode: ConnectionMode }>('set_connection_mode', { mode });
    setConnectionModeStore(result.mode);
    await refreshDockerStatus();
    await refreshContainers(true);
  }, [runInvoke, setConnectionModeStore, refreshDockerStatus, refreshContainers]);

  const refreshImages = useCallback(async () => {
    try {
      const images = await runInvoke<ImageInfo[]>('list_images');
      setImages(images);
    } catch {
      // silently ignore
    }
  }, [runInvoke, setImages]);

  const refreshNetworks = useCallback(async () => {
    try {
      const networks = await runInvoke<NetworkInfo[]>('list_networks');
      setNetworks(networks);
    } catch {
      // silently ignore
    }
  }, [runInvoke, setNetworks]);

  const refreshVolumes = useCallback(async () => {
    try {
      const volumes = await runInvoke<VolumeInfo[]>('list_volumes', { containerIds: [] });
      setVolumes(volumes);
    } catch {
      // silently ignore
    }
  }, [runInvoke, setVolumes]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    refreshConnectionMode();
    refreshDockerStatus();
    refreshResourceStats();
    refreshContainers(true);
    refreshImages();
    refreshNetworks();
    refreshVolumes();

    intervalRef.current = setInterval(() => {
      refreshDockerStatus();
      refreshResourceStats();
    }, refreshIntervalMs);
  }, [refreshConnectionMode, refreshDockerStatus, refreshResourceStats, refreshContainers, refreshImages, refreshNetworks, refreshVolumes, refreshIntervalMs]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return {
    refreshDockerStatus,
    refreshResourceStats,
    refreshContainers,
    refreshImages,
    refreshNetworks,
    refreshVolumes,
    refreshConnectionMode,
    setConnectionMode,
    startPolling,
    stopPolling,
  };
}
