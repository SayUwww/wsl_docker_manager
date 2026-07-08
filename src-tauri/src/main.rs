#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    wsl_docker_manager_lib::run()
}
