use crate::docker::{RemoteAuthType, RemoteProfile};
use crate::wsl_docker::{
    Container, Image, ImageContainerRef, Info, Network, NetworkAttachment, ResourceStats, Stats,
    Volume,
};
use serde::Deserialize;
use ssh2::Session;
use std::collections::HashMap;
use std::io::Read;
use std::net::TcpStream;
use std::path::Path;
use std::time::Duration;

const REMOTE_COMMAND_TIMEOUT_SECONDS: u64 = 25;

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RemoteContainerRow {
    #[serde(rename = "ID")]
    id: String,
    image: String,
    #[serde(default, alias = "ImageID", alias = "ImageId")]
    image_id: String,
    command: String,
    created_at: String,
    state: String,
    status: String,
    names: String,
    #[serde(default)]
    ports: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RemoteImageRow {
    #[serde(rename = "ID")]
    id: String,
    repository: String,
    tag: String,
    digest: String,
    created_at: String,
    size: String,
    containers: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RemoteContainerInspect {
    id: String,
    name: String,
    mounts: Option<Vec<RemoteMount>>,
    network_settings: Option<RemoteNetworkSettings>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RemoteMount {
    name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RemoteNetworkSettings {
    networks: Option<HashMap<String, RemoteEndpointSettings>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RemoteEndpointSettings {
    #[serde(rename = "NetworkID")]
    network_id: Option<String>,
    #[serde(rename = "IPAddress")]
    ip_address: Option<String>,
    #[serde(rename = "GlobalIPv6Address")]
    global_ipv6_address: Option<String>,
}

pub fn test_connection(profile: &RemoteProfile) -> Result<String, String> {
    docker_output(profile, "docker version --format '{{.Server.Version}}'")
        .map(|version| format!("Docker {}", version.trim()))
}

pub fn info(profile: &RemoteProfile) -> Result<Info, String> {
    let output = docker_output(profile, "docker info --format '{{json .}}'")?;
    serde_json::from_str(&output).map_err(|e| format!("Failed to parse remote docker info: {}", e))
}

pub fn list_containers(profile: &RemoteProfile, all: bool) -> Result<Vec<Container>, String> {
    let all_flag = if all { "-a " } else { "" };
    let output = docker_output(
        profile,
        &format!("docker ps {}--no-trunc --format '{{{{json .}}}}'", all_flag),
    )?;
    if output.trim().is_empty() {
        return Ok(Vec::new());
    }
    output
        .lines()
        .map(|line| {
            let row: RemoteContainerRow = serde_json::from_str(line)
                .map_err(|e| format!("Failed to parse remote container: {}", e))?;
            Ok(Container {
                id: row.id,
                image: row.image,
                image_id: row.image_id,
                command: row.command,
                created_at: row.created_at,
                state: row.state,
                status: row.status,
                names: row.names,
                ports: row.ports,
            })
        })
        .collect()
}

pub fn container_stats(profile: &RemoteProfile, id: &str) -> Result<Stats, String> {
    let output = docker_output(
        profile,
        &format!(
            "docker stats --no-stream --format '{{{{json .}}}}' {}",
            sh_quote(id)
        ),
    )?;
    serde_json::from_str(&output)
        .map_err(|e| format!("Failed to parse remote container stats: {}", e))
}

pub fn resource_stats(profile: &RemoteProfile) -> Result<ResourceStats, String> {
    let output = docker_output(
        profile,
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
    serde_json::from_str(&output)
        .map_err(|e| format!("Failed to parse remote resources: {}", e))
}

pub fn list_images(profile: &RemoteProfile) -> Result<Vec<Image>, String> {
    let output = docker_output(
        profile,
        "docker image ls -a --no-trunc --format '{{json .}}'",
    )?;
    if output.trim().is_empty() {
        return Ok(Vec::new());
    }

    output
        .lines()
        .map(|line| {
            let row: RemoteImageRow = serde_json::from_str(line)
                .map_err(|e| format!("Failed to parse remote image: {}", e))?;
            let parent_id = inspect_image_parent(profile, &row.id).unwrap_or_default();
            Ok(Image {
                id: row.id,
                parent_id,
                repository: row.repository,
                tag: row.tag,
                digest: row.digest,
                created_at: row.created_at,
                size: row.size,
                containers: row.containers,
            })
        })
        .collect()
}

fn inspect_image_parent(profile: &RemoteProfile, id: &str) -> Result<String, String> {
    docker_output(
        profile,
        &format!(
            "docker image inspect --format '{{{{.Parent}}}}' {}",
            sh_quote(id)
        ),
    )
}

pub fn inspect_networks(profile: &RemoteProfile) -> Result<Vec<Network>, String> {
    let output = docker_output(
        profile,
        "ids=$(docker network ls -q); [ -z \"$ids\" ] && printf '[]' || docker network inspect $ids",
    )?;
    serde_json::from_str(&output)
        .map_err(|e| format!("Failed to parse remote networks: {}", e))
}

pub fn list_volumes(profile: &RemoteProfile) -> Result<Vec<Volume>, String> {
    let output = docker_output(
        profile,
        "ids=$(docker volume ls -q); [ -z \"$ids\" ] && printf '[]' || docker volume inspect $ids",
    )?;
    serde_json::from_str(&output)
        .map_err(|e| format!("Failed to parse remote volumes: {}", e))
}

pub fn volume_container_map(profile: &RemoteProfile) -> Result<HashMap<String, Vec<String>>, String> {
    let containers = inspect_containers(profile)?;
    let mut owners: HashMap<String, Vec<String>> = HashMap::new();
    for container in containers {
        let name = container.name.trim_start_matches('/').to_string();
        for mount in container.mounts.unwrap_or_default() {
            if let Some(volume_name) = mount.name {
                owners.entry(volume_name).or_default().push(name.clone());
            }
        }
    }
    Ok(owners)
}

pub fn network_container_map(
    profile: &RemoteProfile,
) -> Result<HashMap<String, Vec<NetworkAttachment>>, String> {
    let containers = inspect_containers(profile)?;
    let mut networks: HashMap<String, Vec<NetworkAttachment>> = HashMap::new();

    for container in containers {
        let container_id = container.id;
        let name = container.name.trim_start_matches('/').to_string();
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

fn inspect_containers(profile: &RemoteProfile) -> Result<Vec<RemoteContainerInspect>, String> {
    let output = docker_output(
        profile,
        "ids=$(docker ps -aq); [ -z \"$ids\" ] && printf '[]' || docker inspect $ids",
    )?;
    serde_json::from_str(&output)
        .map_err(|e| format!("Failed to parse remote container inspect: {}", e))
}

pub fn start_container(profile: &RemoteProfile, id: &str) -> Result<(), String> {
    docker_status(profile, &format!("docker start {}", sh_quote(id)))
}

pub fn stop_container(profile: &RemoteProfile, id: &str) -> Result<(), String> {
    docker_status(profile, &format!("docker stop {}", sh_quote(id)))
}

pub fn restart_container(profile: &RemoteProfile, id: &str) -> Result<(), String> {
    docker_status(profile, &format!("docker restart {}", sh_quote(id)))
}

pub fn remove_container(profile: &RemoteProfile, id: &str, force: bool) -> Result<(), String> {
    let flag = if force { "-f " } else { "" };
    docker_status(profile, &format!("docker rm {}{}", flag, sh_quote(id)))
}

pub fn container_logs(profile: &RemoteProfile, id: &str, tail: usize) -> Result<Vec<String>, String> {
    let output = docker_output(
        profile,
        &format!(
            "docker logs --timestamps --tail {} {} 2>&1",
            tail,
            sh_quote(id)
        ),
    )?;
    Ok(output.lines().map(ToOwned::to_owned).collect())
}

pub fn exec_container(profile: &RemoteProfile, id: &str, cmd: &[String]) -> Result<String, String> {
    if cmd.is_empty() {
        return Err("Command is empty".to_string());
    }
    let quoted_cmd = cmd.iter().map(|part| sh_quote(part)).collect::<Vec<_>>().join(" ");
    docker_output(profile, &format!("docker exec {} {}", sh_quote(id), quoted_cmd))
}

pub fn remove_image(profile: &RemoteProfile, id: &str, force: bool) -> Result<String, String> {
    let flag = if force { "-f " } else { "" };
    docker_output(profile, &format!("docker image rm {}{}", flag, sh_quote(id)))
}

pub fn image_containers(profile: &RemoteProfile, id: &str) -> Result<Vec<ImageContainerRef>, String> {
    let output = docker_output(
        profile,
        &format!(
            "docker ps -a --no-trunc --filter ancestor={} --format '{{{{json .}}}}'",
            sh_quote(id)
        ),
    )?;
    if output.trim().is_empty() {
        return Ok(Vec::new());
    }
    output
        .lines()
        .map(|line| {
            serde_json::from_str(line)
                .map_err(|e| format!("Failed to parse remote image container: {}", e))
        })
        .collect()
}

pub fn prune_images(profile: &RemoteProfile) -> Result<String, String> {
    docker_output(profile, "docker image prune -f")
}

pub fn remove_network(profile: &RemoteProfile, id: &str) -> Result<(), String> {
    docker_status(profile, &format!("docker network rm {}", sh_quote(id)))
}

pub fn remove_volume(profile: &RemoteProfile, name: &str, force: bool) -> Result<(), String> {
    let flag = if force { "-f " } else { "" };
    docker_status(profile, &format!("docker volume rm {}{}", flag, sh_quote(name)))
}

pub fn prune_volumes(profile: &RemoteProfile) -> Result<String, String> {
    docker_output(profile, "docker volume prune -f")
}

fn docker_output(profile: &RemoteProfile, command: &str) -> Result<String, String> {
    let wrapped_command = format!(
        "{}timeout {} sh -c {}",
        docker_host_prefix(profile),
        REMOTE_COMMAND_TIMEOUT_SECONDS,
        sh_quote(command)
    );
    let mut channel = connect(profile)?.channel_session().map_err(|e| e.to_string())?;
    channel.exec(&wrapped_command).map_err(|e| e.to_string())?;

    let mut stdout = String::new();
    let mut stderr = String::new();
    channel
        .read_to_string(&mut stdout)
        .map_err(|e| format!("Failed to read remote stdout: {}", e))?;
    channel
        .stderr()
        .read_to_string(&mut stderr)
        .map_err(|e| format!("Failed to read remote stderr: {}", e))?;
    channel.wait_close().map_err(|e| e.to_string())?;

    let status = channel.exit_status().map_err(|e| e.to_string())?;
    if status == 0 {
        Ok(stdout.trim().to_string())
    } else if status == 124 {
        Err(format!(
            "Remote Docker command timed out after {} seconds",
            REMOTE_COMMAND_TIMEOUT_SECONDS
        ))
    } else {
        let message = if stderr.trim().is_empty() { stdout } else { stderr };
        Err(message.trim().to_string())
    }
}

fn docker_status(profile: &RemoteProfile, command: &str) -> Result<(), String> {
    docker_output(profile, command).map(|_| ())
}

fn connect(profile: &RemoteProfile) -> Result<Session, String> {
    let address = format!("{}:{}", profile.host.trim(), profile.port);
    let tcp = TcpStream::connect(address).map_err(|e| format!("Failed to connect SSH: {}", e))?;
    tcp.set_read_timeout(Some(Duration::from_secs(REMOTE_COMMAND_TIMEOUT_SECONDS + 5)))
        .map_err(|e| e.to_string())?;
    tcp.set_write_timeout(Some(Duration::from_secs(REMOTE_COMMAND_TIMEOUT_SECONDS + 5)))
        .map_err(|e| e.to_string())?;

    let mut session = Session::new().map_err(|e| e.to_string())?;
    session.set_tcp_stream(tcp);
    session.handshake().map_err(|e| format!("SSH handshake failed: {}", e))?;

    match profile.auth_type {
        RemoteAuthType::Password => {
            let password = profile.password.as_deref().unwrap_or_default();
            session
                .userauth_password(&profile.username, password)
                .map_err(|e| format!("SSH password auth failed: {}", e))?;
        }
        RemoteAuthType::PrivateKey => {
            let Some(path) = profile.private_key_path.as_ref() else {
                return Err("Private key path is required".to_string());
            };
            session
                .userauth_pubkey_file(
                    &profile.username,
                    None,
                    Path::new(path),
                    profile.passphrase.as_deref(),
                )
                .map_err(|e| format!("SSH private key auth failed: {}", e))?;
        }
    }

    if !session.authenticated() {
        return Err("SSH authentication failed".to_string());
    }
    Ok(session)
}

fn sh_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn docker_host_prefix(profile: &RemoteProfile) -> String {
    let socket = profile
        .docker_socket
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("/var/run/docker.sock");
    let docker_host = if socket.contains("://") {
        socket.to_string()
    } else {
        format!("unix://{}", socket)
    };
    format!("DOCKER_HOST={} ", sh_quote(&docker_host))
}
