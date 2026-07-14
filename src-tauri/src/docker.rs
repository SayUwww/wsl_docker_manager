use bollard::container::{ListContainersOptions, LogsOptions, StatsOptions};
use bollard::exec::{CreateExecOptions, StartExecResults};
use bollard::image::ListImagesOptions;
use bollard::network::{InspectNetworkOptions, ListNetworksOptions};
use bollard::secret::SystemInfo;
use bollard::volume::ListVolumesOptions;
use bollard::Docker;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use sysinfo::{Disks, System};
use tauri::{ipc::Channel, AppHandle, Manager, State};
use tokio::sync::Mutex as AsyncMutex;

#[derive(Clone, Serialize, Deserialize)]
pub struct ContainerMeta {
    pub group: Option<String>,
    pub urls: Option<Vec<String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputEvent {
    pub stream: String,
    pub data: String,
}

pub fn emit_terminal_output(channel: &Channel<TerminalOutputEvent>, stream: &str, data: String) {
    let _ = channel.send(TerminalOutputEvent {
        stream: stream.to_string(),
        data,
    });
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RemoteProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: RemoteAuthType,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub docker_socket: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RemoteAuthType {
    Password,
    PrivateKey,
}

impl Default for RemoteAuthType {
    fn default() -> Self {
        Self::PrivateKey
    }
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConfig {
    pub selected_profile_id: Option<String>,
    pub profiles: Vec<RemoteProfile>,
}

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionMode {
    Wsl,
    Direct,
    Remote,
}

pub struct DockerState {
    pub docker: Arc<AsyncMutex<Option<Docker>>>,
    pub connected: Arc<AsyncMutex<bool>>,
    pub connection_mode: Arc<AsyncMutex<ConnectionMode>>,
    pub container_meta: Arc<AsyncMutex<HashMap<String, ContainerMeta>>>,
    pub container_meta_path: Arc<AsyncMutex<Option<PathBuf>>>,
    pub remote_config: Arc<AsyncMutex<RemoteConfig>>,
    pub remote_config_path: Arc<AsyncMutex<Option<PathBuf>>>,
}

impl DockerState {
    pub fn new() -> Self {
        Self {
            docker: Arc::new(AsyncMutex::new(None)),
            connected: Arc::new(AsyncMutex::new(false)),
            connection_mode: Arc::new(AsyncMutex::new(ConnectionMode::Wsl)),
            container_meta: Arc::new(AsyncMutex::new(HashMap::new())),
            container_meta_path: Arc::new(AsyncMutex::new(None)),
            remote_config: Arc::new(AsyncMutex::new(RemoteConfig::default())),
            remote_config_path: Arc::new(AsyncMutex::new(None)),
        }
    }

    pub async fn initialize_storage(&self, app: &AppHandle) -> Result<(), String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;

        let path = dir.join("container-meta.json");
        if path.exists() {
            let data = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read container metadata: {}", e))?;
            let meta: HashMap<String, ContainerMeta> = serde_json::from_str(&data)
                .map_err(|e| format!("Failed to parse container metadata: {}", e))?;
            *self.container_meta.lock().await = meta;
        }
        *self.container_meta_path.lock().await = Some(path);

        let remote_path = dir.join("remote-profiles.json");
        if remote_path.exists() {
            let data = std::fs::read_to_string(&remote_path)
                .map_err(|e| format!("Failed to read remote profiles: {}", e))?;
            let config: RemoteConfig = serde_json::from_str(&data)
                .map_err(|e| format!("Failed to parse remote profiles: {}", e))?;
            *self.remote_config.lock().await = config;
        }
        *self.remote_config_path.lock().await = Some(remote_path);
        Ok(())
    }

    pub async fn save_container_meta(&self) -> Result<(), String> {
        let Some(path) = self.container_meta_path.lock().await.clone() else {
            return Ok(());
        };
        let meta = self.container_meta.lock().await;
        let data = serde_json::to_string_pretty(&*meta)
            .map_err(|e| format!("Failed to serialize container metadata: {}", e))?;
        std::fs::write(path, data).map_err(|e| format!("Failed to save container metadata: {}", e))
    }

    pub async fn save_remote_config(&self) -> Result<(), String> {
        let Some(path) = self.remote_config_path.lock().await.clone() else {
            return Ok(());
        };
        let config = self.remote_config.lock().await;
        let data = serde_json::to_string_pretty(&*config)
            .map_err(|e| format!("Failed to serialize remote profiles: {}", e))?;
        std::fs::write(path, data).map_err(|e| format!("Failed to save remote profiles: {}", e))
    }

    pub async fn connect(app: &AppHandle) {
        let state = app.state::<DockerState>();
        state.refresh_connection().await;
    }

    async fn try_connect() -> Option<Docker> {
        if let Ok(d) = Docker::connect_with_defaults() {
            if d.ping().await.is_ok() {
                return Some(d);
            }
        }

        if let Ok(d) =
            Docker::connect_with_http("tcp://localhost:2375", 120, bollard::API_DEFAULT_VERSION)
        {
            if d.ping().await.is_ok() {
                return Some(d);
            }
        }

        None
    }

    async fn refresh_connection(&self) -> Option<Docker> {
        let docker = Self::try_connect().await;
        let connected = docker.is_some();
        *self.connected.lock().await = connected;
        *self.docker.lock().await = docker.clone();
        docker
    }

    pub async fn get_docker(state: State<'_, DockerState>) -> Result<Docker, String> {
        if *state.connection_mode.lock().await == ConnectionMode::Wsl {
            return Err("WSL Docker mode is active".to_string());
        }

        if let Some(docker) = state.docker.lock().await.clone() {
            if docker.ping().await.is_ok() {
                *state.connected.lock().await = true;
                return Ok(docker);
            }
        }

        state
            .refresh_connection()
            .await
            .ok_or_else(|| "Docker not connected".to_string())
    }

    pub async fn connection_mode(state: &State<'_, DockerState>) -> ConnectionMode {
        *state.connection_mode.lock().await
    }

    pub async fn set_connection_mode(state: &State<'_, DockerState>, mode: ConnectionMode) {
        *state.connection_mode.lock().await = mode;
        if mode == ConnectionMode::Wsl || mode == ConnectionMode::Remote {
            *state.connected.lock().await = false;
            *state.docker.lock().await = None;
        }
    }

    pub async fn selected_remote_profile(
        state: &State<'_, DockerState>,
    ) -> Result<RemoteProfile, String> {
        let config = state.remote_config.lock().await;
        let Some(selected_id) = config.selected_profile_id.as_ref() else {
            return Err("No remote profile selected".to_string());
        };
        config
            .profiles
            .iter()
            .find(|profile| &profile.id == selected_id)
            .cloned()
            .ok_or_else(|| "Selected remote profile not found".to_string())
    }
}

pub async fn get_system_info(docker: &Docker) -> Result<SystemInfo, String> {
    docker
        .info()
        .await
        .map_err(|e| format!("Failed to get system info: {}", e))
}

pub async fn list_container_infos(
    docker: &Docker,
    all: bool,
) -> Result<Vec<bollard::secret::ContainerSummary>, String> {
    let options = ListContainersOptions {
        all,
        size: true,
        ..Default::default()
    };
    docker
        .list_containers::<String>(Some(options))
        .await
        .map_err(|e| format!("Failed to list containers: {}", e))
}

pub fn normalize_image_id(id: &str) -> &str {
    id.strip_prefix("sha256:").unwrap_or(id)
}

pub fn image_container_counts<'a>(
    image_ids: impl IntoIterator<Item = &'a str>,
) -> HashMap<String, i64> {
    let mut counts = HashMap::new();
    for image_id in image_ids {
        let image_id = normalize_image_id(image_id);
        if !image_id.is_empty() {
            *counts.entry(image_id.to_string()).or_insert(0) += 1;
        }
    }
    counts
}

pub async fn get_container_stats(
    docker: &Docker,
    id: &str,
) -> Result<(f64, f64, String, String), String> {
    let options = StatsOptions {
        stream: false,
        one_shot: true,
    };
    let mut stream = docker.stats(id, Some(options));
    use futures::StreamExt;
    if let Some(Ok(stats)) = stream.next().await {
        let cpu_delta = stats.cpu_stats.cpu_usage.total_usage as f64
            - stats.precpu_stats.cpu_usage.total_usage as f64;
        let system_cpu_delta = stats.cpu_stats.system_cpu_usage.unwrap_or(0) as f64
            - stats.precpu_stats.system_cpu_usage.unwrap_or(0) as f64;
        let num_cpus = stats.cpu_stats.online_cpus.unwrap_or(1) as f64;
        let cpu_percent = if system_cpu_delta > 0.0 && num_cpus > 0.0 {
            (cpu_delta / system_cpu_delta) * num_cpus * 100.0
        } else {
            0.0
        };

        let mem_usage = stats.memory_stats.usage.unwrap_or(0);
        let mem_limit = stats.memory_stats.limit.unwrap_or(1);
        let mem_percent = if mem_limit > 0 {
            (mem_usage as f64 / mem_limit as f64) * 100.0
        } else {
            0.0
        };

        let mem_used_str = format_size(mem_usage);
        let mem_limit_str = format_size(mem_limit);

        Ok((cpu_percent, mem_percent, mem_used_str, mem_limit_str))
    } else {
        Ok((0.0, 0.0, "0 B".to_string(), "0 B".to_string()))
    }
}

pub async fn list_images(docker: &Docker) -> Result<Vec<bollard::secret::ImageSummary>, String> {
    let options = ListImagesOptions {
        all: true,
        ..Default::default()
    };
    docker
        .list_images::<String>(Some(options))
        .await
        .map_err(|e| format!("Failed to list images: {}", e))
}

pub async fn list_networks_info(docker: &Docker) -> Result<Vec<bollard::secret::Network>, String> {
    let options = ListNetworksOptions::<String>::default();
    docker
        .list_networks::<String>(Some(options))
        .await
        .map_err(|e| format!("Failed to list networks: {}", e))
}

pub async fn inspect_network_info(
    docker: &Docker,
    name: &str,
) -> Result<bollard::secret::Network, String> {
    docker
        .inspect_network::<String>(name, None::<InspectNetworkOptions<String>>)
        .await
        .map_err(|e| format!("Failed to inspect network: {}", e))
}

pub async fn list_volumes_info(
    docker: &Docker,
) -> Result<bollard::models::VolumeListResponse, String> {
    let options = ListVolumesOptions::default();
    docker
        .list_volumes::<String>(Some(options))
        .await
        .map_err(|e| format!("Failed to list volumes: {}", e))
}

pub async fn get_container_log_stream(
    docker: &Docker,
    id: &str,
    tail: usize,
) -> Result<
    impl futures::Stream<Item = Result<bollard::container::LogOutput, bollard::errors::Error>>,
    String,
> {
    let options = LogsOptions::<String> {
        stdout: true,
        stderr: true,
        tail: tail.to_string(),
        follow: false,
        timestamps: true,
        ..Default::default()
    };
    Ok(docker.logs(id, Some(options)))
}

pub async fn exec_in_container_stream(
    docker: &Docker,
    id: &str,
    command: &str,
    on_event: Channel<TerminalOutputEvent>,
) -> Result<(), String> {
    let exec = docker
        .create_exec(
            id,
            CreateExecOptions {
                attach_stdout: Some(true),
                attach_stderr: Some(true),
                cmd: Some(vec!["sh", "-lc", command]),
                tty: Some(false),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| format!("Failed to create exec: {}", e))?;

    let output = docker
        .start_exec(&exec.id, None)
        .await
        .map_err(|e| format!("Failed to start exec: {}", e))?;

    match output {
        StartExecResults::Attached { output, .. } => {
            let mut stream = output;
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| format!("Failed to read exec output: {}", e))?;
                emit_terminal_output(
                    &on_event,
                    "stdout",
                    String::from_utf8_lossy(&chunk.into_bytes()).into_owned(),
                );
            }
            Ok(())
        }
        StartExecResults::Detached => Err("Container exec detached unexpectedly".to_string()),
    }
}

