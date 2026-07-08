# WSL Docker Manager

WSL Docker Manager 是一个用于管理 Docker 资源的 Windows 桌面应用，重点面向运行在 WSL 内的 Docker Engine。项目基于 Tauri 2、React、TypeScript 和 Rust 构建。

## 功能特性

- 仪表盘：查看 Docker 连接状态、引擎信息、资源占用和最近的命令执行记录。
- 容器管理：查看、启动、停止、重启、删除容器，支持批量操作。
- 容器日志：查看容器日志输出。
- 容器终端：在容器内执行简单命令。
- 容器元数据：为容器设置分组，并保存常用服务 URL，便于快速打开。
- 镜像管理：查看镜像、删除镜像、批量删除镜像、清理悬空镜像。
- 网络管理：查看 Docker 网络以及关联容器。
- 数据卷管理：查看数据卷、删除数据卷、批量删除数据卷、清理孤立数据卷。
- 双连接模式：
  - `WSL`：通过 `wsl.exe` 在 WSL 中执行 Docker 命令，并访问 WSL 内的 Docker Socket。
  - `Direct`：从 Windows 侧直连 Docker，优先使用默认 Docker 配置，也支持 `tcp://localhost:2375`。
- 系统托盘：支持显示/隐藏窗口、启动所有容器、停止所有容器和退出应用。
- 支持深色/浅色主题和多语言界面。

## 环境要求

- Windows 系统。
- WebView2 Runtime。
- Node.js 和 npm。
- Rust 工具链及 Cargo。
- Microsoft Visual Studio Build Tools，包含 MSVC C++ 工具链和 Windows SDK。
- 使用默认 `WSL` 模式时，需要安装并配置 WSL。
- WSL 内需要可访问 Docker Engine；如果使用 `Direct` 模式，则 Docker 需要能从 Windows 侧访问。

在 `WSL` 模式下，应用默认使用 Windows 的 `wsl.exe` 进入默认 WSL 发行版，并在其中访问 Docker。

## 安装依赖

```powershell
npm install
```

## 开发运行

启动 Tauri 开发模式：

```powershell
npm run tauri -- dev
```

如果你的 Rust、Cargo 或 MSVC 工具链安装在自定义路径，需要先配置相关环境变量，或按本机环境调整 `dev.ps1`。当前仓库中的 `dev.ps1` 是针对特定 Windows 工具链路径的本地辅助脚本。

## 构建

仅构建前端：

```powershell
npm run build
```

构建桌面应用、安装包和 release 可执行文件：

```powershell
npm run tauri -- build
```

构建产物位于：

```text
src-tauri/target/release/
src-tauri/target/release/bundle/
```

## 项目结构

```text
.
|-- public/                 前端静态资源
|-- src/                    React 前端源码
|   |-- components/         页面与 UI 组件
|   |-- hooks/              Docker 轮询与 Tauri 调用逻辑
|   |-- store/              Zustand 全局状态
|   `-- types/              前端类型定义
|-- src-tauri/              Tauri / Rust 后端
|   |-- src/commands/       暴露给前端调用的 Tauri 命令
|   |-- src/docker.rs       Windows 侧直连 Docker 的实现
|   |-- src/wsl_docker.rs   WSL Docker 命令/API 调用实现
|   |-- src/tray.rs         系统托盘逻辑
|   `-- tauri.conf.json     Tauri 应用与打包配置
`-- package.json            前端依赖与脚本
```

## 运行说明

- 应用默认使用 `WSL` 连接模式。
- Release 版本中，WSL Docker 命令会隐藏控制台窗口执行，避免反复弹出 PowerShell 或终端窗口。
- 容器分组和 URL 元数据会保存到应用数据目录中的 `container-meta.json`。
- 删除容器、镜像、网络、数据卷等危险操作会通过确认弹窗二次确认。
- `Direct` 模式依赖 Windows 侧 Docker 连接能力；如果 Docker 未暴露 TCP 或默认 Socket 不可用，请切回 `WSL` 模式。

## 常用命令

```powershell
npm install
npm run build
npm run tauri -- dev
npm run tauri -- build
```
