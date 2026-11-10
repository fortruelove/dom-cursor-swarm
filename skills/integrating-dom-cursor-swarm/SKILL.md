---
name: integrating-dom-cursor-swarm
description: Use when adding a multi-cursor page reveal animation to an existing HTML or React website, or migrating a site-specific DOM cursor animation to the reusable dom-cursor-swarm component. Excludes browser extension development and AI page generation.
---

# 接入 DOM Cursor Swarm

目标是在真实内容上增加可跳过的视觉动画，沿用已有布局和业务。先阅读 [接入参考](references/integration.md)，确定目标项目适配范围与固定版本。

1. 检查目标技术栈、路由、SSR、滚动方式、交互区及已有修改。选定正文容器，把导航、登录、筛选、表单和后台留在动画区域之外，或用排除规则保护。
2. 从公开仓库 release 安装已构建的固定版本包；需要可复现/离线构建时使用项目内 vendor tarball、校验 SHA256 并提交 lockfile。不要假设该包已发布 npm registry。普通 HTML 无需 React；React 从 `/react` 入口导入。
3. 选择器匹配容器内的真实节点；用项目自己的配置选择图片/卡片，避免将站点类名写回通用库。引入一次 CSS，在 body/root 设置独立主题变量。核心 `start()` 只在浏览器调用；React SSR 保持原始可读内容并使用客户端边界。
4. HTML 保存控制器并在移除容器前 `dispose()`；React 使用稳定 `options` 和明确的 `resetKey`，路由更换时清理。默认观察子节点增删；高频动态区域关闭观察并选择明确重播时机。Esc/`skip()` 后不因异步内容再次播放，明确重启才恢复。
5. 先做与业务无关的本地页面，再验证真实页面的完整播放、桌面/窄屏、跳过及跳过后异步插入、路由卸载、减少动态效果、无 JS/SSR、主题与交互。检查浮层和 inert 已清理、无脚本错误或横向溢出。使用已安装的 release 包验收，不能只测源码。

默认支持 window 滚动；局部滚动、Shadow DOM、虚拟列表、iframe、旋转/缩放容器应先说明边界并单独适配。禁止同时动画同一或嵌套根节点。不要为了动画替换认证、CMS、代理配置或原页面布局。

交付说明已验证的浏览器/页面、包版本/来源、行为变化、兼容限制及回退方法。技能仅指导接入，不授予发布、部署或操作其他项目的权限。
