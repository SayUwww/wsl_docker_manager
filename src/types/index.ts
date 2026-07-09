export interface DockerInfo {
  dockerVersion: string;
  os: string;
  kernelVersion: string;
  containers: number;
  containersRunning: number;
  containersPaused: number;
  containersStopped: number;
  images: number;
  memoryLimit: boolean;
  swapLimit: boolean;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  imageId: string;
  command: string;
  created: string;
  state: string;
  status: string;
  ports: { ip?: string; privatePort: number; publicPort?: number; type: string }[];
  sizeRootFs?: number;
  sizeRw?: number;
  cpuPercent: number;
  memPercent: number;
  memUsage: string;
  memLimit: string;
  networkSettings?: Record<string, unknown>;
  mounts?: { source: string; destination: string; mode: string }[];
  labels?: Record<string, string>;
  group?: string;
  urls?: string[];
}

export interface ImageInfo {
  id: string;
  parentId: string;
  repoDigests: string[];
  repoTags: string[];
  created: string;
  size: number;
  sharedSize: number;
  virtualSize: number;
  containers: number;
  dangling: boolean;
}

export interface NetworkInfo {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal: boolean;
  containers: { id: string; name: string; ipv4: string; ipv6: string }[];
  labels?: Record<string, string>;
}

export interface VolumeInfo {
  name: string;
  driver: string;
  mountpoint: string;
  scope: string;
  size?: string;
  refCount: number;
  orphan: boolean;
  containers: string[];
}

export interface ResourceStats {
  cpuPercent: number;
  memUsed: number;
  memTotal: number;
  memPercent: number;
  diskUsed: number;
  diskTotal: number;
}

export type ConnectionMode = 'wsl' | 'direct' | 'remote';
export type Language = 'system' | 'zh' | 'ja' | 'en';
export type RefreshIntervalMs = 10000 | 30000 | 60000;

export interface ExecutionLog {
  id: string;
  time: string;
  command: string;
  displayCommand?: string;
  status: 'ok' | 'error';
  durationMs: number;
  args?: Record<string, unknown>;
  message?: string;
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

export type ThemeMode = 'dark' | 'light';
export type CloseBehavior = 'minimize' | 'exit';
export type RemoteAuthType = 'password' | 'privateKey';

export interface RemoteProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: RemoteAuthType;
  password?: string | null;
  privateKeyPath?: string | null;
  passphrase?: string | null;
  dockerSocket?: string | null;
}

export interface RemoteConfig {
  selectedProfileId: string | null;
  profiles: RemoteProfile[];
}

export interface ConfirmationRequest {
  id: string;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
}

export interface LogEntry {
  timestamp: string;
  stream: string;
  message: string;
}

export type DockerStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export type TrayStatus = 'normal' | 'warning' | 'error';

export type SidebarTab = 'dashboard' | 'containers' | 'images' | 'networks' | 'volumes';