pub fn get_system_resources() -> (f64, u64, u64, u64, u64) {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu = sys.global_cpu_usage();
    let mem_total = sys.total_memory();
    let mem_used = sys.used_memory();

    let mut disk_total: u64 = 0;
    let mut disk_used: u64 = 0;
    let disks = Disks::new_with_refreshed_list();
    for disk in disks.list() {
        disk_total += disk.total_space();
        disk_used += disk.total_space() - disk.available_space();
    }

    (cpu as f64, mem_used, mem_total, disk_used, disk_total)
}

fn format_size(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_idx = 0;
    while size >= 1024.0 && unit_idx < UNITS.len() - 1 {
        size /= 1024.0;
        unit_idx += 1;
    }
    format!("{:.1} {}", size, UNITS[unit_idx])
}

#[cfg(test)]
mod tests {
    use super::{image_container_counts, normalize_image_id};

    #[test]
    fn normalizes_prefixed_image_ids() {
        assert_eq!(normalize_image_id("sha256:abc123"), "abc123");
        assert_eq!(normalize_image_id("abc123"), "abc123");
    }

    #[test]
    fn counts_containers_using_normalized_image_ids() {
        let counts = image_container_counts(["sha256:abc123", "abc123", "sha256:def456", ""]);

        assert_eq!(counts.get("abc123"), Some(&2));
        assert_eq!(counts.get("def456"), Some(&1));
        assert_eq!(counts.len(), 2);
    }
}
