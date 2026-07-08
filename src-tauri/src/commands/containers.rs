use crate::docker::{self, ConnectionMode, DockerState};
use crate::wsl_docker;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::State;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContainerResponse {
    pub id: String,
    pub name: String,
    pub image: String,
    pub image_id: String,
    pub command: String,
    pub created: String,
    pub state: String,
    pub status: String,
    pub ports: Vec<PortInfo>,
    pub cpu_percent: f64,
    pub mem_percent: f64,
    pub mem_usage: String,
    pub mem_limit: String,
    pub group: Option<String>,
    pub urls: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PortInfo {
    pub ip: Option<String>,
    pub private_port: u16,
    pub public_port: Option<u32>,
    pub port_type: String,
}

#[tauri::command]
pub async fn list_containers(
    state: State<'_, DockerState>,
    all: bool,
) -> Result<Vec<ContainerResponse>, String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return list_wsl_containers(state, all).await;
    }

    let docker = DockerState::get_docker(state.clone()).await?;
    let containers = docker::list_container_infos(&docker, all).await?;

    let mut result = Vec::new();
    let meta = state.container_meta.lock().await;

    for c in containers {
        let id = c.id.clone().unwrap_or_default();
        let (cpu, mem, mem_usage, mem_limit) = if c.state.as_deref() == Some("running") {
            docker::get_container_stats(&docker, &id).await.unwrap_or((
                0.0,
                0.0,
                "N/A".into(),
                "N/A".into(),
            ))
        } else {
            (0.0, 0.0, "N/A".into(), "N/A".into())
        };

        let ports = dedupe_ports(
            c.ports
                .unwrap_or_default()
                .iter()
                .map(|p| PortInfo {
                    ip: p.ip.clone(),
                    private_port: p.private_port as u16,
                    public_port: p.public_port.map(|pp| pp as u32),
                    port_type: p
                        .typ
                        .as_ref()
                        .map(|t| format!("{:?}", t))
                        .unwrap_or_else(|| "tcp".into()),
                })
                .collect(),
        );

        let container_meta = meta.get(&id);

        result.push(ContainerResponse {
            name: c
                .names
                .unwrap_or_default()
                .join(", ")
                .trim_start_matches('/')
                .to_string(),
            image: c.image.unwrap_or_default(),
            image_id: c.image_id.unwrap_or_default(),
            command: c.command.unwrap_or_default(),
            created: c.created.unwrap_or(0).to_string(),
            state: c.state.unwrap_or_default(),
            status: c.status.unwrap_or_default(),
            ports,
            cpu_percent: cpu,
            mem_percent: mem,
            mem_usage,
            mem_limit,
            group: container_meta.and_then(|m| m.group.clone()),
            urls: container_meta.and_then(|m| m.urls.clone()),
            id,
        });
    }

    Ok(result)
}

#[tauri::command]
pub async fn start_container(state: State<'_, DockerState>, id: String) -> Result<(), String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return wsl_docker::start_container(&id).map_err(|e| format!("Failed to start: {}", e));
    }
    let docker = DockerState::get_docker(state).await?;
    docker
        .start_container::<String>(&id, None)
        .await
        .map_err(|e| format!("Failed to start: {}", e))
}

#[tauri::command]
pub async fn stop_container(state: State<'_, DockerState>, id: String) -> Result<(), String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return wsl_docker::stop_container(&id).map_err(|e| format!("Failed to stop: {}", e));
    }
    let docker = DockerState::get_docker(state).await?;
    docker
        .stop_container(&id, None)
        .await
        .map_err(|e| format!("Failed to stop: {}", e))
}

#[tauri::command]
pub async fn restart_container(state: State<'_, DockerState>, id: String) -> Result<(), String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return wsl_docker::restart_container(&id).map_err(|e| format!("Failed to restart: {}", e));
    }
    let docker = DockerState::get_docker(state).await?;
    docker
        .restart_container(&id, None)
        .await
        .map_err(|e| format!("Failed to restart: {}", e))
}

