use crate::docker::{self, ConnectionMode, DockerState};
use crate::wsl_docker;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerStatusResponse {
    pub connected: bool,
    pub info: Option<DockerInfoData>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerInfoData {
    pub containers: i64,
    pub containers_running: i64,
    pub containers_paused: i64,
    pub containers_stopped: i64,
    pub images: i64,
    pub docker_version: String,
    pub os: String,
    pub kernel_version: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceStatsResponse {
    pub cpu_percent: f64,
    pub mem_used: u64,
    pub mem_total: u64,
    pub mem_percent: f64,
    pub disk_used: u64,
    pub disk_total: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionModeResponse {
    pub mode: ConnectionMode,
}

#[tauri::command]
pub async fn get_docker_status(
    state: State<'_, DockerState>,
) -> Result<DockerStatusResponse, String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return match wsl_docker::info() {
            Ok(info) => Ok(wsl_info_response(info)),
            Err(_) => Ok(DockerStatusResponse {
                connected: false,
                info: None,
            }),
        };
    }

    let docker = match DockerState::get_docker(state).await {
        Ok(docker) => docker,
        Err(_) => {
            return Ok(DockerStatusResponse {
                connected: false,
                info: None,
            });
        }
    };
    let info = docker::get_system_info(&docker).await?;

    Ok(DockerStatusResponse {
        connected: true,
        info: Some(DockerInfoData {
            containers: info.containers.unwrap_or(0),
            containers_running: info.containers_running.unwrap_or(0),
            containers_paused: info.containers_paused.unwrap_or(0),
            containers_stopped: info.containers_stopped.unwrap_or(0),
            images: info.images.unwrap_or(0),
            docker_version: info.server_version.unwrap_or_default(),
            os: info.operating_system.unwrap_or_default(),
            kernel_version: info.kernel_version.unwrap_or_default(),
        }),
    })
}

#[tauri::command]
pub async fn get_connection_mode(
    state: State<'_, DockerState>,
) -> Result<ConnectionModeResponse, String> {
    Ok(ConnectionModeResponse {
        mode: DockerState::connection_mode(&state).await,
    })
}

#[tauri::command]
pub async fn set_connection_mode(
    state: State<'_, DockerState>,
    mode: ConnectionMode,
) -> Result<ConnectionModeResponse, String> {
    DockerState::set_connection_mode(&state, mode).await;
    Ok(ConnectionModeResponse { mode })
}

#[tauri::command]
pub async fn get_resource_stats(
    state: State<'_, DockerState>,
) -> Result<ResourceStatsResponse, String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        let stats = wsl_docker::resource_stats()?;
        let mem_percent = if stats.mem_total > 0 {
            (stats.mem_used as f64 / stats.mem_total as f64) * 100.0
        } else {
            0.0
        };

        return Ok(ResourceStatsResponse {
            cpu_percent: stats.cpu_percent,
            mem_used: stats.mem_used,
            mem_total: stats.mem_total,
            mem_percent,
            disk_used: stats.disk_used,
            disk_total: stats.disk_total,
        });
    }

    let (cpu, mem_used, mem_total, disk_used, disk_total) = docker::get_system_resources();
    let mem_percent = if mem_total > 0 {
        (mem_used as f64 / mem_total as f64) * 100.0
    } else {
        0.0
    };

    Ok(ResourceStatsResponse {
        cpu_percent: cpu,
        mem_used,
        mem_total,
        mem_percent,
        disk_used,
        disk_total,
    })
}

fn wsl_info_response(info: wsl_docker::Info) -> DockerStatusResponse {
    DockerStatusResponse {
        connected: true,
        info: Some(DockerInfoData {
            containers: info.containers.unwrap_or(0),
            containers_running: info.containers_running.unwrap_or(0),
            containers_paused: info.containers_paused.unwrap_or(0),
            containers_stopped: info.containers_stopped.unwrap_or(0),
            images: info.images.unwrap_or(0),
            docker_version: info.server_version.unwrap_or_default(),
            os: info.operating_system.unwrap_or_default(),
            kernel_version: info.kernel_version.unwrap_or_default(),
        }),
    }
}
