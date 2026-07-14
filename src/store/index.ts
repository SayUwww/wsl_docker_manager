import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CloseBehavior, ConnectionMode, ConfirmationRequest, DockerInfo, DockerStatus, ExecutionLog, Language, RefreshIntervalMs, ResourceStats, ContainerInfo, ImageInfo, NetworkInfo, RemoteConfig, VolumeInfo, SidebarTab, ThemeMode, ToastMessage, ToastType } from '../types';

let confirmationResolver: ((confirmed: boolean) => void) | null = null;

interface AppState {
  // Docker connection
  dockerStatus: DockerStatus;
  dockerInfo: DockerInfo | null;
  setDockerStatus: (status: DockerStatus) => void;
  setDockerInfo: (info: DockerInfo | null) => void;
  connectionMode: ConnectionMode;
  setConnectionMode: (mode: ConnectionMode) => void;

  // Resources
  resourceStats: ResourceStats | null;
  setResourceStats: (stats: ResourceStats) => void;

  // Containers
  containers: ContainerInfo[];
  setContainers: (containers: ContainerInfo[]) => void;
  selectedContainers: Set<string>;
  toggleContainerSelection: (id: string) => void;
  selectAllContainers: (ids: string[]) => void;
  clearContainerSelection: () => void;
  containerSearchTerm: string;
  setContainerSearchTerm: (term: string) => void;
  containerGroupFilter: string;
  setContainerGroupFilter: (group: string) => void;
  containerStatusFilter: string;
  setContainerStatusFilter: (status: string) => void;

  // Images
  images: ImageInfo[];
  setImages: (images: ImageInfo[]) => void;

  // Networks
  networks: NetworkInfo[];
  setNetworks: (networks: NetworkInfo[]) => void;

  // Volumes
  volumes: VolumeInfo[];
  setVolumes: (volumes: VolumeInfo[]) => void;

  // UI
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  globalLoadingMessage: string | null;
  setGlobalLoading: (message: string | null) => void;
  commandLoading: Record<string, boolean>;
  setCommandLoading: (command: string, loading: boolean) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  refreshIntervalMs: RefreshIntervalMs;
  setRefreshIntervalMs: (interval: RefreshIntervalMs) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  closeBehavior: CloseBehavior | null;
  setCloseBehavior: (behavior: CloseBehavior | null) => void;
  remoteConfig: RemoteConfig;
  setRemoteConfig: (config: RemoteConfig) => void;
  executionLogs: ExecutionLog[];
  addExecutionLog: (log: Omit<ExecutionLog, 'id' | 'time'>) => void;
  clearExecutionLogs: () => void;
  toasts: ToastMessage[];
  addToast: (toast: { type: ToastType; title: string; message?: string }) => void;
  removeToast: (id: string) => void;
  confirmation: ConfirmationRequest | null;
  requestConfirmation: (request: Omit<ConfirmationRequest, 'id'>) => Promise<boolean>;
  resolveConfirmation: (confirmed: boolean) => void;

  // Log viewer
  logContainerId: string | null;
  logContainerName: string | null;
  setLogContainer: (id: string | null, name: string | null) => void;

  // Terminal
  terminalContainerId: string | null;
  terminalContainerName: string | null;
  setTerminalContainer: (id: string | null, name: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
  dockerStatus: 'disconnected',
  dockerInfo: null,
  setDockerStatus: (status) => set({ dockerStatus: status }),
  setDockerInfo: (info) => set({ dockerInfo: info }),
  connectionMode: 'wsl',
  setConnectionMode: (mode) => set({ connectionMode: mode }),

  resourceStats: null,
  setResourceStats: (stats) => set({ resourceStats: stats }),

  containers: [],
  setContainers: (containers) => set({ containers }),
  selectedContainers: new Set(),
  toggleContainerSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedContainers);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedContainers: next };
    }),
  selectAllContainers: (ids) => set({ selectedContainers: new Set(ids) }),
  clearContainerSelection: () => set({ selectedContainers: new Set() }),
  containerSearchTerm: '',
  setContainerSearchTerm: (term) => set({ containerSearchTerm: term }),
  containerGroupFilter: 'all',
  setContainerGroupFilter: (group) => set({ containerGroupFilter: group }),
  containerStatusFilter: 'all',
  setContainerStatusFilter: (status) => set({ containerStatusFilter: status }),

  images: [],
  setImages: (images) => set({ images }),

  networks: [],
  setNetworks: (networks) => set({ networks }),

  volumes: [],
  setVolumes: (volumes) => set({ volumes }),

  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  globalLoadingMessage: null,
  setGlobalLoading: (message) => set({ globalLoadingMessage: message }),
  commandLoading: {},
  setCommandLoading: (command, loading) =>
    set((state) => ({
      commandLoading: {
        ...state.commandLoading,
        [command]: loading,
      },
    })),
  language: 'system',
  setLanguage: (language) => set({ language }),
  refreshIntervalMs: 10000,
  setRefreshIntervalMs: (interval) => set({ refreshIntervalMs: interval }),
  themeMode: 'dark',
  setThemeMode: (mode) => set({ themeMode: mode }),
  closeBehavior: null,
  setCloseBehavior: (behavior) => set({ closeBehavior: behavior }),
  remoteConfig: { selectedProfileId: null, profiles: [] },
  setRemoteConfig: (config) => set({ remoteConfig: config }),
  executionLogs: [],
  addExecutionLog: (log) =>
    set((state) => ({
      executionLogs: [
        {
          ...log,
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        },
        ...state.executionLogs,
      ].slice(0, 80),
    })),
  clearExecutionLogs: () => set({ executionLogs: [] }),
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          ...toast,
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        },
      ].slice(-5),
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  confirmation: null,
  requestConfirmation: (request) =>
    new Promise((resolve) => {
      confirmationResolver?.(false);
      confirmationResolver = resolve;
      set({
        confirmation: {
          ...request,
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        },
      });
    }),
  resolveConfirmation: (confirmed) => {
    confirmationResolver?.(confirmed);
    confirmationResolver = null;
    set({ confirmation: null });
  },

  logContainerId: null,
  logContainerName: null,
  setLogContainer: (id, name) => set({ logContainerId: id, logContainerName: name }),

  terminalContainerId: null,
  terminalContainerName: null,
  setTerminalContainer: (id, name) => set({ terminalContainerId: id, terminalContainerName: name }),
}),
    {
      name: 'wsl-docker-manager-preferences',
      partialize: (state) => ({
        connectionMode: state.connectionMode,
        language: state.language,
        refreshIntervalMs: state.refreshIntervalMs,
        themeMode: state.themeMode,
        closeBehavior: state.closeBehavior,
      }),
    },
  ),
);