#[tauri::command]
pub async fn remove_container(
    state: State<'_, DockerState>,
    id: String,
    force: bool,
) -> Result<(), String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return wsl_docker::remove_container(&id, force)
            .map_err(|e| format!("Failed to remove: {}", e));
    }
    let docker = DockerState::get_docker(state).await?;
    let options = bollard::container::RemoveContainerOptions {
        force,
        ..Default::default()
    };
    docker
        .remove_container(&id, Some(options))
        .await
        .map_err(|e| format!("Failed to remove: {}", e))
}

#[tauri::command]
pub async fn batch_start_containers(
    state: State<'_, DockerState>,
    ids: Vec<String>,
) -> Result<Vec<String>, String> {
    let mut errors = Vec::new();
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        for id in ids {
            if let Err(e) = wsl_docker::start_container(&id) {
                errors.push(format!("{}: {}", id, e));
            }
        }
        return Ok(errors);
    }

    let docker = DockerState::get_docker(state).await?;
    for id in ids {
        if let Err(e) = docker.start_container::<String>(&id, None).await {
            errors.push(format!("{}: {}", id, e));
        }
    }
    Ok(errors)
}

#[tauri::command]
pub async fn batch_stop_containers(
    state: State<'_, DockerState>,
    ids: Vec<String>,
) -> Result<Vec<String>, String> {
    let mut errors = Vec::new();
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        for id in ids {
            if let Err(e) = wsl_docker::stop_container(&id) {
                errors.push(format!("{}: {}", id, e));
            }
        }
        return Ok(errors);
    }

    let docker = DockerState::get_docker(state).await?;
    for id in ids {
        if let Err(e) = docker.stop_container(&id, None).await {
            errors.push(format!("{}: {}", id, e));
        }
    }
    Ok(errors)
}

#[tauri::command]
pub async fn batch_restart_containers(
    state: State<'_, DockerState>,
    ids: Vec<String>,
) -> Result<Vec<String>, String> {
    let mut errors = Vec::new();
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        for id in ids {
            if let Err(e) = wsl_docker::restart_container(&id) {
                errors.push(format!("{}: {}", id, e));
            }
        }
        return Ok(errors);
    }

    let docker = DockerState::get_docker(state).await?;
    for id in ids {
        if let Err(e) = docker.restart_container(&id, None).await {
            errors.push(format!("{}: {}", id, e));
        }
    }
    Ok(errors)
}

#[tauri::command]
pub async fn batch_remove_containers(
    state: State<'_, DockerState>,
    ids: Vec<String>,
    force: bool,
) -> Result<Vec<String>, String> {
    let mut errors = Vec::new();
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        for id in ids {
            if let Err(e) = wsl_docker::remove_container(&id, force) {
                errors.push(format!("{}: {}", id, e));
            }
        }
        return Ok(errors);
    }

    let docker = DockerState::get_docker(state).await?;
    let options = bollard::container::RemoveContainerOptions {
        force,
        ..Default::default()
    };
    for id in ids {
        if let Err(e) = docker.remove_container(&id, Some(options.clone())).await {
            errors.push(format!("{}: {}", id, e));
        }
    }
    Ok(errors)
}

#[tauri::command]
pub async fn get_container_logs(
    state: State<'_, DockerState>,
    id: String,
    tail: usize,
) -> Result<Vec<LogEntry>, String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return wsl_docker::container_logs(&id, tail).map(|lines| {
            lines
                .into_iter()
                .map(|message| LogEntry {
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    stream: "stdout".to_string(),
                    message,
                })
                .collect()
        });
    }

    let docker = DockerState::get_docker(state).await?;
    let mut stream = docker::get_container_log_stream(&docker, &id, tail).await?;

    let mut logs = Vec::new();
    let mut count = 0;
    while let Some(Ok(log)) = stream.next().await {
        if count >= tail {
            break;
        }
        let (stream_type, message) = match log {
            bollard::container::LogOutput::StdOut { message } => ("stdout", message),
            bollard::container::LogOutput::StdErr { message } => ("stderr", message),
            _ => (
                "unknown",
                bollard::container::LogOutput::StdOut {
                    message: vec![].into(),
                }
                .to_string()
                .into(),
            ),
        };
        logs.push(LogEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            stream: stream_type.to_string(),
            message: String::from_utf8_lossy(&message).to_string(),
        });
        count += 1;
    }

    Ok(logs)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub timestamp: String,
    pub stream: String,
    pub message: String,
}

