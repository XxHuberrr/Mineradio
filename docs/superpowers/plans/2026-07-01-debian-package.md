# Debian Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Mineradio 增加独立的 x64 Debian 包构建命令，并完成不影响现有 AppImage 的真实安装验证。

**Architecture:** 继续使用 electron-builder 的 Linux 配置，默认 target 保持 AppImage；通过独立 npm 脚本显式选择 deb。配置测试锁定命令和兼容边界，产物测试使用 Debian 原生工具与真实 apt 安装流程。

**Tech Stack:** Node.js 24、npm、electron-builder、node:test、dpkg-deb、apt、Xvfb

---

### Task 1: Lock Debian Build Configuration

**Files:**
- Modify: `test/package-config.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing configuration test**

Add assertions for these exact scripts and Linux fields:

```js
assert.equal(packageJson.scripts['build:linux'], 'npm run build:linux:appimage');
assert.equal(packageJson.scripts['build:linux:appimage'], 'electron-builder --linux AppImage');
assert.equal(packageJson.scripts['build:linux:deb'], 'electron-builder --linux deb');
assert.match(packageJson.build.linux.maintainer, /^.+ <[^<>\s]+@[^<>\s]+>$/);
assert.deepEqual(packageJson.build.linux.target, [{ target: 'AppImage', arch: ['x64'] }]);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/package-config.test.js`

Expected: FAIL because the explicit AppImage/deb scripts and maintainer are absent.

- [ ] **Step 3: Add the minimal package configuration**

Set the Linux scripts to:

```json
"build:linux": "npm run build:linux:appimage",
"build:linux:appimage": "electron-builder --linux AppImage",
"build:linux:deb": "electron-builder --linux deb"
```

Add this field under `build.linux`:

```json
"maintainer": "XxHuberrr <281847693+XxHuberrr@users.noreply.github.com>"
```

- [ ] **Step 4: Run the full test suite and syntax checks**

Run: `npm test && node --check server.js && node --check desktop/main.js && git diff --check`

Expected: all tests and checks pass.

### Task 2: Build and Inspect the Debian Artifact

**Files:**
- Generated and ignored: `dist/Mineradio-1.1.1.deb`

- [ ] **Step 1: Build with Node.js 24**

Run: `PATH="/home/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" npm run build:linux:deb`

Expected: electron-builder creates `dist/Mineradio-1.1.1.deb`.

- [ ] **Step 2: Validate metadata and package contents**

Run: `dpkg-deb -f dist/Mineradio-1.1.1.deb Package Version Architecture Maintainer`

Expected: package `mineradio`, version `1.1.1`, architecture `amd64`, and a non-empty maintainer.

Run: `dpkg-deb -c dist/Mineradio-1.1.1.deb`

Expected: package contains an application executable, `.desktop` entry, PNG icon, and `resources/app/platform-utils.js`.

### Task 3: Install, Launch, and Remove Without Touching AppImage

**Files:**
- Verify unchanged: `~/.local/bin/Mineradio.AppImage`
- Verify unchanged: `~/.local/share/applications/Mineradio.desktop`

- [ ] **Step 1: Record AppImage baseline hashes**

Run: `sha256sum ~/.local/bin/Mineradio.AppImage ~/.local/share/applications/Mineradio.desktop`

Expected: both files exist and produce hashes.

- [ ] **Step 2: Install the Debian package**

Run: `sudo apt install -y ./dist/Mineradio-1.1.1.deb`

Expected: package `mineradio` is installed successfully.

- [ ] **Step 3: Launch the installed executable under Xvfb**

Read the `Exec` value from `/usr/share/applications/Mineradio.desktop`, launch it under Xvfb, and poll `http://127.0.0.1:3000/api/app/version`.

Expected: endpoint reports Mineradio version `1.1.1`.

- [ ] **Step 4: Remove the Debian package**

Run: `sudo apt remove -y mineradio`

Expected: `dpkg-query` no longer reports the package as installed.

- [ ] **Step 5: Verify the AppImage baseline is unchanged**

Run the same `sha256sum` command from Step 1 and compare exact output.

Expected: both hashes match the baseline.

### Task 4: Commit, Push, and Update PR #203

**Files:**
- Modify: `package.json`
- Modify: `test/package-config.test.js`
- Modify: PR #203 body

- [ ] **Step 1: Review and commit the implementation**

Run: `git diff --check && git status --short`

Commit message: `build(linux): add Debian package target`

- [ ] **Step 2: Push the existing feature branch**

Run: `git push origin feat/linux-appimage-support`

- [ ] **Step 3: Update the Chinese PR body**

Document `npm run build:linux:appimage`, `npm run build:linux:deb`, Debian metadata checks, actual installation, launch, removal, and AppImage hash preservation.
