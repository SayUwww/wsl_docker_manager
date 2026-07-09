use crate::docker::{self, ConnectionMode, DockerState};
use crate::remote_docker;
use crate::wsl_docker;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::State;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkResponse {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub internal: bool,
    pub containers: Vec<NetworkContainerInfo>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NetworkContainerInfo {
    pub id: String,
    pub name: String,
    pub ipv4: String,
    pub ipv6: String,
}

#[tauri::command]
pub async fn list_networks(state: State<'_, DockerState>) -> Result<Vec<NetworkResponse>, String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return list_wsl_networks();
    }
    if DockerState::connection_mode(&state).await == ConnectionMode::Remote {
        let profile = DockerState::selected_remote_profile(&state).await?;
        return tokio::task::spawn_blocking(move || list_remote_networks(profile))
            .await
            .map_err(|e| e.to_string())?;
    }

    let docker = DockerState::get_docker(state).await?;
    let networks = docker::list_networks_info(&docker).await?;
    let container_map = direct_network_container_map(&docker)
        .await
        .unwrap_or_default();

    let mut result = Vec::new();
    for network in networks {
        if is_predefined_network(network.name.as_deref(), network.driver.as_deref()) {
            continue;
        }

        let inspect_key = network
            .id
            .clone()
            .or_else(|| network.name.clone())
            .unwrap_or_default();
        let inspected = docker::inspect_network_info(&docker, &inspect_key)
            .await
            .unwrap_or(network);
        let containers_map = inspected.containers.unwrap_or_default();
        let containers = containers_map
            .into_iter()
            .map(|(id, info)| NetworkContainerInfo {
                name: info.name.unwrap_or_else(|| id.clone()),
                id,
                ipv4: info.ipv4_address.unwrap_or_default(),
                ipv6: info.ipv6_address.unwrap_or_default(),
            })
            .collect();

        let id = inspected.id.unwrap_or_default();
        let name = inspected.name.unwrap_or_default();
        let containers = merge_network_containers(containers, &container_map, &id, &name);

        result.push(NetworkResponse {
            id,
            name,
            driver: inspected.driver.unwrap_or_default(),
            scope: inspected.scope.unwrap_or_default(),
            internal: inspected.internal.unwrap_or(false),
            containers,
        });
    }

    Ok(result)
}

#[tauri::command]
pub async fn remove_network(state: State<'_, DockerState>, id: String) -> Result<(), String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return wsl_docker::remove_network(&id)
            .map_err(|e| format!("Failed to remove network: {}", e));
    }
    if DockerState::connection_mode(&state).await == ConnectionMode::Remote {
        let profile = DockerState::selected_remote_profile(&state).await?;
        return tokio::task::spawn_blocking(move || remote_docker::remove_network(&profile, &id))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("Failed to remove network: {}", e));
    }

    let docker = DockerState::get_docker(state).await?;
    docker
        .remove_network(&id)
        .await
        .map_err(|e| format!("Failed to remove network: {}", e))
}

fn list_wsl_networks() -> Result<Vec<NetworkResponse>, String> {
    let container_map: HashMap<String, Vec<NetworkContainerInfo>> =
        wsl_docker::network_container_map()
            .unwrap_or_default()
            .into_iter()
            .map(|(key, containers)| {
                (
                    key,
                    containers
                        .into_iter()
                        .map(|container| NetworkContainerInfo {
                            id: container.container_id,
                            name: container.name,
                            ipv4: container.ipv4,
                            ipv6: container.ipv6,
                        })
                        .collect(),
                )
            })
            .collect();

    Ok(wsl_docker::inspect_networks()?
        .into_iter()
        .filter(|n| !is_predefined_network(Some(&n.name), Some(&n.driver)))
        .map(|n| {
            let containers = n
                .containers
                .unwrap_or_default()
                .into_iter()
                .map(|(id, info)| NetworkContainerInfo {
                    name: info.name.unwrap_or_else(|| id.clone()),
                    id,
                    ipv4: info.ipv4_address.unwrap_or_default(),
                    ipv6: info.ipv6_address.unwrap_or_default(),
                })
                .collect();
            let containers = merge_network_containers(containers, &container_map, &n.id, &n.name);

            NetworkResponse {
                id: n.id,
                name: n.name,
                driver: n.driver,
                scope: n.scope,
                internal: n.internal.unwrap_or(false),
                containers,
            }
        })
        .collect())
}

