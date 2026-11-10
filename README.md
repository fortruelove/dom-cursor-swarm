# DOM Cursor Swarm

把已有网页逐步显示成“多个光标协作搭建”的效果。基于真实 DOM，不制作页面截图，不依赖 AI API、后端、浏览器扩展或运行时 CDN。核心没有运行时依赖，React 包装为可选入口。

独立编写的轻量实现，已经用于 [yupu.fun](https://yupu.fun)。它不是 `DhvanilPatel/swarm-cursors` Chrome 扩展，也不包含该扩展的动画引擎；视觉灵感与来源见 [NOTICE.md](NOTICE.md)。

## 安装

需要现代浏览器；从源码构建使用 Node.js 22.12+。

```bash
npm install https://github.com/fortruelove/dom-cursor-swarm/releases/download/v0.1.0/fortruelove-dom-cursor-swarm-0.1.0.tgz
```

没有发布到 npm registry，不能直接运行 `npm install @fortruelove/dom-cursor-swarm`。生产构建可下载 release 中的 `.tgz` 到项目 `vendor/`，核对 release 的 SHA256，再使用 `file:` 依赖并提交 lockfile；Docker 在 `npm ci` 前复制该文件。包包含编译后的 ESM、类型声明和 CSS，无需安装时运行脚本。

## 普通 HTML / JavaScript

使用 Vite 等支持包导入的构建工具：

```js
import { createCursorSwarm } from '@fortruelove/dom-cursor-swarm';
import '@fortruelove/dom-cursor-swarm/style.css';

const animation = createCursorSwarm(document.querySelector('main'), {
  selector: 'h1,h2,p,[data-cursor-swarm]',
});
animation.start();
// animation.skip();     // 显示全部内容，异步新内容也不再自动播放
// animation.start();    // 明确重播，重新读取当前 DOM
// animation.dispose();  // 移除页面/切换路由前清理
```

无构建工具也可以把包里的 `dist/index.js` 和 `src/style.css` 放到自己网站，通过 `<script type="module">` 和 `<link>` 引入，见 [HTML 示例](examples/basic/index.html)。选择器只匹配容器内部节点，容器自身不会被选中。默认匹配标题、段落及 `[data-cursor-swarm]`；图片、卡片需显式选中。

## React

```tsx
import { CursorSwarm } from '@fortruelove/dom-cursor-swarm/react';
import '@fortruelove/dom-cursor-swarm/style.css';

const options = {
  selector: 'h1,h2,p,.project-card',
  labels: ['布局', '排版', '组件', '样式', '图像', '细节', '校对'],
};

export function Page({ pathname, children }) {
  return (
    <CursorSwarm
      key={pathname}
      enabled={!pathname.startsWith('/admin')}
      options={options}
      resetKey={pathname}
    >
      {children}
    </CursorSwarm>
  );
}
```

`options` 保持稳定引用；内容版本变化可改变 `resetKey`，不需要把每次渲染新建的对象作为重播信号。DOM 子节点增删默认自动重建动画；Esc 会跳过当前实例，并停止后续异步内容触发，直到明确 `start()` 或 React `resetKey/options/enabled` 改变。React 禁用时不增加包装节点。React 18/19 为可选 peer dependency，普通 HTML 不需要 React。

SSR 可以安全导入两个入口，服务端输出正常可见内容；核心控制器只能在浏览器创建。SSR 框架把 React 包装放进客户端边界，并自行评估水合后开始动画的视觉时序。

## 配置

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `selector` | `h1,h2,h3,h4,h5,h6,p,[data-cursor-swarm]` | 参与动画的后代节点 |
| `textSelector` | `h1,h2,h3,h4,h5,h6,p,small,time` | 按字数计算动画时长的节点 |
| `exclude` | 表单、按钮、输入框、dialog、`[data-cursor-swarm-ignore]` | 排除区域；含这些后代的容器也不隐藏 |
| `speed` | `1.5` | 正数速度倍数 |
| `desktopWorkers` / `mobileWorkers` | `7` / `4` | 每个实例的光标数量，整数 1–32 |
| `mobileBreakpoint` | `600` | JS 数量切换的视口宽度阈值 |
| `colors` / `labels` | 内置 7 色 / 英文角色名 | 非空数组，少于光标数量时循环使用 |
| `observeChanges` | `true` | 观察 DOM 子节点变化并重播 |
| `escapeToSkip` | `true` | Esc 跳过；多个实例会同时响应 |

CSS 可在 `:root`/`body` 设置 `--cursor-swarm-z-index`（默认 7）、`--cursor-swarm-surface`（默认白色）。浮层挂到 `body`，容器局部变量不会自动传给浮层。光标移动层不拦截鼠标；实际参与动画的内容会暂时设为 `inert`，完成/跳过/卸载恢复。

## 兼容范围

- 已验证：普通 HTML、React SPA/StrictMode、SSR 导入与渲染、桌面/窄屏、异步子节点、Esc、减少动态效果、多个不重叠区域。
- 默认针对 window 滚动。局部滚动裁剪、虚拟列表、Shadow DOM、iframe、旋转/缩放坐标容器不在 0.1.0 支持范围；不要把它当作任意网站自动重建器。
- 不允许同时动画同一或嵌套区域；启动时会拒绝。多个独立区域可并行，Esc 默认全部跳过。
- 子节点变动会重播该区域已有内容；高频更新区域用 `observeChanges:false`，通过明确的内容版本重播。原位修改 `textContent` 的文本节点及纯样式变化不保证自动触发。
- 除动画控制的 `opacity`、`clip-path` 和 `inert` 外，不改业务内容。不要让其他逻辑同时控制同一元素的这些属性。页面原内容保持在 DOM；不运行 JS 时仍然可读。
- 没有扩展版的音效、Figma 标尺、复制动作、完整群集物理、截图媒体重建功能。

## 技能接入指导

[skills/integrating-dom-cursor-swarm/SKILL.md](skills/integrating-dom-cursor-swarm/SKILL.md) 可复制到 `~/.codex/skills/integrating-dom-cursor-swarm/`（需保留其中 references）。它指导选择区域、安装固定版本、接入生命周期、排除交互和验证，不授予自动部署或外部发布权限。

## 开发与验证

```bash
npm ci --ignore-scripts
npx playwright install chromium
npm test
npm run dev -- --port 18120 --strictPort
# 打开 /examples/basic/ 或 /examples/react/
npm pack
```

已有 Chromium 可通过 `CHROMIUM_PATH` 指定，不必再次下载。测试使用隔离本地服务，覆盖真实浏览器 DOM 行为及服务端导入；不会访问账号或数据库。MIT 许可证见 [LICENSE](LICENSE)。
