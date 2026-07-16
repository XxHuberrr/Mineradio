# Mineradio 快速补丁签名

更新时间：2026-07-16

## 安全边界

快速补丁会直接覆盖应用目录中的 JavaScript、HTML、资源和配置文件，因此从本轮开始必须使用 Ed25519 非对称签名。

- 应用只内置公钥，不保存私钥。
- 私钥必须放在仓库和应用目录之外，并进行离线备份。
- 未签名、签名损坏、未知 `keyId`、非 Ed25519 或未配置可信公钥的补丁一律拒绝。
- 补丁签名验证必须在解析版本和写入任何文件之前完成。
- 签名通过后仍要先对全部文件做路径、编码、大小和哈希预检；任何一项失败都不得开始写入。
- 目标路径必须逐级拒绝符号链接和 Windows 目录联接，真实解析结果必须留在应用根目录内；每个文件实际写入前必须再次检查。
- 预检时记录目标文件身份；目标在开始应用前或替换前发生新增、删除或替换时必须返回 `PATCH_TARGET_CHANGED`，禁止静默覆盖并发产生的本地修改。
- `.mineradio-patch` 和 `.mineradio-restore` 是内部事务后缀，不得作为补丁目标文件名。
- 写入过程中发生文件系统错误时，必须恢复已覆盖文件、删除本轮新建文件，并清理由本任务创建且仍为空的目录；回滚不完整时停止继续使用快速补丁。
- 旧的未签名快速补丁不再兼容；用户应改用完整安装包。
- 本机制只保护快速补丁，不替代 Windows 安装包代码签名和安装包哈希校验。

## 签名格式

签名文件是一个 JSON 信封：

```json
{
  "type": "mineradio-resource-patch-envelope-v1",
  "payload": {
    "type": "mineradio-resource-patch",
    "from": "1.1.1",
    "to": "1.1.2",
    "restartRequired": true,
    "files": []
  },
  "signature": {
    "algorithm": "ed25519",
    "keyId": "release-2026",
    "value": "BASE64_SIGNATURE"
  }
}
```

签名对象是 `payload` 的稳定 canonical JSON 字节。对象键按字典序排列，数组顺序保持不变。发布时必须使用仓库内的 `scripts/sign-update-patch.js`，不要自己拼接签名字节。

## 首次建立发布密钥

在受控的发布环境执行：

```powershell
openssl genpkey -algorithm Ed25519 -out E:\MineradioSecrets\update-private-2026.pem
openssl pkey -in E:\MineradioSecrets\update-private-2026.pem -pubout -out E:\MineradioSecrets\update-public-2026.pem
```

要求：

1. `update-private-2026.pem` 不得复制到源码仓库、应用目录、GitHub Release、网盘公开目录或日志中。
2. 至少准备一份离线加密备份，并记录 `keyId`。
3. 将公钥 PEM 内容加入 `package.json` 的 `mineradio.update.patchSigningKeys`：

```json
{
  "patchSigningKeys": {
    "release-2026": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
  }
}
```

当前 `patchSigningKeys` 为空时，客户端不会展示快速补丁入口，并会拒绝启动补丁任务。

也可在测试环境通过以下变量临时配置：

- `MINERADIO_UPDATE_PATCH_SIGNING_KEYS`：`keyId -> PEM` 的 JSON 对象。
- `MINERADIO_UPDATE_PATCH_PUBLIC_KEY`：单个 PEM 公钥。
- `MINERADIO_UPDATE_PATCH_KEY_ID`：单公钥对应的 `keyId`。

## 发布补丁

先生成未签名 payload，再执行：

```powershell
npm run sign:patch -- --input .\unsigned-patch.json --output .\Mineradio-1.1.1→1.1.2.patch.json --key E:\MineradioSecrets\update-private-2026.pem --key-id release-2026
```

随后：

1. 在隔离测试目录验证补丁内容和目标版本；同一补丁不得包含大小写不同但在 Windows 上指向同一目标的重复路径。
2. 执行 `npm run check`。
3. 计算并记录签名后整个补丁文件的 SHA256。
4. 上传签名后的信封文件，不上传未签名 payload 和私钥。
5. 用包含对应公钥的旧版本客户端实际下载、验证、应用并重启检查。
6. 人工制造一个不可写目标验证失败回滚；确认原文件已恢复、新文件和本轮新建空目录均未残留。
7. 在 Windows 测试目录创建指向应用目录外部的目录联接，确认补丁预检拒绝且外部文件未变化，再发布正式补丁。

补丁应用前的备份位于更新工作目录下的 `backups/patches/<job-id>/`。成功应用后保留该备份用于人工排查；自动回滚只处理当前补丁任务已经开始替换的文件和本任务创建的空目录，不递归删除已有目录或包含其他内容的目录。

## 密钥轮换

- 新公钥必须先通过完整安装包或旧可信密钥签名的补丁进入客户端，再使用新私钥发布补丁。
- 轮换期间可以同时保留旧、新两个公钥。
- 确认旧版本客户端迁移完成后再移除旧公钥。
- 私钥疑似泄露时立即停止快速补丁发布，撤销相关 Release 资产，并改用完整安装包分发新公钥。
