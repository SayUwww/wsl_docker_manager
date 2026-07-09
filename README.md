# WSL Docker Manager

WSL Docker Manager 是一个面向 Windows 桌面的 Docker 管理工具，基于 Tauri 2、React、TypeScript 和 Rust 构建。它可以管理本机 WSL Docker、Windows 侧 Docker，以及通过 Rust 内置 SSH 连接到远程 Linux 服务器管理远程 Docker。

## 主要功能

- 仪表盘：查看 Docker 连接状态、Docker Engine 信息、系统资源、运行中/已停止容器概览和执行日志。
- 执行日志：记录实际执行的 Docker 指令，支持查看详细错误信息并重新执行。
- 容器管理：查看、搜索、筛选、启动、停止、重启、删除容器，支持批量操作。
- 容器分组：为容器配置分组，支持在容器页按分组快捷筛选。
- 容器快捷链接：为容器保存常用 URL，便于快速打开服务页面。
- 容器日志：查看容器日志输出，支持搜索、暂停、清空和导出。
- 容器终端：进入容器执行简单命令。
- 镜像管理：查看镜像、删除镜像、批量删除镜像、清理悬空镜像。
- 网络管理：查看 Docker 网络拓扑，删除自定义网络。
- 数据卷管理：查看数据卷、删除孤立数据卷、批量删除、清理孤立数据卷。
- 设置中心：集中管理连接模式、刷新时间、语言、主题、关闭按钮行为、开机自启和远程服务器配置。
- 系统托盘：支持显示主窗口、隐藏到托盘、刷新数据、打开设置和退出。
- 多语言与主题：支持中文、英文、日文，以及深色/浅色主题。

## 连接模式

### WSL

默认模式。应用通过 Windows 的 `wsl.exe` 在 WSL 内执行 Docker 命令，适合 Docker Engine 安装在 WSL 发行版中的场景。

要求：

- Windows 已安装 WSL。
- WSL 内可以正常执行 `docker` 命令。
- 当前 Windows 用户可以调用 `wsl.exe`。

### Direct

应用直接连接 Windows 侧 Docker。适合 Docker Desktop 或 Windows 本机 Docker 环境。

连接逻辑会优先使用默认 Docker 配置，也会尝试 `tcp://localhost:2375`。

### Remote

应用使用 Rust 内置 SSH 连接远程 Linux 服务器，在远程服务器上执行 Docker 命令。

支持：

- 密码认证。
- 私钥认证和 passphrase。
- 保存多个远程服务器配置。
- 选择、删除、测试远程服务器配置。
- 自定义 Docker socket，默认 `/var/run/docker.sock`。

注意：远程服务器登录信息会保存在应用数据目录的远程配置文件中，当前版本尚未接入系统 Keyring 加密存储。

## 设置说明

打开左侧栏底部的“设置”按钮，可以管理：

- 系统设置：连接模式、刷新时间、语言。
- 外观设置：主题、关闭按钮行为。
- 启动设置：开机自启。
- 远程设置：远程服务器列表、连接信息、认证方式、Docker socket、连接测试。

关闭按钮行为支持：

- 每次询问。
- 最小化到托盘。
- 直接退出应用。

## 加载与刷新机制

- 应用启动时会自动加载 Docker 状态、系统资源、容器、镜像、网络和数据卷。
- 切换连接模式后会自动刷新全部资源数据。
- Remote 模式下切换远程服务器或保存当前远程配置后，会自动重新读取远程数据。
- 容器、镜像、网络、数据卷页面支持手动刷新。
- 读取命令执行中会显示加载状态，并禁用重复刷新，避免重复执行命令造成不必要的资源消耗。

## 环境要求

- Windows 10/11。
- WebView2 Runtime。
- Node.js 和 npm。
- Rust 工具链和 Cargo。
- Microsoft Visual Studio Build Tools，包含 MSVC C++ 工具链和 Windows SDK。
- 使用 WSL 模式时，需要安装并配置 WSL 与 Docker。
- 使用 Remote 模式时，远程 Linux 服务器需要可通过 SSH 访问，并且远程用户可以执行 Docker 命令。

## 安装依赖

```powershell
npm install
```

## 开发运行

```powershell
npm run tauri -- dev
```

如果本机 Rust、Cargo 或 MSVC 不在默认路径中，可以参考项目中的 `dev.ps1`。该脚本记录了当前开发环境使用的 Rust、Cargo、MSVC、Windows SDK 路径配置。

## 构建

前端构建：

```powershell
npm run build
```

桌面应用构建：

```powershell
npm run tauri -- build
```

构建产物通常位于：

```text
src-tauri/target/release/
src-tauri/target/release/bundle/
```

## 项目结构

```text
.
|-- public/                 静态资源
|-- src/                    React 前端源码
|   |-- components/         页面和通用 UI 组件
|   |-- hooks/              Docker 数据刷新和 Tauri 调用逻辑
|   |-- store/              Zustand 全局状态
|   |-- types/              TypeScript 类型定义
|   `-- utils/              前端工具函数
|-- src-tauri/              Tauri / Rust 后端
|   |-- src/commands/       Tauri 命令入口
|   |-- src/docker.rs       Docker 状态、本地 Docker、配置存储
|   |-- src/wsl_docker.rs   WSL Docker 命令/API 调用
|   |-- src/remote_docker.rs Remote SSH Docker 调用
|   |-- src/tray.rs         系统托盘逻辑
|   `-- tauri.conf.json     Tauri 应用配置
|-- CHANGELOG.md            更新日志
|-- package.json            前端依赖和脚本
`-- dev.ps1                 本地开发环境辅助脚本
```

## 常见问题

### WSL 模式连接失败

确认 WSL 内可以执行：

```bash
docker version
docker ps
```

如果 WSL 内 Docker 未启动，需要先启动 Docker Engine 或 Docker Desktop 的 WSL 集成。

### Remote 模式连接成功但 Docker 命令失败

确认远程用户可以执行：

```bash
docker version
docker ps -a
```

如果提示权限不足，需要将远程用户加入 `docker` 组，或调整远程 Docker 权限。

## 常用命令

```powershell
npm install
npm run build
npm run tauri -- dev
npm run tauri -- build
```
