# 三国火纹

- 本项目是原创三国题材单机战棋，技术栈为 React、TypeScript、Canvas 2D、Vite。
- 沟通、文档和新增注释使用中文。时间使用 Asia/Shanghai。
- 游戏工程位于 `game/`。`src/core/` 是无 DOM 的纯规则；`src/data/` 是玩法、地图、剧情及资源映射；`src/render/` 是 Canvas 素材装配；`src/ui/` 是交互与动画调度。
- 地图采用完整底图、独立逻辑网格和实体层。逻辑格 64 像素，坐标 x 向右、y 向下；不能从 PNG 边界推断占格。
- 美术源库默认 `/Users/didi/Documents/ChatGPT/三国火纹美术资源包`，可用 `ART_PACK_ROOT` 覆盖。通过 `npm run import:assets` 导入首关实际依赖并记录 SHA256，不改源库。
- 小人使用九动作图集、独立武器、原生手部遮挡与逐帧 rig，最近邻采样；对话立绘使用整图。
- 规则只在提交指令时结算一次；动画回调不得重复扣血。预移动不修改权威状态、不消耗随机数。
- `cd game && npm ci` 安装依赖，`npm run dev` 本地运行；`npm run typecheck`、`npm test`、`npm run check:map`、`npm run build` 验证。
- 查找上下文先读 `.agentdocs/index.md` 和对应需求 README，再按需检索源码。实际代码变更必须记录阶段文档，不以构建成功代替实玩或视觉验收。
