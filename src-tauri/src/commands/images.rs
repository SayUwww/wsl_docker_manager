use crate::docker::{self, ConnectionMode, DockerState};
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

#[tauri::command]
pub async fn list_images(state: State<'_, DockerState>) -> Result<Vec<ImageResponse>, String> {
    if DockerState::connection_mode(&state).await == ConnectionMode::Wsl {
        return list_wsl_images();
    }

    let docker = DockerState::get_docker(state).await?;
    let images = docker::list_images(&docker).await?;

    let result: Vec<ImageResponse> = images
        .into_iter()
        .map(|img| {
            let tags = img.repo_tags;
            let dangling = tags.is_empty() || tags.iter().all(|t| t == "<none>:<none>");

            ImageResponse {
                id: img.id,
                parent_id: img.parent_id,
                repo_tags: tags,
                repo_digests: img.repo_digests,
                created: img.created.to_string(),
                size: img.size,
                shared_size: img.shared_size,
                virtual_size: img.virtual_size.unwrap_or(0),
                containers: img.containers,
                dangling,
            }
        })
        .collect();

    Ok(result)
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

fn short_id(id: &str) -> String {
    id.trim_start_matches("sha256:").chars().take(12).collect()
}

fn list_wsl_images() -> Result<Vec<ImageResponse>, String> {
    Ok(wsl_docker::list_images()?
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
                shared_size: 0,
                virtual_size: size,
                containers: img.containers.parse().unwrap_or(0),
                dangling: img.repository == "<none>" || img.tag == "<none>",
            }
        })
        .collect())
}
