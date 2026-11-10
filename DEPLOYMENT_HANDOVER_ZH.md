# 组件维护交接

本仓库是静态JavaScript/CSS组件包及接入技能，无后端服务、数据库、Docker容器、volume或生产secret。生产运行由使用组件的网站管理。

## 构建与验证

项目目录名dom-cursor-swarm；Node.js 22.12+。npm ci --ignore-scripts；npm run build；npm test；npm pack。测试默认使用Playwright Chromium，可用环境变量CHROMIUM_PATH指定已有浏览器。npm run dev启动127.0.0.1上的Vite示例；运行前检查端口，可用--port与--strictPort指定空闲端口。不需要AI API或凭据。

## 发布与安装

源码GitHub：fortruelove/dom-cursor-swarm。公开包通过GitHub Releases提供.tgz和SHA256SUMS，不是npm registry。每个版本先测试、npm pack、校验包清单及内容，再tag/release。已发布版本不可重打覆盖；修复递增版本。源码tag、release产物、消费方lockfile应能相互追溯。

消费项目优先将固定版本包保存vendor并使用file依赖，Docker在npm ci前复制vendor。升级时核对源码差异与包摘要，更新package.json/lockfile、验证页面行为。不要把域名、CMS、账号、代理配置写回公共引擎。

## 回退、备份与定制

源码通过Git管理；保留已发布包/tag及消费项目原lockfile，回退时恢复前一个版本依赖并重新构建消费站点，不涉及数据库恢复。环境变量不含真实secret。颜色、名称、速度、数量、选择器与主题通过公开options/CSS变量定制。上游视觉参考不直接纳入代码；参考项目升级不意味着本组件自动兼容或需要同步其引擎。

技能在skills/integrating-dom-cursor-swarm，保留其references即可独立安装；技能验证器仅检查元数据，实际接入仍需隔离页面验证。
