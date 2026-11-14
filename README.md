# 荫时 ShadeTime

面向校园户外活动组织者的 AI 三维遮阴实验与布置决策实验室。

目前完成**阶段0核心技术验证**：有可运行的独立盒G实验页、共享太阳/射线模块、自动化测试、本地HTTP和DeepSeek真实连通性诊断。完整庭院、候选优化、保存撤销和AI三条业务链仍待后续开发。不能把此原型当作完整竞赛作品。

## 十分钟复现阶段0

环境：Node.js 24.x（本机实测v24.22.1）和随Node发行的npm、支持WebGL的桌面浏览器。仅有两个精确依赖：Three.js 0.160.0、SunCalc 1.9.0；无构建步骤或数据库。

在PowerShell中：

```powershell
git clone https://github.com/shuangliangziguangpu/shade-time.git
Set-Location -LiteralPath '.\shade-time'
npm ci --ignore-scripts
node --test --test-reporter=spec
node --env-file-if-exists=.env server/index.js
```

打开 http://127.0.0.1:3000 。当前阶段代码仅提交本地时，远程克隆仍会得到较早版本；请使用提供的本地仓库或待负责人批准推送后的提交。以实际Git历史为准。

若已有本地 `D:\ShadeTime`，从该目录运行后面三条命令即可。若执行环境只有node而没有npm，需使用完整Node发行环境的npm，或通过 `node <npm安装目录>/bin/npm-cli.js ci --ignore-scripts` 调用官方npm CLI；本轮Codex使用经官方发布SHA512校验的临时npm 11.6.2，不把临时路径写进项目依赖。

没有密钥也能运行全部数值和HTTP测试、打开三维页面。启动时的“.env not found”提示不影响几何实验。默认仅监听127.0.0.1；若端口占用，可设置 `$env:PORT='3001'` 后启动。

## 手动验收

1. 默认人工基准：正东、太阳高度45°。地面显示100/100，离地1.5米显示30/100。
2. 切换参考面：证据点P56从地面命中G变为1.5米未命中；蓝线和采样点同步更新。
3. 切到真实日期：2026-06-21 12:00显示太阳高度约74.5°、北零顺时针方位约183.9°。
4. 将时间改为00:00：指标N/A，提示太阳在地平线以下。04:45：高度约1.9°，提示低于5°限制。
5. 拖动旋转、缩放，检查真实WebGL与阴影。阴影贴图不参与指标计算。

这是独立盒G的数学夹具，区域范围X[-0.95,1.05]、Z[-1,1]；它用于已定义的100点回归，不作为通过业务合法性检查的完整庭院布局。

## DeepSeek连通性

用户指定供应商DeepSeek、模型deepseek-flash、Base URL https://api.deepseek.com 。它们固定在服务端 `server/ai-connectivity.js`，客户端不能传URL或模型。

首次配置：复制 `.env.example` 为 `.env`，只在本机编辑以下变量；若文件已存在，请保留现有配置。Windows记事本保存时确认没有追加.txt。

```dotenv
SHADETIME_AI_API_KEY=在本机填写专用密钥
```

```powershell
node --env-file-if-exists=.env scripts/check-ai.js
```

脚本先检查 `/models` 中是否含用户指定模型，再发出一次最小JSON请求；共享20秒超时。PASS返回退出码0，FAIL为1，缺密钥BLOCKED为2。可能产生极少量供应商调用费用。它只证明连通性与最小输出格式，不是空间解释/约束理解/建议验证的业务验收。页面显示密钥配置状态，真实联网结果见验收报告。

`.env`、`*.env`、`*.env.*` 被Git忽略，`.env.example`是无密钥模板；静态服务只开放显式资源清单。不要把密钥放进前端、截图、对话、保存方案或Git。

## 工程结构与证据

- `src/core/`：Node和浏览器共享太阳和解析式射线代码。
- `src/probe/`：阶段0独立几何夹具；`src/view/`：太阳光照接线。
- `src/main.js`、`public/`：最小验证页及原版SunCalc的浏览器适配器。
- `server/`：Node内置HTTP、服务端AI诊断；`test/`：node:test。
- `docs/PROJECT_CONTEXT.md`：冻结范围；`docs/TECHNICAL_DECISIONS.md`：决策。
- `docs/DEVELOPMENT_ROADMAP.md`：阶段门槛；`docs/DEVELOPMENT_LOG.md`：真实过程。
- `docs/PHASE0_ACCEPTANCE.md`、`docs/evidence/`：验收、输出与Prompt过程索引。

原始对话保留在当前Codex聊天。过程索引是摘录，尚不能替代赛事要求的至少3条完整Prompt链。访谈、用户测试、视频、最终PDF和性能验收尚未执行。

## 计算边界

+X东、+Y上、+Z南。SunCalc 1.9.0角度单位为弧度、方位从南起算；界面罗盘单独转换。太阳向量指向太阳，灯光传播相反。射线算法是Three.Ray.intersectBox，原点在实体内部/表面视为无效，不删采样点。

大连坐标是城市级近似；1.5米是实验参考高度。离散采样不是连续面积或全时段遮阴保证，不推算温度、紫外线或人体健康。完整模型规则见项目上下文。
