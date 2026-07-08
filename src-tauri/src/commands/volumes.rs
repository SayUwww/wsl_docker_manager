use crate::docker::{self, ConnectionMode, DockerState};
use crate::wsl_docker;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::State;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeResponse {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
    pub scope: String,
    pub ref_count: usize,
    pub orphan: bool,
    pub containers: Vec<String>,
}

#[tauri::command]
pub async fn list_volumes(
    state: State<'_, DockerState>,
    container_ids: Vec<String>,
) -> Result<Vec<VolumeResponse>, String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return list_wsl_volumes(container_ids);
    }

    let docker = DockerState::get_docker(state).await?;
    let volumes = docker::list_volumes_info(&docker).await?;

    let volume_containers = volume_container_map(&docker).await?;
    let used_volumes: HashSet<String> = container_ids
        .into_iter()
        .chain(volume_containers.keys().cloned())
        .collect();

    let result: Vec<VolumeResponse> = volumes
        .volumes
        .unwrap_or_default()
        .into_iter()
        .map(|v| {
            let name = v.name;
            let orphan = !used_volumes.contains(&name);
            let containers = volume_containers.get(&name).cloned().unwrap_or_default();

            VolumeResponse {
                name,
                driver: v.driver,
                mountpoint: v.mountpoint,
                scope: format!("{:?}", v.scope),
                ref_count: containers.len(),
                orphan,
                containers,
            }
        })
        .collect();

    Ok(result)
}

#[tauri::command]
pub async fn remove_volume(
    state: State<'_, DockerState>,
    name: String,
    force: bool,
) -> Result<(), String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return wsl_docker::remove_volume(&name, force)
            .map_err(|e| format!("Failed to remove volume: {}", e));
    }

    let docker = DockerState::get_docker(state).await?;
    docker
        .remove_volume(&name, Some(bollard::volume::RemoveVolumeOptions { force }))
        .await
        .map_err(|e| format!("Failed to remove volume: {}", e))
}

#[tauri::command]
pub async fn prune_volumes(state: State<'_, DockerState>) -> Result<String, String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return wsl_docker::prune_volumes().map_err(|e| format!("Failed to prune volumes: {}", e));
    }

    let docker = DockerState::get_docker(state).await?;
    let options = bollard::volume::PruneVolumesOptions::<String> {
        ..Default::default()
    };
    let result = docker
        .prune_volumes(Some(options))
        .await
        .map_err(|e| format!("Failed to prune volumes: {}", e))?;

    Ok(result
        .space_reclaimed
        .map(|s| format!("Reclaimed: {} bytes", s))
        .unwrap_or_else(|| "No space reclaimed".to_string()))
}

fn list_wsl_volumes(container_ids: Vec<String>) -> Result<Vec<VolumeResponse>, String> {
    let volume_containers = wsl_docker::volume_container_map()?;
    let used_volumes: HashSet<String> = container_ids
        .into_iter()
        .chain(volume_containers.keys().cloned())
        .collect();

    Ok(wsl_docker::list_volumes()?
        .into_iter()
        .map(|v| {
            let orphan = !used_volumes.contains(&v.name);
            let containers = volume_containers.get(&v.name).cloned().unwrap_or_default();
            VolumeResponse {
                name: v.name,
                driver: v.driver,
                mountpoint: v.mountpoint,
                scope: v.scope,
                ref_count: containers.len(),
                orphan,
                containers,
            }
        })
        .collect())
}

async fn volume_container_map(
    docker: &bollard::Docker,
) -> Result<HashMap<String, Vec<String>>, String> {
    let containers = docker::list_container_infos(docker, true).await?;
    let mut owners: HashMap<String, Vec<String>> = HashMap::new();

    for container in containers {
        let container_name = container
            .names
            .unwrap_or_default()
            .first()
            .cloned()
            .unwrap_or_else(|| container.id.clone().unwrap_or_default())
            .trim_start_matches('/')
            .to_string();

        for mount in container.mounts.unwrap_or_default() {
            if let Some(volume_name) = mount.name {
                owners
                    .entry(volume_name)
                    .or_default()
                    .push(container_name.clone());
            }
        }
    }

    Ok(owners)
}
