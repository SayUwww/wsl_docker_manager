use crate::docker::{
    emit_terminal_output, image_container_counts, normalize_image_id, TerminalOutputEvent,
};
use serde::Deserialize;
use std::collections::HashMap;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use tauri::ipc::Channel;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command as TokioCommand;

const DOCKER_COMMAND_TIMEOUT_SECONDS: u64 = 20;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Info {
    pub containers: Option<i64>,
    pub containers_running: Option<i64>,
    pub containers_paused: Option<i64>,
    pub containers_stopped: Option<i64>,
    pub images: Option<i64>,
    pub server_version: Option<String>,
    pub operating_system: Option<String>,
    pub kernel_version: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Container {
    #[serde(rename = "ID")]
    pub id: String,
    pub image: String,
    pub image_id: String,
    pub command: String,
    pub created_at: String,
    pub state: String,
    pub status: String,
    pub names: String,
    pub ports: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ImageContainerRef {
    #[serde(rename = "ID")]
    pub id: String,
    pub image: String,
    pub names: String,
    pub state: String,
    pub status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Image {
    #[serde(rename = "ID")]
    pub id: String,
    pub parent_id: String,
    pub repository: String,
    pub tag: String,
    pub digest: String,
    pub created_at: String,
    pub size: String,
    pub shared_size: i64,
    pub containers: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Network {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub internal: Option<bool>,
    pub containers: Option<HashMap<String, NetworkContainer>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct NetworkContainer {
    pub name: Option<String>,
    #[serde(rename = "IPv4Address")]
    pub ipv4_address: Option<String>,
    #[serde(rename = "IPv6Address")]
    pub ipv6_address: Option<String>,
}

#[derive(Clone)]
pub struct NetworkAttachment {
    pub container_id: String,
    pub name: String,
    pub ipv4: String,
    pub ipv6: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Volume {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
    pub scope: String,
}

#[derive(Deserialize)]
pub struct Stats {
    #[serde(rename = "CPUPerc")]
    pub cpu_perc: String,
    #[serde(rename = "MemPerc")]
    pub mem_perc: String,
    #[serde(rename = "MemUsage")]
    pub mem_usage: String,
}

#[derive(Deserialize)]
pub struct ResourceStats {
    pub cpu_percent: f64,
    pub mem_used: u64,
    pub mem_total: u64,
    pub disk_used: u64,
    pub disk_total: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ApiContainer {
    #[serde(rename = "Id")]
    id: String,
    names: Vec<String>,
    image: String,
    #[serde(rename = "ImageID")]
    image_id: String,
    command: String,
    created: i64,
    ports: Vec<ApiPort>,
    mounts: Option<Vec<ApiMount>>,
    state: String,
    status: String,
    network_settings: Option<ApiNetworkSettings>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ApiPort {
    #[serde(rename = "IP")]
    ip: Option<String>,
    private_port: u16,
    public_port: Option<u32>,
    #[serde(rename = "Type")]
    port_type: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ApiMount {
    name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ApiNetworkSettings {
    networks: Option<HashMap<String, ApiEndpointSettings>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ApiEndpointSettings {
    #[serde(rename = "NetworkID")]
    network_id: Option<String>,
    #[serde(rename = "IPAddress")]
    ip_address: Option<String>,
    #[serde(rename = "GlobalIPv6Address")]
    global_ipv6_address: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ApiImage {
    #[serde(rename = "Id")]
    id: String,
    #[serde(rename = "ParentId")]
    parent_id: Option<String>,
    repo_tags: Option<Vec<String>>,
    repo_digests: Option<Vec<String>>,
    created: i64,
    size: i64,
    shared_size: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ApiImageInspect {
    parent: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ApiVolumeList {
    volumes: Option<Vec<Volume>>,
}

pub fn info() -> Result<Info, String> {
    let output = docker_api("/info")?;
    serde_json::from_str(&output).map_err(|e| format!("Failed to parse docker info: {}", e))
}

pub fn list_containers(all: bool) -> Result<Vec<Container>, String> {
    let output = docker_api(&format!(
        "/containers/json?all={}",
        if all { "true" } else { "false" }
    ))?;
    let containers: Vec<ApiContainer> =
        serde_json::from_str(&output).map_err(|e| format!("Failed to parse containers: {}", e))?;

    Ok(containers
        .into_iter()
        .map(|c| Container {
            id: c.id,
            image: c.image,
            image_id: c.image_id,
            command: c.command,
            created_at: c.created.to_string(),
            state: c.state,
            status: c.status,
            names: c.names.join(", "),
            ports: c
                .ports
                .into_iter()
                .map(|p| match p.public_port {
                    Some(public_port) => format!(
                        "{}{}->{}{}",
                        p.ip.map(|ip| format!("{}:", ip)).unwrap_or_default(),
                        public_port,
                        p.private_port,
                        format!("/{}", p.port_type)
                    ),
                    None => format!("{}/{}", p.private_port, p.port_type),
                })
                .collect::<Vec<_>>()
                .join(", "),
        })
        .collect())
}

pub fn container_stats(id: &str) -> Result<Stats, String> {
    let output = docker_output(&format!(
        "docker stats --no-stream --format '{{{{json .}}}}' {}",
        sh_quote(id)
    ))?;
    serde_json::from_str(&output).map_err(|e| format!("Failed to parse container stats: {}", e))
}

pub fn resource_stats() -> Result<ResourceStats, String> {
    let output = docker_output(
        r#"read _ user nice system idle iowait irq softirq steal rest < /proc/stat
idle1=$((idle + iowait))
total1=$((user + nice + system + idle + iowait + irq + softirq + steal))
sleep 0.2
read _ user nice system idle iowait irq softirq steal rest < /proc/stat
idle2=$((idle + iowait))
total2=$((user + nice + system + idle + iowait + irq + softirq + steal))
cpu=$(awk -v idle="$((idle2 - idle1))" -v total="$((total2 - total1))" 'BEGIN { if (total > 0) printf "%.2f", (1 - idle / total) * 100; else printf "0" }')
mem_total=$(awk '/MemTotal/ {print $2 * 1024}' /proc/meminfo)
mem_available=$(awk '/MemAvailable/ {print $2 * 1024}' /proc/meminfo)
mem_used=$((mem_total - mem_available))
disk_total=$(df -B1 / | awk 'NR == 2 {print $2}')
disk_used=$(df -B1 / | awk 'NR == 2 {print $3}')
printf '{"cpu_percent":%s,"mem_used":%s,"mem_total":%s,"disk_used":%s,"disk_total":%s}' "$cpu" "$mem_used" "$mem_total" "$disk_used" "$disk_total""#,
    )?;
    serde_json::from_str(&output).map_err(|e| format!("Failed to parse WSL resources: {}", e))
}

pub fn list_images() -> Result<Vec<Image>, String> {
    let output = docker_api("/images/json?all=true&shared-size=true")?;
    let images: Vec<ApiImage> =
        serde_json::from_str(&output).map_err(|e| format!("Failed to parse images: {}", e))?;
    let container_output = docker_api("/containers/json?all=true")?;
    let containers: Vec<ApiContainer> = serde_json::from_str(&container_output)
        .map_err(|e| format!("Failed to parse containers for image counts: {}", e))?;
    let container_counts = image_container_counts(
        containers
            .iter()
            .map(|container| container.image_id.as_str()),
    );

    Ok(images
        .into_iter()
        .map(|img| {
            let id = img.id;
            let containers = container_counts
                .get(normalize_image_id(&id))
                .copied()
                .unwrap_or(0);
            let parent_id = img
                .parent_id
                .filter(|parent_id| !parent_id.is_empty())
                .unwrap_or_else(|| inspect_image_parent(&id).unwrap_or_default());
            let tag = img
                .repo_tags
                .as_ref()
                .and_then(|tags| tags.first())
                .cloned()
                .unwrap_or_else(|| "<none>:<none>".to_string());
            let (repository, tag) = tag
                .rsplit_once(':')
                .map(|(repo, tag)| (repo.to_string(), tag.to_string()))
                .unwrap_or_else(|| (tag, "latest".to_string()));

            Image {
                id,
                parent_id,
                repository,
                tag,
                digest: img
                    .repo_digests
                    .and_then(|digests| digests.first().cloned())
                    .unwrap_or_else(|| "<none>".to_string()),
                created_at: img.created.to_string(),
                size: img.size.to_string(),
                shared_size: img.shared_size.unwrap_or(-1),
                containers: containers.to_string(),
            }
        })
        .collect())
}

fn inspect_image_parent(id: &str) -> Result<String, String> {
    let output = docker_api(&format!("/images/{}/json", id))?;
    let image: ApiImageInspect = serde_json::from_str(&output)
        .map_err(|e| format!("Failed to parse image inspect: {}", e))?;
    Ok(image.parent.unwrap_or_default())
}

pub fn inspect_networks() -> Result<Vec<Network>, String> {
    let output = docker_api("/networks")?;
    let networks: Vec<Network> =
        serde_json::from_str(&output).map_err(|e| format!("Failed to parse networks: {}", e))?;

    networks
        .into_iter()
        .map(|network| {
            let output = docker_api(&format!("/networks/{}", network.id))?;
            serde_json::from_str(&output)
                .map_err(|e| format!("Failed to parse network inspect: {}", e))
        })
        .collect()
}

pub fn list_volumes() -> Result<Vec<Volume>, String> {
    let output = docker_api("/volumes")?;
    let response: ApiVolumeList =
        serde_json::from_str(&output).map_err(|e| format!("Failed to parse volumes: {}", e))?;
    Ok(response.volumes.unwrap_or_default())
}

pub fn volume_container_map() -> Result<HashMap<String, Vec<String>>, String> {
    let output = docker_api("/containers/json?all=true")?;
    let containers: Vec<ApiContainer> =
        serde_json::from_str(&output).map_err(|e| format!("Failed to parse containers: {}", e))?;

    let mut owners: HashMap<String, Vec<String>> = HashMap::new();
    for container in containers {
        let name = container
            .names
            .first()
            .cloned()
            .unwrap_or(container.id)
            .trim_start_matches('/')
            .to_string();
        for mount in container.mounts.unwrap_or_default() {
            if let Some(volume_name) = mount.name {
                owners.entry(volume_name).or_default().push(name.clone());
            }
        }
    }

    Ok(owners)
}

pub fn network_container_map() -> Result<HashMap<String, Vec<NetworkAttachment>>, String> {
    let output = docker_api("/containers/json?all=true")?;
    let containers: Vec<ApiContainer> =
        serde_json::from_str(&output).map_err(|e| format!("Failed to parse containers: {}", e))?;

    let mut networks: HashMap<String, Vec<NetworkAttachment>> = HashMap::new();
    for container in containers {
        let container_id = container.id;
        let name = container
            .names
            .first()
            .cloned()
            .unwrap_or_else(|| container_id.clone())
            .trim_start_matches('/')
            .to_string();
        let Some(settings) = container.network_settings else {
            continue;
        };

        for (network_name, endpoint) in settings.networks.unwrap_or_default() {
            let attachment = NetworkAttachment {
                container_id: container_id.clone(),
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

pub fn start_container(id: &str) -> Result<(), String> {
    docker_status(&format!("docker start {}", sh_quote(id)))
}

pub fn stop_container(id: &str) -> Result<(), String> {
    docker_status(&format!("docker stop {}", sh_quote(id)))
}

pub fn restart_container(id: &str) -> Result<(), String> {
    docker_status(&format!("docker restart {}", sh_quote(id)))
}

pub fn remove_container(id: &str, force: bool) -> Result<(), String> {
    let flag = if force { "-f " } else { "" };
    docker_status(&format!("docker rm {}{}", flag, sh_quote(id)))
}

pub fn container_logs(id: &str, tail: usize) -> Result<Vec<String>, String> {
    let output = docker_output(&format!(
        "docker logs --timestamps --tail {} {} 2>&1",
        tail,
        sh_quote(id)
    ))?;
    Ok(output.lines().map(ToOwned::to_owned).collect())
}

pub async fn exec_container_stream(
    id: &str,
    command: &str,
    on_event: Channel<TerminalOutputEvent>,
) -> Result<(), String> {
    if command.trim().is_empty() {
        return Err("Command is empty".to_string());
    }

    let mut process = TokioCommand::new("wsl");
    process
        .args(["-e", "docker", "exec", id, "sh", "-lc", command])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    process.as_std_mut().creation_flags(CREATE_NO_WINDOW);

    let mut child = process
        .spawn()
        .map_err(|e| format!("Failed to execute wsl: {}", e))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture container stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture container stderr".to_string())?;

    let stdout_event = on_event.clone();
    let stderr_event = on_event.clone();
    let (stdout_result, stderr_result, status_result) = tokio::join!(
        forward_terminal_output(stdout, "stdout", stdout_event),
        forward_terminal_output(stderr, "stderr", stderr_event),
        child.wait(),
    );
    stdout_result?;
    stderr_result?;
    let status =
        status_result.map_err(|e| format!("Failed to wait for container command: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "Command exited with code {}",
            status
                .code()
                .map_or_else(|| "unknown".to_string(), |code| code.to_string())
        ))
    }
}

async fn forward_terminal_output<R>(
    mut reader: R,
    stream: &str,
    on_event: Channel<TerminalOutputEvent>,
) -> Result<(), String>
where
    R: AsyncRead + Unpin,
{
    let mut buffer = [0_u8; 4096];
    loop {
        let count = reader
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Failed to read container {}: {}", stream, e))?;
        if count == 0 {
            return Ok(());
        }
        emit_terminal_output(&on_event, stream, decode_command_output(&buffer[..count]));
    }
}

pub fn remove_image(id: &str, force: bool) -> Result<String, String> {
    let flag = if force { "-f " } else { "" };
    docker_output(&format!("docker image rm {}{}", flag, sh_quote(id)))
}

pub fn image_containers(id: &str) -> Result<Vec<ImageContainerRef>, String> {
    let target_id = normalize_image_id(id);
    Ok(list_containers(true)?
        .into_iter()
        .filter(|container| normalize_image_id(&container.image_id) == target_id)
        .map(|container| ImageContainerRef {
            id: container.id,
            image: container.image_id,
            names: container.names,
            state: container.state,
            status: container.status,
        })
        .collect())
}

pub fn prune_images() -> Result<String, String> {
    docker_output("docker image prune -f")
}

pub fn remove_network(id: &str) -> Result<(), String> {
    docker_status(&format!("docker network rm {}", sh_quote(id)))
}

pub fn remove_volume(name: &str, force: bool) -> Result<(), String> {
    let flag = if force { "-f " } else { "" };
    docker_status(&format!("docker volume rm {}{}", flag, sh_quote(name)))
}

pub fn prune_volumes() -> Result<String, String> {
    docker_output("docker volume prune -f")
}

pub fn size_to_bytes(size: &str) -> i64 {
    let compact = size.trim().replace(' ', "");
    let split_at = compact
        .find(|c: char| !(c.is_ascii_digit() || c == '.'))
        .unwrap_or(compact.len());
    let value = compact[..split_at].parse::<f64>().unwrap_or(0.0);
    let unit = compact[split_at..].to_ascii_lowercase();
    let multiplier = match unit.as_str() {
        "b" | "" => 1.0,
        "kb" | "kib" => 1024.0,
        "mb" | "mib" => 1024.0 * 1024.0,
        "gb" | "gib" => 1024.0 * 1024.0 * 1024.0,
        "tb" | "tib" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => 1.0,
    };
    (value * multiplier) as i64
}

pub fn percent(value: &str) -> f64 {
    value.trim().trim_end_matches('%').parse().unwrap_or(0.0)
}

pub fn mem_usage_parts(value: &str) -> (String, String) {
    let mut parts = value.split('/').map(str::trim);
    (
        parts.next().unwrap_or("N/A").to_string(),
        parts.next().unwrap_or("N/A").to_string(),
    )
}

fn docker_api(path: &str) -> Result<String, String> {
    docker_output(&format!(
        "curl --silent --show-error --fail --unix-socket /var/run/docker.sock {}",
        sh_quote(&format!("http://localhost{}", path))
    ))
}

fn docker_output(command: &str) -> Result<String, String> {
    let wrapped_command = format!(
        "timeout {} sh -c {}",
        DOCKER_COMMAND_TIMEOUT_SECONDS,
        sh_quote(command)
    );
    let mut command = Command::new("wsl");
    command.args(["-e", "sh", "-c", &wrapped_command]);

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .map_err(|e| format!("Failed to execute wsl: {}", e))?;

    let stdout = decode_command_output(&output.stdout);
    let stderr = decode_command_output(&output.stderr);
    if output.status.success() {
        Ok(stdout.trim().to_string())
    } else if output.status.code() == Some(124) {
        Err(format!(
            "Docker command timed out after {} seconds",
            DOCKER_COMMAND_TIMEOUT_SECONDS
        ))
    } else {
        let message = if stderr.trim().is_empty() {
            stdout
        } else {
            stderr
        };
        Err(message.trim().to_string())
    }
}

fn docker_status(command: &str) -> Result<(), String> {
    docker_output(command).map(|_| ())
}

fn decode_command_output(bytes: &[u8]) -> String {
    match String::from_utf8(bytes.to_vec()) {
        Ok(value) => value,
        Err(_) => {
            #[cfg(target_os = "windows")]
            {
                let (decoded, _, _) = encoding_rs::GBK.decode(bytes);
                decoded.into_owned()
            }
            #[cfg(not(target_os = "windows"))]
            {
                String::from_utf8_lossy(bytes).into_owned()
            }
        }
    }
}

fn sh_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}