fn list_remote_networks(profile: docker::RemoteProfile) -> Result<Vec<NetworkResponse>, String> {
    let container_map: HashMap<String, Vec<NetworkContainerInfo>> =
        remote_docker::network_container_map(&profile)
            .unwrap_or_default()
            .into_iter()
            .map(|(key, containers)| {
                (
                    key,
                    containers
                        .into_iter()
                        .map(|container| NetworkContainerInfo {
                            id: container.container_id,
                            name: container.name,
                            ipv4: container.ipv4,
                            ipv6: container.ipv6,
                        })
                        .collect(),
                )
            })
            .collect();

    Ok(remote_docker::inspect_networks(&profile)?
        .into_iter()
        .filter(|n| !is_predefined_network(Some(&n.name), Some(&n.driver)))
        .map(|n| {
            let containers = n
                .containers
                .unwrap_or_default()
                .into_iter()
                .map(|(id, info)| NetworkContainerInfo {
                    name: info.name.unwrap_or_else(|| id.clone()),
                    id,
                    ipv4: info.ipv4_address.unwrap_or_default(),
                    ipv6: info.ipv6_address.unwrap_or_default(),
                })
                .collect();
            let containers = merge_network_containers(containers, &container_map, &n.id, &n.name);

            NetworkResponse {
                id: n.id,
                name: n.name,
                driver: n.driver,
                scope: n.scope,
                internal: n.internal.unwrap_or(false),
                containers,
            }
        })
        .collect())
}

fn is_predefined_network(name: Option<&str>, driver: Option<&str>) -> bool {
    matches!(name, Some("bridge" | "host" | "none"))
        || matches!(driver, Some("host" | "none" | "null"))
}

fn merge_network_containers(
    mut containers: Vec<NetworkContainerInfo>,
    container_map: &HashMap<String, Vec<NetworkContainerInfo>>,
    id: &str,
    name: &str,
) -> Vec<NetworkContainerInfo> {
    let mut seen: HashSet<String> = containers
        .iter()
        .map(|container| container.id.clone())
        .collect();

    for key in [id, name] {
        if let Some(extra_containers) = container_map.get(key) {
            for container in extra_containers {
                if seen.insert(container.id.clone()) {
                    containers.push(container.clone());
                }
            }
        }
    }

    containers
}

async fn direct_network_container_map(
    docker: &bollard::Docker,
) -> Result<HashMap<String, Vec<NetworkContainerInfo>>, String> {
    let containers = docker::list_container_infos(docker, true).await?;
    let mut networks: HashMap<String, Vec<NetworkContainerInfo>> = HashMap::new();

    for container in containers {
        let container_id = container.id.unwrap_or_default();
        let name = container
            .names
            .unwrap_or_default()
            .first()
            .cloned()
            .unwrap_or_else(|| container_id.clone())
            .trim_start_matches('/')
            .to_string();
        let Some(settings) = container.network_settings else {
            continue;
        };

        for (network_name, endpoint) in settings.networks.unwrap_or_default() {
            let attachment = NetworkContainerInfo {
                id: container_id.clone(),
                name: name.clone(),
                ipv4: endpoint.ip_address.unwrap_or_default(),
                ipv6: endpoint.global_ipv6_address.unwrap_or_default(),
            };
            networks
                .entry(network_name.clone())
                .or_default()
                .push(attachment.clone());
            if let Some(network_id) = endpoint.network_id {
                networks.entry(network_id).or_default().push(attachment);
            }
        }
    }

    Ok(networks)
}
