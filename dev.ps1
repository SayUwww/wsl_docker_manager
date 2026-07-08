# WSL Docker Manager - 开发模式启动脚本 (PowerShell)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$env:RUSTUP_HOME = "E:/rustup"
$env:CARGO_HOME = "E:/cargo"
$env:PATH = "$env:CARGO_HOME/bin;$env:PATH"

$MSVC = "E:/vs_buildtools/VC/Tools/MSVC/14.44.35207"
$SDK_BASE = "C:/Program Files (x86)/Windows Kits/10"
$SDK_VER = "10.0.26100.0"

$env:PATH = "$MSVC/bin/Hostx64/x64;$env:PATH"
$env:LIB = "$MSVC/lib/x64;$SDK_BASE/Lib/$SDK_VER/um/x64;$SDK_BASE/Lib/$SDK_VER/ucrt/x64"
$env:INCLUDE = "$MSVC/include;$SDK_BASE/Include/$SDK_VER/um;$SDK_BASE/Include/$SDK_VER/ucrt;$SDK_BASE/Include/$SDK_VER/shared"

Set-Location $ScriptDir
npx tauri dev
