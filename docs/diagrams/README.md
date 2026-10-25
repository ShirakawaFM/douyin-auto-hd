# 图表源文件 · Diagram sources

这里的 `.mmd` 文件是 README 中两张流程图的**源文件**，对应渲染结果在 `docs/assets/`：

| 源文件 | 渲染结果 | 用在哪 |
| --- | --- | --- |
| `architecture-zh.mmd` | `docs/assets/architecture-zh.png` | `README.md`「组件与数据流」 |
| `auto-switch-zh.mmd` | `docs/assets/auto-switch-zh.png` | `README.md`「自动切换流程」 |
| `architecture-en.mmd` | `docs/assets/architecture-en.png` | `README_EN.md`「Components and data flow」 |
| `auto-switch-en.mmd` | `docs/assets/auto-switch-en.png` | `README_EN.md`「Automatic switching flow」 |

## 为什么用图片而不是 Mermaid

GitHub 不直接在页面里渲染 Mermaid，而是把代码传给 `viewscreen.githubusercontent.com` 的沙箱 iframe 渲染。
当这个域名或它依赖的静态资源不可达（常见于国内网络、公司代理、广告拦截器）时，页面就会显示：

> Unable to render rich display

把图导出为仓库内的 PNG 后，图片与 README 同源，不再依赖第三方域名，任何网络环境都能显示。

## 如何修改并重新导出

1. 编辑对应 `.mmd` 文件；
2. 打开 <https://mermaid.live>，粘贴内容，左侧确认渲染正常；
3. 右上角 **Actions → Download PNG**（建议 2x/高分屏导出），可先设置 `theme: base`、字体 `Segoe UI / Microsoft YaHei`；
4. 覆盖 `docs/assets/` 下对应的 `.png`（保持文件名不变）；
5. 提交时同时更新 `.mmd` 与 `.png`。

> 图片背景为白色，在 GitHub 深色模式下会显示为浅色卡片，属预期行为。