#[tauri::command]
pub async fn exec_container(
    state: State<'_, DockerState>,
    id: String,
    cmd: Vec<String>,
) -> Result<String, String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return wsl_docker::exec_container(&id, &cmd);
    }

    let docker = DockerState::get_docker(state).await?;
    let cmd_refs: Vec<&str> = cmd.iter().map(|s| s.as_str()).collect();
    docker::exec_in_container(&docker, &id, cmd_refs).await
}

#[tauri::command]
pub async fn update_container_meta(
    state: State<'_, DockerState>,
    id: String,
    group: Option<String>,
    urls: Option<Vec<String>>,
) -> Result<(), String> {
    {
        let mut meta = state.container_meta.lock().await;
        let existing = meta.get(&id);
        let final_group = match group {
            Some(value) => {
                let trimmed = value.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            }
            None => existing.and_then(|m| m.group.clone()),
        };
        let final_urls = urls.or_else(|| existing.and_then(|m| m.urls.clone()));
        meta.insert(
            id,
            crate::docker::ContainerMeta {
                group: final_group,
                urls: final_urls,
            },
        );
    }
    state.save_container_meta().await
}

async fn list_wsl_containers(
    state: State<'_, DockerState>,
    all: bool,
) -> Result<Vec<ContainerResponse>, String> {
    let containers = wsl_docker::list_containers(all)?;
    let meta = state.container_meta.lock().await;

    Ok(containers
        .into_iter()
        .map(|c| {
            let (cpu_percent, mem_percent, mem_usage, mem_limit) =
                if c.state.eq_ignore_ascii_case("running") {
                    wsl_docker::container_stats(&c.id)
                        .map(|stats| {
                            let (used, limit) = wsl_docker::mem_usage_parts(&stats.mem_usage);
                            (
                                wsl_docker::percent(&stats.cpu_perc),
                                wsl_docker::percent(&stats.mem_perc),
                                used,
                                limit,
                            )
                        })
                        .unwrap_or((0.0, 0.0, "N/A".to_string(), "N/A".to_string()))
                } else {
                    (0.0, 0.0, "N/A".to_string(), "N/A".to_string())
                };
            let container_meta = meta.get(&c.id);

            ContainerResponse {
                id: c.id,
                name: c.names.trim_start_matches('/').to_string(),
                image: c.image,
                image_id: c.image_id,
                command: c.command,
                created: c.created_at,
                state: c.state,
                status: c.status,
                ports: parse_wsl_ports(&c.ports),
                cpu_percent,
                mem_percent,
                mem_usage,
                mem_limit,
                group: container_meta.and_then(|m| m.group.clone()),
                urls: container_meta.and_then(|m| m.urls.clone()),
            }
        })
        .collect())
}

fn parse_wsl_ports(ports: &str) -> Vec<PortInfo> {
    dedupe_ports(
        ports
            .split(',')
            .filter_map(|part| {
                let part = part.trim();
                if part.is_empty() {
                    return None;
                }

                let mapping = part.rsplit_once("->").map(|(public, private)| {
                    let public_port = public
                        .rsplit_once(':')
                        .map(|(_, port)| port)
                        .unwrap_or(public);
                    (Some(public_port), private)
                });
                let (public_port, private) = mapping.unwrap_or((None, part));
                let (private_port, port_type) = private
                    .rsplit_once('/')
                    .map(|(port, typ)| (port, typ))
                    .unwrap_or((private, "tcp"));

                Some(PortInfo {
                    ip: None,
                    private_port: private_port.parse().unwrap_or(0),
                    public_port: public_port.and_then(|port| port.parse().ok()),
                    port_type: port_type.to_string(),
                })
            })
            .collect(),
    )
}

fn dedupe_ports(ports: Vec<PortInfo>) -> Vec<PortInfo> {
    let mut seen = HashSet::new();
    ports
        .into_iter()
        .filter(|port| {
            let key = (
                port.public_port,
                port.private_port,
                port.port_type.to_ascii_lowercase(),
            );
            seen.insert(key)
        })
        .collect()
}
