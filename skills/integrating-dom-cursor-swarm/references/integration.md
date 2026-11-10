# 固定版本接入参考

源码及 API：https://github.com/fortruelove/dom-cursor-swarm

安装包：`https://github.com/fortruelove/dom-cursor-swarm/releases/download/v0.1.0/fortruelove-dom-cursor-swarm-0.1.0.tgz`。版本更新时选择实际存在并经过验证的 release，不把示例版本当作自动升级指令。

```bash
npm install ./vendor/fortruelove-dom-cursor-swarm-0.1.0.tgz
```

Dockerfile 在 `npm ci` 前 `COPY vendor vendor`。包已编译，`npm ci --ignore-scripts` 也可正常使用；运行时不从 GitHub/CDN 请求代码。首次安装 release 前检查包清单、SHA256 与源仓库，不向公开仓库复制目标网站的配置或私有内容。

## React 最小接入

```tsx
import { CursorSwarm } from '@fortruelove/dom-cursor-swarm/react';
import '@fortruelove/dom-cursor-swarm/style.css';

const options = { selector: 'h1,h2,p,.your-card' };
export function AnimatedContent({ pathname, revision, children }) {
  return <CursorSwarm key={pathname} resetKey={revision} options={options}
    enabled={!/^\/admin(?:\/|$)/.test(pathname)}>{children}</CursorSwarm>;
}
```

`revision` 应是稳定内容引用或版本号，不能每次 render 新建对象。`options` 放组件外或 memo；无关重渲染不应重复动画。需要额外节点观察时使用默认 `observeChanges:true`；不要自行再叠一层观察器导致重启循环。

## HTML 最小接入

```js
import { createCursorSwarm } from '@fortruelove/dom-cursor-swarm';
import '@fortruelove/dom-cursor-swarm/style.css';
const animation = createCursorSwarm(document.querySelector('main'), {
  selector: 'h1,h2,p,[data-cursor-swarm]',
});
animation.start();
// 页面路由离开、容器移除前：animation.dispose();
```

未使用 bundler 时，将安装包的 `dist/index.js` 和 `src/style.css` 复制为自托管资源，用 ES module 相对路径导入。React 入口需要 React 18/19，不适用于直接无构建工具的 HTML 脚本标签。

## 容易遗漏的边界

- 引擎只选 root 后代；root 本身的标题需包一层正文容器。表单/按钮/dialog 默认排除，重要交互另外加 `[data-cursor-swarm-ignore]` 或放到 root 外。
- 浮层在 body 上，使用 `:root`/`body` 设置 `--cursor-swarm-surface`、`--cursor-swarm-z-index`。不要依赖目标容器内部的主题变量继承。
- `skip()` 同时停止异步观察；`start()` 明确重新收集节点并重播。纯文字节点原位修改、CSS 显隐、图片尺寸变化不一定触发节点观察，必要时依靠明确版本更新。
- 同一区域/嵌套区域不可并发；多个独立区域可用，默认全局 Esc 一起跳过。高频内容更新会反复重播，选择稳定小区域或禁用观察。
- 动画仅控制 opacity、clip-path、inert；不要让另一个动画同时控制这些属性。dispose 保留其他内联样式变化。
- window 滚动外的特殊布局不在 v0.1.0 支持范围。需要此类页面时先使用普通 DOM 样例实测，不宣称已经普适。
- SSR 导入安全，但控制器创建依赖浏览器；水合后再动画可能产生时序差异，不能用永久隐藏 CSS 掩盖，避免无 JS 内容不可读。

## 验证记录

至少记录：安装的版本和包摘要；桌面/手机自然完成；Esc 后延迟节点保持可见；组件卸载后没有 `.cursor-swarm-worker`、`.cursor-swarm-outline` 或残留 inert；导航/登录/筛选可用；减少动态效果无动画；SSR/无 JS 内容可读。浏览器测试用本地隔离数据，不在生产写入测试内容。
