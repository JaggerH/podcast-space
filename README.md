# 播客

播客收听和收藏 — 一个跑在 [Muse](https://muse.ai) 上的播客 space。

功能：Apple 播客中美榜单与搜索、RSS 订阅、荔枝 FM 订阅、单集播放与续播、
收藏与稍后再听、单集下载离线听、定时关闭（15 / 30 / 60 分钟、播完本集）。

> 这是 **Muse space 项目**，不是独立可运行的仓库：前端是 React 19 +
> TypeScript，后端是跑在 Muse 平台上的 server actions，依赖
> `@hatch/space-sdk`。这份源码与线上 space 的目录结构、文件名、业务逻辑
> 完全一致，改动请回到 Muse 里对 space 做，改完再同步到这里。

## 在 Muse 里运行

1. 在 Muse 里新建一个 space（fullstack / 全功能版），把本仓库的全部文件
   放进去（`client/`、`server/`、`drizzle/`、`package.json`、`space.json`、
   `tsconfig.base.json`、`bun.lock`、`bunfig.toml`）。
2. Muse 平台会自动安装依赖、跑 `drizzle/` 里的迁移、构建并发布。
   `@hatch/space-sdk` 由 Muse 平台自带，无需另装、不用改
   `package.json` 里的 `file:` 引用。
3. 发布后在 Muse 侧边栏打开即可使用。

## 目录结构

```
client/                 React 前端（App.tsx、acrylic.tsx、api.ts、main.tsx、
                        offline.ts、theme.css）
  build.mjs             客户端打包（调用 @hatch/space-sdk/build）
  index.html            入口
server/                 后端 server actions
  src/actions.ts        全部接口：发现、搜索、单集列表、收藏、稍后再听、
                        收听进度、荔枝订阅、播放解析（字节阶梯）、下载归档
  src/schema.ts         Drizzle 表结构
drizzle/                SQLite 迁移（0001–0003）
space.json              space 元信息（slug、runtime）
package.json            依赖与脚本（typecheck / build）
```

## 数据存在哪

数据存在 space 服务端的 SQLite（`app.db`，Muse 平台管理），表见
`server/src/schema.ts`：

- `favorite_podcasts` 收藏的节目
- `episode_bookmarks` 稍后再听
- `playback_progress` 收听进度（续播就靠它）
- `latest_episodes` 每日刷新得到的新单集快照
- `refresh_state` 刷新状态
- `episode_archives` 服务端音频归档（下载备料用）

`app.db` 和下载的音频（`blobs/`）**不在本仓库里**：前者是各人自己的
收藏和进度，后者是发行方的音频文件，各人用各人的。

榜单、搜索结果、单集列表每次现查 Apple iTunes / RSS / 荔枝 FM，
音频文件本身不下载、不存库，只存发行方的音频地址（下载到本地离线听
的单集除外，见下）。

## 每日刷新

收藏节目的新单集由 space 的 managed cron 每天定时查一次
（`space.json` 里的 `managedCronJobs`，线上是每天 08:15 新加坡时间），
查到新集写入 `latest_episodes` 并在收藏上打更新红点。换一台 Muse
部署时 cron 由平台按 `space.json` 重建，不用手动配。

## 播放与来源

- 发现、搜索走 Apple iTunes（中美两区榜单、关键词搜索）。
- 单集音频地址优先从 iTunes 单集接口拿，拿不到回退到节目 RSS。
- 荔枝 FM 节目走荔枝 App 的 `vodapi`（`lizhi-recipe` 采集配置的思路，
  见 `server/src/actions.ts` 里的注释）：UA 用 `okhttp/4.12.0`，音频
  CDN 用一组候选主机轮换、冷对象 403 预热重试。
- 播放地址一律现解析（字节阶梯）：服务端归档 → 网盘绑定（未接，
  直接落空）→ 服务策略候选 CDN → 原始直链。
- 怡楽播客这类在荔枝先更的节目：搜索和单集列表会把荔枝的最新单集
  合并进来（`server/src/actions.ts` 里的 `LIZHI_MIRRORS`）。

## 离线播放与定时关闭

- 点单集的下载按钮：服务端先经字节阶梯把音频抓进归档，再由浏览器
  拉到本地 IndexedDB（`podcast-offline`），飞机上打开页面就能播。
- 定时关闭在播放器展开面板里：15 / 30 / 60 分钟、播完本集四档。

## 已知限制

- 没有 service worker：离线听之前必须先打开页面、把单集下好；
  完全离线时关掉页面就打不开了。
- 播放与搜索依赖上游（iTunes / RSS / 荔枝 FM）：某个源挂了，对应
  节目会加载失败，但已收藏的节目和已下载的单集不受影响。
- 荔枝 `vodapi` 的 UA 接受策略会变（见 `actions.ts` 注释），以实测为准。
- 付费标记（荔枝 `voicePrice`）只用于展示，不控制播放。

## 样式

界面样式用的是作者自己的
[acrylic-ui](https://github.com/JaggerH/acrylic-ui) 项目（macOS 26 磨砂
玻璃风格）：`client/src/theme.css` 里的 `--acr-*` token 与
`client/src/acrylic.tsx` 里的 AudioPlayer / Item 组件都是从那个项目
移植过来的。acrylic-ui 本身是 MIT 协议。

## License

MIT，见 [LICENSE](LICENSE)。
