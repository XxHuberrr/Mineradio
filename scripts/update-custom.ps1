<#
  update-custom.ps1 — Mineradio 自定义功能分支更新器
  把上游官方更新重新套用到你的功能分支 (my-features)，并可选覆盖安装到 D:\Mineradio。
  流程: git fetch -> git rebase origin/main -> npm install -> npm run build:win:dir -> (可选) 覆盖安装
#>
param(
  [switch]$Deploy,   # 构建后覆盖安装到 D:\Mineradio
  [switch]$NoBuild   # 只 rebase，不构建
)
$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RepoRoot

# 必须在 my-features 分支
$branch = git rev-parse --abbrev-ref HEAD
if ($branch -ne 'my-features') { git checkout my-features }

# 工作区有未提交改动先拦住，避免 rebase 丢失
if (-not ((git status --porcelain) -eq '')) {
  Write-Host '!! 工作区有未提交改动，请先提交或 git stash 后再更新' -ForegroundColor Red
  exit 1
}

Write-Host '==> 拉取上游 origin/main'
git fetch origin

Write-Host '==> 将我的功能 rebase 到最新上游'
git rebase origin/main
if ($LASTEXITCODE -ne 0) {
  Write-Host '!! rebase 冲突，请手动解决后执行: git rebase --continue，再重跑本脚本' -ForegroundColor Red
  exit 1
}

if (-not $NoBuild) {
  Write-Host '==> 安装依赖'
  npm install
  Write-Host '==> 构建 windows 解压版 (dist\win-unpacked)'
  npm run build:win:dir
}

if ($Deploy) {
  $AppDir = 'D:\Mineradio'
  if (Test-Path "$AppDir\Mineradio.exe") {
    $p = Get-Process -Name 'Mineradio' -ErrorAction SilentlyContinue
    if ($p) { Write-Host '!! Mineradio 正在运行，请先完全退出软件(含托盘)再部署' -ForegroundColor Red; exit 1 }
  }
  $built = Join-Path $RepoRoot 'dist\win-unpacked'
  if (-not (Test-Path $built)) { Write-Host '!! 未找到构建产物 dist\win-unpacked，请去掉 -Deploy 先构建' -ForegroundColor Red; exit 1 }
  Write-Host "==> 覆盖安装到 $AppDir (离线歌曲在 D:\MineradioCache，不受影响)"
  Copy-Item -Path "$built\*" -Destination $AppDir -Recurse -Force
  Write-Host '==> 完成，重新打开 Mineradio 即可（自动更新已关闭）'
}
