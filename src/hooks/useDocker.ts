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
  const setCommandLoading = useAppStore((s) => s.setCommandLoading);
  const refreshIntervalMs = useAppStore((s) => s.refreshIntervalMs);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runInvoke = useCallback(async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
    const started = performance.now();
    setCommandLoading(command, true);
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
    } finally {
      setCommandLoading(command, false);
    }
  }, [addExecutionLog, setCommandLoading]);

  const refreshConnectionMode = useCallback(async () => {
    try {
      const persistedMode = useAppStore.getState().connectionMode;
      const result = await runInvoke<{ mode: ConnectionMode }>('set_connection_mode', { mode: persistedMode });
      setConnectionModeStore(result.mode);
    } catch {
      // status polling will surface connection problems
    }
  }, [runInvoke, setConnectionModeStore]);

  const refreshDockerStatus = useCallback(async (): Promise<boolean> => {
    if (useAppStore.getState().commandLoading.get_docker_status) return false;
    try {
      const result = await runInvoke<{ connected: boolean; info: DockerInfo | null }>('get_docker_status');
      setDockerStatus(result.connected ? 'connected' : 'disconnected');
      setDockerInfo(result.info ?? null);
      return true;
    } catch {
      setDockerStatus('error');
      return false;
    }
  }, [runInvoke, setDockerStatus, setDockerInfo]);

  const refreshResourceStats = useCallback(async (): Promise<boolean> => {
    if (useAppStore.getState().commandLoading.get_resource_stats) return false;
    try {
      const stats = await runInvoke<ResourceStats>('get_resource_stats');
      setResourceStats(stats);
      return true;
    } catch {
      return false;
    }
  }, [runInvoke, setResourceStats]);

  const refreshContainers = useCallback(async (all: boolean): Promise<boolean> => {
    if (useAppStore.getState().commandLoading.list_containers) return false;
    try {
      const containers = await runInvoke<ContainerInfo[]>('list_containers', { all });
      setContainers(containers);
      return true;
    } catch {
      return false;
    }
  }, [runInvoke, setContainers]);

  const refreshImages = useCallback(async (): Promise<boolean> => {
    if (useAppStore.getState().commandLoading.list_images) return false;
    try {
      const images = await runInvoke<ImageInfo[]>('list_images');
      setImages(images);
      return true;
    } catch {
      return false;
    }
  }, [runInvoke, setImages]);

  const refreshNetworks = useCallback(async (): Promise<boolean> => {
    if (useAppStore.getState().commandLoading.list_networks) return false;
    try {
      const networks = await runInvoke<NetworkInfo[]>('list_networks');
      setNetworks(networks);
      return true;
    } catch {
      return false;
    }
  }, [runInvoke, setNetworks]);

  const refreshVolumes = useCallback(async (): Promise<boolean> => {
    if (useAppStore.getState().commandLoading.list_volumes) return false;
    try {
      const volumes = await runInvoke<VolumeInfo[]>('list_volumes', { containerIds: [] });
      setVolumes(volumes);
      return true;
    } catch {
      return false;
    }
  }, [runInvoke, setVolumes]);

  const setConnectionMode = useCallback(async (mode: ConnectionMode) => {
    const result = await runInvoke<{ mode: ConnectionMode }>('set_connection_mode', { mode });
    setConnectionModeStore(result.mode);
    await Promise.all([
      refreshDockerStatus(),
      refreshResourceStats(),
      refreshContainers(true),
      refreshImages(),
      refreshNetworks(),
      refreshVolumes(),
    ]);
  }, [runInvoke, setConnectionModeStore, refreshDockerStatus, refreshResourceStats, refreshContainers, refreshImages, refreshNetworks, refreshVolumes]);

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
