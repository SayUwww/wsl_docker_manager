use crate::docker::{self, ConnectionMode, DockerState};
use crate::remote_docker;
use crate::wsl_docker;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageResponse {
    pub id: String,
    pub parent_id: String,
    pub repo_tags: Vec<String>,
    pub repo_digests: Vec<String>,
    pub created: String,
    pub size: i64,
    pub shared_size: i64,
    pub virtual_size: i64,
    pub containers: i64,
    pub dangling: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageContainerResponse {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
}

#[tauri::command]
pub async fn list_images(state: State<'_, DockerState>) -> Result<Vec<ImageResponse>, String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return list_wsl_images();
    }
    if DockerState::connection_mode(&state).await == ConnectionMode::Remote {
        let profile = DockerState::selected_remote_profile(&state).await?;
        return tokio::task::spawn_blocking(move || remote_docker::list_images(&profile))
            .await
            .map_err(|e| e.to_string())?
            .and_then(remote_images_to_response);
    }

    let docker = DockerState::get_docker(state).await?;
    let images = docker::list_images(&docker).await?;
    let containers = docker::list_container_infos(&docker, true).await?;
    let container_counts = docker::image_container_counts(
        containers
            .iter()
            .filter_map(|container| container.image_id.as_deref()),
    );

    let result: Vec<ImageResponse> = images
        .into_iter()
        .map(|img| {
            let tags = img.repo_tags;
            let dangling = tags.is_empty() || tags.iter().all(|t| t == "<none>:<none>");
            let containers = container_counts
                .get(docker::normalize_image_id(&img.id))
                .copied()
                .unwrap_or(0);

            ImageResponse {
                id: img.id,
                parent_id: img.parent_id,
                repo_tags: tags,
                repo_digests: img.repo_digests,
                created: img.created.to_string(),
                size: img.size,
                shared_size: img.shared_size,
                virtual_size: img.virtual_size.unwrap_or(0),
                containers,
                dangling,
            }
        })
        .collect();

    Ok(result)
}

#[tauri::command]
pub async fn list_image_containers(
    state: State<'_, DockerState>,
    id: String,
) -> Result<Vec<ImageContainerResponse>, String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return wsl_docker::image_containers(&id).map(image_container_refs_to_response);
    }
    if DockerState::connection_mode(&state).await == ConnectionMode::Remote {
        let profile = DockerState::selected_remote_profile(&state).await?;
        return tokio::task::spawn_blocking(move || {
            remote_docker::image_containers(&profile, &id).map(image_container_refs_to_response)
        })
        .await
        .map_err(|e| e.to_string())?;
    }

    let docker = DockerState::get_docker(state).await?;
    let containers = docker::list_container_infos(&docker, true).await?;
    let target_id = docker::normalize_image_id(&id);

    Ok(containers
        .into_iter()
        .filter(|container| {
            container
                .image_id
                .as_deref()
                .is_some_and(|image_id| docker::normalize_image_id(image_id) == target_id)
        })
        .map(|container| ImageContainerResponse {
            id: container.id.unwrap_or_default(),
            name: container
                .names
                .unwrap_or_default()
                .join(", ")
                .trim_start_matches('/')
                .to_string(),
            image: container.image.unwrap_or_default(),
            state: container.state.unwrap_or_default(),
            status: container.status.unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub async fn remove_image(
    state: State<'_, DockerState>,
    id: String,
    force: bool,
) -> Result<Vec<String>, String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return match wsl_docker::remove_image(&id, force) {
            Ok(output) => Ok(output.lines().map(ToOwned::to_owned).collect()),
            Err(e) => Err(format!(
                "Failed to remove image: {}{}",
                e,
                format_image_container_refs(&id)
            )),
        };
    }
    if DockerState::connection_mode(&state).await == ConnectionMode::Remote {
        let profile = DockerState::selected_remote_profile(&state).await?;
        return tokio::task::spawn_blocking(move || {
            match remote_docker::remove_image(&profile, &id, force) {
                Ok(output) => Ok(output.lines().map(ToOwned::to_owned).collect()),
                Err(e) => Err(format!(
                    "Failed to remove image: {}{}",
                    e,
                    format_remote_image_container_refs(&profile, &id)
                )),
            }
        })
        .await
        .map_err(|e| e.to_string())?;
    }

    let docker = DockerState::get_docker(state).await?;
    let options = bollard::image::RemoveImageOptions {
        force,
        ..Default::default()
    };
    let results = docker
        .remove_image(&id, Some(options), None)
        .await
        .map_err(|e| format!("Failed to remove image: {}", e))?;

    let count = results.len();
    Ok(vec![format!("Deleted {} image layer(s)", count)])
}

#[tauri::command]
pub async fn prune_images(state: State<'_, DockerState>) -> Result<String, String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return wsl_docker::prune_images().map_err(|e| format!("Failed to prune images: {}", e));
    }
    if DockerState::connection_mode(&state).await == ConnectionMode::Remote {
        let profile = DockerState::selected_remote_profile(&state).await?;
        return tokio::task::spawn_blocking(move || remote_docker::prune_images(&profile))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("Failed to prune images: {}", e));
    }

    let docker = DockerState::get_docker(state).await?;
    let result = docker
        .prune_images::<String>(None)
        .await
        .map_err(|e| format!("Failed to prune images: {}", e))?;

    Ok(result
        .space_reclaimed
        .map(|s| format!("Reclaimed: {} bytes", s))
        .unwrap_or_else(|| "No space reclaimed".to_string()))
}

