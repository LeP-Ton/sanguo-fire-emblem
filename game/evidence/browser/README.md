# 首关真实浏览器验收

2026-11-04，Asia/Shanghai。使用 Codex 内置 Chromium 对实际运行页面进行鼠标、键盘和按钮交互。截图由页面直接捕获；不是离屏拼图或设计稿。

- [完整机器记录](qa-report.json)：种子、逐步对照、正常/快进最终状态、失败状态及控制台检查。
- [标题](01-title.jpg) · [桃园对白](02-opening.jpg) · [首关战场](03-battle.jpg) · [战斗预测](04-forecast.jpg)
- [第二回合](05-round2.jpg) · [胜利与简雍入队](06-victory.jpg) · [失败结算](07-defeat.jpg)
- [移动表现](08-in-motion.jpg) · [九动作向右](09-nine-actions-right.jpg) · [九动作向左](10-nine-actions-left.jpg)
- [正常速度通关](11-normal-speed-victory.jpg) · [生产子目录运行](12-production-subdirectory.jpg) · [桥梁与林地移动](13-bridge-forest.jpg) · [路径返修前构建](14-final-build.jpg) · [最终返修构建](15-css-url-fixed.jpg)

固定种子 `20261104`，胜利路径 13 条指令见 [winning-commands.json](../winning-commands.json)。浏览器步骤读取开发模式只读状态作比较，操作均通过真实界面提交；没有修改游戏血量或随机数、没有用脚本替换规则结算。

正常速度完整通关与快进战果逐字段一致。三兄弟有人败退时即时停止敌军；重试恢复初始状态。保存/继续保留随机与经验；简雍仅在胜利对白完成后入队一次。另验证预移动撤销、预测、双击、长按、标签页切换、网格/威胁开关以及 1024×850 视口点击。

`12-production-subdirectory.jpg` 来自静态 HTTP 的 `/dist/` 子目录；48 张图片经加载器真实解码，页面无控制台错误。此为开发者浏览器验收，用户审美与平衡体验仍待验收。

最终核对 HTTP 日志发现，早期生产截图 12/14 虽可运行，CSS面板/血条仍有相对路径错误。该问题已修复；[返修前报告](qa-report-before-css-fix.json)保留，当前以[CSS地址](css-urls.json)、[HTTP复验](css-http-check.json)、[服务器日志](production-http.txt)和截图15为准。5个CSS/图标请求全部200，本轮62次HTTP请求无4xx/5xx。
