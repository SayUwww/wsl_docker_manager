export function describeDockerCommand(command: string, args?: Record<string, unknown>): string {
  switch (command) {
    case 'get_docker_status':
      return 'docker info';
    case 'get_resource_stats':
      return 'cat /proc/stat /proc/meminfo && df -B1 /';
    case 'get_connection_mode':
      return 'read connection mode';
    case 'set_connection_mode':
      return `set connection mode ${String(args?.mode ?? '')}`.trim();
    case 'list_containers':
      return args?.all === false ? 'docker ps' : 'docker ps -a';
    case 'start_container':
      return `docker start ${quoteArg(args?.id)}`;
    case 'stop_container':
      return `docker stop ${quoteArg(args?.id)}`;
    case 'restart_container':
      return `docker restart ${quoteArg(args?.id)}`;
    case 'remove_container':
      return `docker rm ${args?.force ? '-f ' : ''}${quoteArg(args?.id)}`;
    case 'batch_start_containers':
      return `docker start ${joinIds(args?.ids)}`;
    case 'batch_stop_containers':
      return `docker stop ${joinIds(args?.ids)}`;
    case 'batch_restart_containers':
      return `docker restart ${joinIds(args?.ids)}`;
    case 'batch_remove_containers':
      return `docker rm ${args?.force ? '-f ' : ''}${joinIds(args?.ids)}`;
    case 'get_container_logs':
      return `docker logs --timestamps --tail ${String(args?.tail ?? '')} ${quoteArg(args?.id)}`.trim();
    case 'exec_container':
      return `docker exec ${quoteArg(args?.id)} ${joinCommand(args?.cmd)}`.trim();
    case 'update_container_meta':
      return `update metadata ${quoteArg(args?.id)}`;
    case 'list_images':
      return 'docker image ls -a';
    case 'remove_image':
      return `docker image rm ${args?.force ? '-f ' : ''}${quoteArg(args?.id)}`;
    case 'prune_images':
      return 'docker image prune -f';
    case 'list_networks':
      return 'docker network ls';
    case 'remove_network':
      return `docker network rm ${quoteArg(args?.id)}`;
    case 'list_volumes':
      return 'docker volume ls';
    case 'remove_volume':
      return `docker volume rm ${args?.force ? '-f ' : ''}${quoteArg(args?.name)}`;
    case 'prune_volumes':
      return 'docker volume prune -f';
    default:
      return command;
  }
}

function joinIds(value: unknown): string {
  return Array.isArray(value) ? value.map(quoteArg).join(' ') : quoteArg(value);
}

function joinCommand(value: unknown): string {
  return Array.isArray(value) ? value.map(quoteArg).join(' ') : quoteArg(value);
}

function quoteArg(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return /^[A-Za-z0-9_.:/@-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\"'\"'")}'`;
}
