# 发布与维护手册 · Publishing Guide

本手册带你从「一堆本地文件」走到「GitHub 上可被别人安装、可被搜索引擎搜到、有 Release 压缩包」的开源项目。
所有命令默认在 **Windows PowerShell** 下执行，macOS / Linux 把路径换掉即可。

> 环境参考：本仓库首次发布时使用 **Git 2.56 + Node.js 24 + Windows 11 PowerShell**。
> 如果你的终端提示找不到 `git`，先执行第 1 步。
>
> 仓库里已经准备好了双语 README、LICENSE、CHANGELOG、Issue/PR 模板和 CI 工作流，
> 因此第 3 步只是把这些文件提交为第一个 commit，不需要你从零编写。

---

## 目录

1. [安装 Git](#1-安装-git)
2. [一次性全局配置](#2-一次性全局配置)
3. [初始化本地仓库并提交](#3-初始化本地仓库并提交)
4. [在 GitHub 创建空仓库](#4-在-github-创建空仓库)
5. [关联远程仓库并首次推送](#5-关联远程仓库并首次推送)
6. [发布 v2.4.3 Release（自动打包）](#6-发布-v243-release自动打包)
7. [仓库美化设置](#7-仓库美化设置)
8. [发布后验收清单](#8-发布后验收清单)
9. [日常开发与发新版](#9-日常开发与发新版)
10. [常见报错排查](#10-常见报错排查)
11. [可选：更省事的替代路线](#11-可选更省事的替代路线)
12. [English quick checklist](#english-quick-checklist)

---

## 1. 安装 Git

### 方式 A：winget（推荐，最快）

以**普通用户**打开新的 PowerShell 窗口（不需要管理员），执行：

```powershell
winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
```

安装完成后**关闭并重新打开 PowerShell**（PATH 需要刷新），验证：

```powershell
git --version
# 期望输出类似：git version 2.51.0.windows.1
```

### 方式 B：官网安装包

1. 打开 <https://git-scm.com/download/win>，下载 64-bit 安装包；
2. 一路默认下一步即可，注意保留：
   - **Git from the command line and also from 3rd-party software**（写入 PATH）
   - **Use Git Credential Manager**（首次推送会弹浏览器登录）
   - **Checkout as-is, commit Unix-style line endings**（配合仓库里的 `.gitattributes`）
3. 安装完重开终端，`git --version` 验证。

### 方式 C：已有 GitHub Desktop

GitHub Desktop 自带 Git。安装后打开 `File → Options → Git`，点 `Show Git in PATH`，或直接用 GitHub Desktop 图形界面完成后面的步骤。

> **装完仍然提示「无法将 git 项识别为 cmdlet」？** 90% 是没重开终端；其次是 PATH 未写入，重新运行安装包选「Modify」勾选 PATH 选项。

---

## 2. 一次性全局配置

```powershell
# 1) 身份（会写进每一次 commit，请用你 GitHub 的邮箱；不想暴露真实邮箱可用 noreply 地址）
git config --global user.name "ShirakawaFM"
git config --global user.email "你的邮箱或 12345678+ShirakawaFM@users.noreply.github.com"

# 2) 默认分支名（与 GitHub 保持一致）
git config --global init.defaultBranch main

# 3) 中文文件名不再显示为 \344\270\255 这种转义
git config --global core.quotepath false

# 4) 让凭据管理器记住 GitHub 登录（Git for Windows 默认已开启）
git config --global credential.helper manager

# 5) 查看当前配置
git config --global --list
```

> `user.email` 建议用 GitHub 的 **noreply** 邮箱：GitHub → Settings → Emails → 勾选
> *Keep my email addresses private*，页面会给出 `ID+username@users.noreply.github.com` 形式地址。
> 这样公开仓库里不会泄露真实邮箱。

### 网络（中国大陆环境，可选）

如果 `git push` 长时间卡住或报 `Connection was reset`，先确认你的代理端口（Clash 常见 `7890`，v2rayN 常见 `10808`）：

```powershell
# 设置 HTTP/HTTPS 代理
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890

# 取消代理
git config --global --unset http.proxy
git config --global --unset https.proxy
```

> ⚠️ Windows 的「系统代理」（设置 → 网络和 Internet → 代理，Clash 常见 `127.0.0.1:7890`）**不会被 Git 自动继承**。
> 如果浏览器能打开 GitHub，但 `git push` 报 `Recv failure: Connection was reset`，就是 Git 在直连，
> 按上面的命令显式配置代理即可；也可以只对单次命令生效：
> `git -c http.proxy=http://127.0.0.1:7890 push origin main`。
>
> 代理只影响 Git，不会改系统设置。若代理软件没开，务必取消，否则所有 Git 操作都会失败。

---

## 3. 初始化本地仓库并提交

```powershell
cd F:\DEEEPSEEK\douyin-auto-hd

# 初始化仓库（默认分支 main）
git init -b main

# 确认 .gitignore 已生效：下面命令不应列出 *.zip / dist / node_modules
git status --short

# 加入全部文件
git add .

# 提交前再核对一次「将要提交的文件清单」
git status
git diff --cached --stat
```

**提交前自检（很重要，第一次开源最容易在这里翻车）：**

| 检查项 | 命令 / 方法 |
| --- | --- |
| 没有压缩包 / 构建产物 | `git status` 里不应出现 `*.zip`、`dist/`、`release/` |
| 没有密钥 / 本地配置 | 仓库里没有 `.env`、`*.key`、`secrets.json` |
| 版本号一致 | `manifest.json` 是 `2.4.3`，README 徽章、CHANGELOG 最新条目也是 `2.4.3` |
| 没有绝对路径 | 搜索 `F:\`、`C:\Users`，源码里不应出现 |
| 没有调试残留 | `content.js` 的 `DEBUG` 可以保留 `true`，但不要留 `debugger;` 断点 |

确认无误后提交：

```powershell
git commit -m "feat: 初始提交 — 抖音网页版自动最高画质 v2.4.3"
```

> 首次提交建议用 `feat:` 或 `chore:`，遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)。

---

## 4. 在 GitHub 创建空仓库

1. 打开 <https://github.com/new>；
2. 按下表填写：

   | 字段 | 值 |
   | --- | --- |
   | **Owner** | `ShirakawaFM` |
   | **Repository name** | `douyin-auto-hd` |
   | **Description** | `抖音网页版自动切换最高画质（4K/1080P）｜Auto-select the highest available quality on Douyin web. Chrome/Edge Manifest V3 extension, minimal permissions.` |
   | **Visibility** | `Public`（开源必须 Public） |
   | **Initialize this repository with** | **全部留空**：不要勾 README、不要加 .gitignore、不要选 License |

3. 点击 **Create repository**。

> ⚠️ 一定要建**空仓库**。如果勾了「Add a README file」，远程会先有一个 commit，你本地推送时就会遇到
> `Updates were rejected because the remote contains work...`，还要额外做一次合并。

创建成功后，页面会显示仓库地址，形如：

```text
https://github.com/ShirakawaFM/douyin-auto-hd.git
```

---

## 5. 关联远程仓库并首次推送

```powershell
# 在 F:\DEEEPSEEK\douyin-auto-hd 目录下
git remote add origin https://github.com/ShirakawaFM/douyin-auto-hd.git

# 核对（应输出 fetch / push 两行）
git remote -v

# 首次推送并建立跟踪关系
git push -u origin main
```

### 认证方式（三选一）

**① Git Credential Manager（默认，最省事）**

首次 `git push` 会弹出窗口，选择 `Sign in with your browser`，浏览器里登录 GitHub 并授权，之后会自动记住凭据。

**② Personal Access Token（PAT）**

GitHub 已不允许用账号密码推送。生成方式：

1. GitHub → 右上角头像 → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**；
2. **Generate new token (classic)**，勾选 `repo` 权限，有效期建议 90 天；
3. 复制生成的 token（只显示一次）；
4. 推送时用户名填 `ShirakawaFM`，**密码处粘贴 token**。

若之前输错过密码，Windows 会记住错误凭据，需要清掉：
`控制面板 → 凭据管理器 → Windows 凭据 → 找到 git:https://github.com → 删除`，然后重新推送。

**③ SSH（长期最稳，不用每次 token）**

```powershell
# 1) 生成密钥（一路回车即可，passphrase 可留空）
ssh-keygen -t ed25519 -C "ShirakawaFM@users.noreply.github.com"

# 2) 复制公钥到剪贴板
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | Set-Clipboard

# 3) 打开 https://github.com/settings/keys → New SSH key → 粘贴 → Add SSH key

# 4) 测试（看到 "Hi ShirakawaFM! You've successfully authenticated" 即成功）
ssh -T git@github.com

# 5) 把远程地址换成 SSH
git remote set-url origin git@github.com:ShirakawaFM/douyin-auto-hd.git
git push -u origin main
```

SSH 走 443 端口（公司/校园网封 22 端口时用）：在 `$env:USERPROFILE\.ssh\config` 写入：

```text
Host github.com
  HostName ssh.github.com
  Port 443
  User git
```

### 推送成功后确认

```powershell
git log --oneline -1
git status          # 应显示 Your branch is up to date with 'origin/main'
```

打开 `https://github.com/ShirakawaFM/douyin-auto-hd`，应能看到双语 README、MIT 许可证标识、Actions 开始跑 `Validate extension`。

---

## 6. 发布 v2.4.3 Release（自动打包）

仓库里的 `.github/workflows/release.yml` 会在**推送 tag** 时自动：

1. 校验 tag 与 `manifest.json` 的 `version` 是否一致；
2. 跑一遍 JS 语法检查；
3. 打包 `manifest.json + content.js + popup.html + popup.css + popup.js + 文档` 为
   `douyin-auto-hd-v2.4.3.zip`，并生成 `SHA256SUMS.txt`；
4. 创建 GitHub Release 并附上这两个文件。

### 操作

```powershell
# 先确保工作区干净、代码已推送
git status

# 打附注标签（消息里写清版本）
git tag -a v2.4.3 -m "v2.4.3"

# 推送标签（只推 tag 不会带上其它提交）
git push origin v2.4.3
```

然后打开仓库的 **Actions** 页面，等待 `Release` 工作流变绿；再打开 **Releases**，应看到 `v2.4.3` 草稿或已发布版本。
如果 Release 处于 draft 状态，点 **Edit → Publish release** 即可。

### 如果 CI 打包失败，手动打包兜底

用 PowerShell 生成**根目录即扩展文件**的 zip（不要多包一层文件夹，方便用户解压后直接加载）：

```powershell
cd F:\DEEEPSEEK\douyin-auto-hd
$stage = Join-Path $env:TEMP "douyin-auto-hd-dist"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item manifest.json,content.js,popup.html,popup.css,popup.js,README.md,README_EN.md,LICENSE,CHANGELOG.md -Destination $stage
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath "douyin-auto-hd-v2.4.3.zip" -Force

# 校验内容（应看到 manifest.json 在根层级）
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::OpenRead((Resolve-Path "douyin-auto-hd-v2.4.3.zip")).Entries |
  Select-Object FullName, Length
```

然后在 GitHub Release 页面点 **Attach binaries** 上传这个 zip。注意：该 zip 已被 `.gitignore` 忽略，**不要**`git add` 它。

---

## 7. 仓库美化设置

发布完代码后，这些设置决定别人「会不会点进来、敢不敢装」：

### 7.1 About（右侧简介）

仓库首页右上角 **⚙️ Edit repository details**：

- **Description** 粘贴：

  ```text
  抖音网页版自动切换最高画质（4K/1080P）｜Auto-select the highest available quality on Douyin web. Chrome/Edge Manifest V3 extension, minimal permissions.
  ```

- **Website** 留空（没有官网/商店页就不要填）；
- **Topics**（最多 20 个，建议）：

  ```text
  chrome-extension edge-extension manifest-v3 douyin douyin-web browser-extension
  video-quality 4k javascript automation minimal-permissions
  ```

### 7.2 Social preview（分享卡片）

**Settings → General → Social preview → Upload an image**，建议 1280×640 PNG。没有设计图时，可以截一张弹窗 + 播放器并排的图（避免包含个人信息）。

### 7.3 功能开关

**Settings → General → Features**：

- ✅ Issues（接受问题反馈）
- ✅ Discussions（可选，用于使用交流）
- ✅ Preserve this repository（可选，作为「第一个开源项目」留档）
- ❌ Wiki（暂不需要）

### 7.4 Actions 权限

**Settings → Actions → General → Workflow permissions**：

- 选择 **Read and write permissions**（否则 Release 工作流创建 Release 会报
  `Resource not accessible by integration`）；
- 保存后再重新跑一次失败的工作流（Actions → 失败记录 → **Re-run jobs**）。

### 7.5 确认 License 被识别

仓库首页右侧应显示 **MIT license**。如果显示 "View license" 而不是 "MIT license"，通常是
`LICENSE` 文件名不对或内容被改动，保持标准 MIT 文本即可。

### 7.6 置顶

个人主页 → **Customize your pins** → 勾选 `douyin-auto-hd`，让访客第一眼看到你的第一个开源项目。

---

## 8. 发布后验收清单

逐项打勾，全部通过才算发布完成：

- [ ] `https://github.com/ShirakawaFM/douyin-auto-hd` 能正常打开，README 中英文都能渲染；
- [ ] 顶部徽章全部显示（Version / License / Manifest / Chrome / Edge / Stars）；
- [ ] 右侧显示 **MIT license**，About 里有简介与 Topics；
- [ ] **Actions → Validate extension** 为绿色；
- [ ] **Actions → Release** 为绿色，**Releases** 里有 `v2.4.3`，附 `douyin-auto-hd-v2.4.3.zip` 与 `SHA256SUMS.txt`；
- [ ] Issues 页面能打开新建 Issue，能看到 Bug / 功能建议两个模板；
- [ ] 下载 Release 里的 zip → 解压 → `chrome://extensions/` 加载已解压 → 打开抖音验证可用；
- [ ] 用手机/未登录浏览器打开仓库页，确认阅读体验正常；
- [ ] 仓库无 `.zip` / 无密钥 / 无绝对路径（`git ls-files | Select-String "\.zip$"` 应为空）。

---

## 9. 日常开发与发新版

### 改代码 → 推送

```powershell
cd F:\DEEEPSEEK\douyin-auto-hd

git switch -c fix/quality-regex-anchor   # 建议每次改动开新分支
# ...改代码，并在 chrome://extensions 里重新加载扩展自测...

git add -A
git commit -m "fix(content): 修复 4K 选项被视频标题误匹配"
git push -u origin fix/quality-regex-anchor
```

然后在 GitHub 上开 Pull Request，等 `Validate extension` 变绿后合并到 `main`。

### 发布新版本（六步）

1. 修改 `manifest.json` 的 `version`，例如 `2.4.4`；
2. 更新 `CHANGELOG.md`：把 `[Unreleased]` 内容整理到 `## [2.4.4]` 下；
3. 更新 `README.md` / `README_EN.md` 顶部徽章的版本号（CI 会警告不一致）；
4. 提交：`git commit -am "chore(release): v2.4.4"`；
5. 打标签并推送：`git tag -a v2.4.4 -m "v2.4.4"` → `git push origin main --tags`；
6. 去 Actions 确认 Release 工作流成功，必要时在 Releases 页面点 Publish。

---

## 10. 常见报错排查

| 报错 / 现象 | 原因 | 解决 |
| --- | --- | --- |
| `git : 无法将"git"项识别为 cmdlet…` | 未安装或 PATH 未刷新 | 重开终端；重装并勾选 PATH；用 `& "C:\Program Files\Git\cmd\git.exe" --version` 验证 |
| `fatal: not a git repository (or any of the parent directories): .git` | 当前目录不是仓库根 | `cd F:\DEEEPSEEK\douyin-auto-hd`，或先 `git init` |
| `error: src refspec main does not match any` | 还没有 commit，或当前分支叫 `master` | 先 `git add . && git commit`；或 `git branch -M main` |
| `remote origin already exists` | 重复执行了 `git remote add` | `git remote set-url origin <新地址>`，或 `git remote remove origin` 后重加 |
| `fatal: repository not found` | 仓库名/用户名拼错，或没有权限 | 核对 `git remote -v`；确认仓库已创建且为 Public |
| `Authentication failed` / `403` / `Permission denied` | PAT 过期、权限不足、凭据缓存错误 | 重新生成带 `repo` 权限的 PAT；删除 Windows 凭据管理器里的 `git:https://github.com` |
| `OpenSSL SSL_read: Connection was reset` / `Failed to connect to github.com port 443` | 网络被阻断 | 配置代理（见第 2 节）或改用 SSH over 443 |
| `Recv failure: Connection was reset`（push 时） | Git 没走 Windows 系统代理，直连被重置 | `git -c http.proxy=http://127.0.0.1:7890 push origin main`，或按第 2 节做全局配置 |
| `Connection timed out` / 卡在 `Writing objects` | 网络差或仓库过大 | 开代理；确认没误提交 zip（`git ls-files \| Select-String "\.zip$"`） |
| `Authentication failed` 且弹窗反复出现 | 凭据管理器缓存了错误密码 | 控制面板 → 凭据管理器 → Windows 凭据 → 删除 `git:https://github.com` |
| `Updates were rejected because the remote contains work…` | 远程仓库不是空的（建仓库时勾了 README） | `git pull --rebase origin main` 后重新 push；或确认无误后 `git push --force-with-lease`（谨慎） |
| `warning: LF will be replaced by CRLF` | Windows 换行符转换提示 | 正常警告；仓库已用 `.gitattributes` 统一为 LF，可忽略 |
| `file is 123.00 MB; this exceeds GitHub's file size limit of 100.00 MB` | 误提交了 zip/大文件 | `git rm --cached 大文件`，加入 `.gitignore` 后重新提交；可用 `git filter-repo` 彻底清理历史 |
| `detected dubious ownership in repository` | 目录所有者与当前用户不一致（常见于移动/复制过的目录） | `git config --global --add safe.directory F:/DEEEPSEEK/douyin-auto-hd` |
| `fatal: tag 'v2.4.3' already exists` | 重复打标签 | 改版本号；或 `git tag -d v2.4.3` + `git push origin :refs/tags/v2.4.3` 后重打 |
| 中文文件名显示成 `\344\270...` | `core.quotepath` 默认开启 | `git config --global core.quotepath false` |
| Actions 报 `Resource not accessible by integration` | 工作流没有写权限 | Settings → Actions → General → Workflow permissions → Read and write |
| Release 工作流报 `Tag v2.4.3 does not match manifest.json version` | 忘记改 `manifest.json` 的 version | 改版本号、重新提交，删除旧 tag 后重新打标签 |
| 改了文件名大小写但 Git 不识别 | Windows 文件系统大小写不敏感 | `git mv Content.js content-tmp.js && git mv content-tmp.js content.js`（两步） |
| push 后仓库里没有 `.github/` 目录 | 目录以 `.` 开头，某些上传工具会跳过 | 用 `git status` 确认已 add；换 GitHub Desktop / 命令行提交 |
| `git push` 要求输入密码但粘贴 token 无反应 | 密码框不回显 | 直接右键粘贴（Ctrl+V 可能无效），回车即可 |

---

## 11. 可选：更省事的替代路线

### 11.1 GitHub Desktop（图形化）

1. 安装 <https://desktop.github.com/>；
2. `File → Add local repository` → 选择 `F:\DEEEPSEEK\douyin-auto-hd`；
3. 若提示不是仓库，选 `create a repository`；
4. 左下角填写提交信息 → **Commit to main**；
5. 顶部 **Publish repository** → 选择 Public → 发布。

适合完全不想碰命令行的人；缺点是不方便打 tag（tag 需要 `Repository → Create tag`，也可以后续用网页版创建 Release 时新建 tag）。

### 11.2 GitHub CLI（一条命令建仓库）

```powershell
winget install --id GitHub.cli -e --source winget
# 重开终端
gh auth login          # 选 GitHub.com → HTTPS → 浏览器登录
cd F:\DEEEPSEEK\douyin-auto-hd
git init -b main && git add . && git commit -m "feat: 初始提交"
gh repo create douyin-auto-hd --public --source . --remote origin --push
```

### 11.3 网页拖拽上传（不推荐）

GitHub 仓库页 `Add file → Upload files` 可以拖文件夹上传，但：

- 不能保留提交历史（只有一次 commit）；
- `.github/` 这类隐藏目录可能被文件管理器过滤；
- 后续维护仍要装 Git。

只适合「先让链接能打开」的临时方案。

---

## English quick checklist

```bash
# 1. Install Git for Windows: winget install --id Git.Git -e --source winget
git --version

# 2. Identity
git config --global user.name "ShirakawaFM"
git config --global user.email "you@users.noreply.github.com"
git config --global init.defaultBranch main

# 3. Init and commit
cd F:/DEEEPSEEK/douyin-auto-hd
git init -b main
git add .
git status                      # verify no zip/secret/absolute paths
git commit -m "feat: initial commit — Douyin web auto highest quality v2.4.3"

# 4. Create an EMPTY public repo at github.com/new (no README, no .gitignore, no license)

# 5. Connect and push (Git Credential Manager opens a browser on first push)
git remote add origin https://github.com/ShirakawaFM/douyin-auto-hd.git
git push -u origin main

# 6. Publish the release (CI builds the zip and attaches it)
git tag -a v2.4.3 -m "v2.4.3"
git push origin v2.4.3
```

Then on GitHub:

1. **About** → paste the bilingual description, add topics;
2. **Settings → Actions → General → Workflow permissions** → *Read and write* (required by the release job);
3. **Releases** → verify `douyin-auto-hd-v2.4.3.zip` + `SHA256SUMS.txt`, publish if it is a draft;
4. Download the zip, extract it, load it unpacked in `chrome://extensions/`, verify on Douyin.

If push fails: check the proxy/network (section 2), regenerate a PAT with `repo` scope, or switch to SSH
(`git remote set-url origin git@github.com:ShirakawaFM/douyin-auto-hd.git`).