fn format_image_container_refs(id: &str) -> String {
    let Ok(containers) = wsl_docker::image_containers(id) else {
        return String::new();
    };
    if containers.is_empty() {
        return String::new();
    }

    let refs = containers
        .into_iter()
        .map(|container| {
            format!(
                "{} [{}] ({}, {}, image {})",
                container.names,
                short_id(&container.id),
                container.state,
                container.status,
                short_id(&container.image)
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    format!(" Used by container(s): {}", refs)
}

fn format_remote_image_container_refs(profile: &docker::RemoteProfile, id: &str) -> String {
    let Ok(containers) = remote_docker::image_containers(profile, id) else {
        return String::new();
    };
    if containers.is_empty() {
        return String::new();
    }

    let refs = containers
        .into_iter()
        .map(|container| {
            format!(
                "{} [{}] ({}, {}, image {})",
                container.names,
                short_id(&container.id),
                container.state,
                container.status,
                short_id(&container.image)
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    format!(" Used by container(s): {}", refs)
}

fn short_id(id: &str) -> String {
    id.trim_start_matches("sha256:").chars().take(12).collect()
}

fn image_container_refs_to_response(
    containers: Vec<wsl_docker::ImageContainerRef>,
) -> Vec<ImageContainerResponse> {
    containers
        .into_iter()
        .map(|container| ImageContainerResponse {
            id: container.id,
            name: container.names.trim_start_matches('/').to_string(),
            image: container.image,
            state: container.state,
            status: container.status,
        })
        .collect()
}

fn list_wsl_images() -> Result<Vec<ImageResponse>, String> {
    remote_images_to_response(wsl_docker::list_images()?)
}

fn remote_images_to_response(images: Vec<wsl_docker::Image>) -> Result<Vec<ImageResponse>, String> {
    Ok(images
        .into_iter()
        .map(|img| {
            let repo_tag = if img.repository == "<none>" || img.tag == "<none>" {
                "<none>:<none>".to_string()
            } else {
                format!("{}:{}", img.repository, img.tag)
            };
            let repo_tags = if repo_tag == "<none>:<none>" {
                Vec::new()
            } else {
                vec![repo_tag]
            };
            let repo_digests = if img.digest == "<none>" {
                Vec::new()
            } else {
                vec![img.digest]
            };
            let size = wsl_docker::size_to_bytes(&img.size);

            ImageResponse {
                id: img.id,
                parent_id: img.parent_id,
                repo_tags,
                repo_digests,
                created: img.created_at,
                size,
                shared_size: img.shared_size,
                virtual_size: size,
                containers: img.containers.parse().unwrap_or(0),
                dangling: img.repository == "<none>" || img.tag == "<none>",
            }
        })
        .collect())
}
