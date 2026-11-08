# AGENT_PROTOCOL — 多 Agent 协作规约

本仓库由多个 AI Agent 会话（Hermes / WorkBuddy 等）共同维护。
它们**不能互相通信**，只能通过 git 仓库感知彼此。以下是强制规约，违反会导致别人的修复被静默回滚（已发生过多次）。

## 分工

| 角色 | 负责 | 不碰 |
|---|---|---|
| 写代码的会话（WorkBuddy 等） | `src/`、`tests/`、`clients/mobile/src/`、文档 | 构建链、CI、Gradle 配置 |
| 打包/发布的会话 | `.github/workflows/`、`clients/mobile/android/`（Gradle、manifest、res）、`vite.config.ts`、蒲公英发布 | 业务逻辑实现 |

## 推送规则（强制）

1. **推送前必须 `git fetch` 并检查远端 head**：
   ```bash
   git fetch origin
   git log HEAD..origin/main --oneline   # 有输出说明别人推过新东西
   git pull --rebase origin main         # 先整合再推送
   ```
   直接 push 失败出现 `non-fast-forward` 时，**绝不**用 `--force`。
2. **工作副本必须先同步再改**。开工前 `git pull`；不要在几天前的旧副本上直接提交推送。

## 关键修复点（不得回滚清单）

这些是历史踩坑换来的，任何提交如果 diff 中出现以下内容被回退，先停下来想：

| 文件 | 必须保持的状态 | 为什么 |
|---|---|---|
| `clients/mobile/vite.config.ts` | `conditions` 数组**不含** `'node'`；`node:fs/path/module` alias 到 `src/node-fs-stub.ts` | 含 `'node'` 会让 sqlite-wasm 解析到 Node 构建，WebView 里 `createRequire('node:fs')` 命中 stub 抛错，初始化全挂 |
| `clients/mobile/src/maodou.ts` | `directory: Directory.Data`（**不是** `Directory.Documents`） | Documents 是公共存储，Android 需运行时权限，App 未申请 → writeFile 被拒 → 保存无反应 |
| `clients/mobile/android/settings.gradle` | `apply from: 'capacitor.settings.gradle'` | 不 include 则插件原生代码不进 APK → `"Filesystem" plugin is not implemented` |
| `clients/mobile/android/app/build.gradle` | 末尾 `apply from: "capacitor.build.gradle"`；含 `androidx.appcompat` 依赖 | 同上（插件接线）；BridgeActivity 编译需要 AppCompatActivity |
| `clients/mobile/android/gradle.properties` | `android.useAndroidX=true` | 缺了 checkDebugAarMetadata 直接失败 |
| `clients/mobile/node-fs-stub.ts`（及其导出） | 存在于 `clients/mobile/src/`，导出 existsSync/readFileSync/writeFileSync/mkdirSync/readdirSync/statSync/unlinkSync/dirname/join | 打包器解析内核对 node 内置模块的静态引用必需 |
| `.github/workflows/android.yml` | 存在；Gradle pin 8.5；npm install 步骤同时装**根目录**和 `clients/mobile` 依赖 | runner 自带 Gradle 9 不兼容 AGP 8.2；sqlite-wasm 经 `file:` 依赖 hoist 到根 node_modules |

## 构建与发布流程

```bash
# 1. 内核测试
npm test && npm run typecheck
# 2. web 构建 + 同步进安卓工程
cd clients/mobile && npm run build && npx cap sync android
# 3. push 后 GitHub Actions 自动打 APK（本机网络下载大文件必截断，勿本机 Gradle）
# 4. 打包会话从 Actions Artifacts 取 APK 传蒲公英：https://www.pgyer.com/maodoubiji（短链覆盖更新）
```

## 沟通

- 有跨会话需要对方知道的决策 → 写进本文件，不要只写在自己的会话记忆里。
- 改动构建产物（`assets/public/`）会频繁造成合并冲突：能不提交就不提交（CI 会重新生成）。
