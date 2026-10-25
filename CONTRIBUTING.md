# 贡献指南 · Contributing

感谢你愿意改进这个项目！无论是报 Bug、提需求、改代码还是补文档，都很有价值。

> English speakers: see the [English summary](#english-summary) at the bottom.

---

## 目录

- [行为准则](#行为准则)
- [报告问题](#报告问题)
- [提出新功能](#提出新功能)
- [贡献代码](#贡献代码)
- [代码风格](#代码风格)
- [提交信息规范](#提交信息规范)
- [Pull Request 自检清单](#pull-request-自检清单)
- [发布流程](#发布流程)
- [English summary](#english-summary)

---

## 行为准则

- 保持友善、就事论事，不攻击个人；
- 不提交与本项目无关的内容（广告、引流、破解/绕过付费的实现）；
- 不要求维护者提供违反平台服务条款的功能（例如绕过会员、批量刷量、伪造请求）。

## 报告问题

提 Issue 前请先：

1. 在 [Issues](https://github.com/ShirakawaFM/douyin-auto-hd/issues) 里搜索是否已有相同问题；
2. 确认使用的是**最新版本**（`manifest.json` 的 `version`）；
3. 按 [Bug 模板](.github/ISSUE_TEMPLATE/bug_report.yml) 填写。

一个能被快速定位的 Bug 报告至少包含：

| 信息 | 说明 |
| --- | --- |
| 扩展版本 | 弹窗顶部显示的 `vX.Y.Z`，或 `manifest.json` 里的 `version` |
| 浏览器与版本 | 例如 `Chrome 141.0.7390.55 / Windows 11` |
| 页面类型 | 普通视频页 / 直播 / 用户主页 / 搜索结果页 |
| 复现步骤 | 从打开页面到出问题的完整操作 |
| 预期 vs 实际 | 期望自动切到什么档位，实际发生了什么 |
| 控制台日志 | `[抖音HD] scan {...}` 的完整输出，**尤其 `qualityTexts` 字段** |

> 抓日志方法：抖音页面按 `F12` → Console，过滤 `抖音HD`，右键「Save as…」或直接整段复制。
> 如果日志太多，可先在 `content.js` 里把 `DEBUG` 保持为 `true` 复现一次，再贴出失败前后的几条。

## 提出新功能

请说明：

1. 你遇到的具体场景（不要只说「优化一下」）；
2. 期望的行为；
3. 是否有替代方案；
4. 该功能是否需要**新增权限** —— 新增权限会被重点审查，因为项目定位是「最小权限」。

## 贡献代码

本项目**没有构建步骤**，源码即产物（原生 JavaScript + HTML + CSS），改完直接重新加载扩展即可。

```bash
# 1. Fork 并克隆
git clone https://github.com/<your-name>/douyin-auto-hd.git
cd douyin-auto-hd

# 2. 建分支（分支名建议用类型前缀）
git checkout -b fix/quality-detection-4k
# 或 feat/quality-priority-config、docs/readme-en

# 3. 修改代码，本地加载验证（chrome://extensions → 加载已解压 → 选择本目录）

# 4. 提交
git add .
git commit -m "fix: 修复 4K 选项被标题误匹配的问题"

# 5. 推送并开 PR
git push origin fix/quality-detection-4k
```

### 本地验证要点

- Chrome 与 Edge 都至少手动跑一遍；
- 验证场景：普通视频、SPA 切换下一个视频、直播、非抖音页面；
- 确认弹窗仍能显示日志、开关生效、目标清晰度切换生效；
- 确认**没有**新增浏览器控制台报错。

## 代码风格

- **原生 ES2020 语法**，不引入框架、构建工具或 npm 依赖；
- 缩进 2 空格，语句以分号结尾，字符串统一单引号（现有代码风格）；
- `content.js` 内所有 DOM 操作必须包在 `try/catch` 中，避免单点异常导致整个脚本失效；
- 新增 DOM 扫描逻辑时注意性能：优先缩小扫描范围，避免在 `MutationObserver` 回调里做全量 `querySelectorAll('*')`；
- **不要新增权限**，除非有充分理由并在 PR 中说明；不要加载远程脚本；
- 中文注释保持简洁，解释「为什么」而不是「做了什么」；
- 修改画质规则时，同步更新 `README.md` / `README_EN.md` 中的分值表。

## 提交信息规范

采用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

```text
<type>(<scope>): <subject>

<body 可选>
```

常用 type：

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 修 Bug |
| `docs` | 文档 |
| `style` | 样式/格式（不影响逻辑） |
| `refactor` | 重构（不改变行为） |
| `perf` | 性能优化 |
| `chore` | 杂项（版本号、CI、依赖） |

示例：

- `feat(popup): 支持自定义画质优先级`
- `fix(content): 避免把视频标题误判为 4K 选项`
- `docs: 补充英文 README 与发布手册`

## Pull Request 自检清单

提交 PR 前请逐项确认：

- [ ] 已在 Chrome **和** Edge 上手动验证；
- [ ] 普通视频 / 切换视频 / 直播 / 非抖音页面 四种场景均正常；
- [ ] 没有新增权限（若有，已在描述中说明必要性）；
- [ ] 没有引入远程脚本、`eval`、网络请求或第三方依赖；
- [ ] 更新了 `CHANGELOG.md`（在 `[Unreleased]` 下按 `新增 / 变更 / 修复` 分类）；
- [ ] 涉及用户可见行为时，同步更新 `README.md` 与 `README_EN.md`；
- [ ] 控制台无新增报错，扩展自身日志仍正常输出；
- [ ] PR 描述写清了「做了什么、为什么、怎么验证」。

## 发布流程

维护者发版步骤（详见 [docs/PUBLISHING.md](docs/PUBLISHING.md)）：

1. 修改 `manifest.json` 的 `version`；
2. 在 `CHANGELOG.md` 中把 `[Unreleased]` 内容整理到新版本号下；
3. 提交：`git commit -m "chore(release): v2.4.4"`；
4. 打标签并推送：`git tag -a v2.4.4 -m "v2.4.4"` → `git push origin main --tags`；
5. GitHub Actions 会校验 tag 与 manifest 版本一致，并自动生成 `douyin-auto-hd-v2.4.4.zip` 附加到 Release；
6. 在 Release 页面点「Publish release」。

---

## English summary

- Be kind; do not submit unrelated content, paywall bypasses or request forgery.
- Before opening an issue: search existing issues, update to the latest version, and use the bug template.
  Include extension version, browser version, page type, reproduction steps, expected vs actual, and the
  complete `[抖音HD] scan {...}` console output (especially `qualityTexts`).
- The project has **no build step** — plain JavaScript/HTML/CSS. Fork, branch
  (`fix/...`, `feat/...`, `docs/...`), edit, load the folder unpacked in `chrome://extensions/`, test, then PR.
- Style: 2-space indentation, single quotes, native ES2020, no frameworks, no new permissions, no remote code,
  wrap DOM work in `try/catch`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`, `docs`,
  `style`, `refactor`, `perf`, `chore`.
- PR checklist: tested on Chrome **and** Edge; verified normal video / SPA switch / live / non-Douyin page;
  no new permissions; CHANGELOG updated; both READMEs updated when behavior changes; no new console errors.
- Merge reviews focus on correctness, minimal permissions and false-positive risk of text matching.

Thanks for contributing!
