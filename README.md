# 荫时 ShadeTime

面向校园户外活动组织者的 AI 三维遮阴实验与布置决策实验室。

目前完成**阶段0与阶段1工程原型**：完整24×18米庭院、固定建筑、一个TD004遮阳棚、有限位置选择、欧氏净距验证及两个参考面的单时刻遮阴计算。计算与显示来自统一几何数据。原盒G独立验证页继续保留。当前共55项自动化测试（原28项＋新增27项）通过。

时段平均/候选排名、保存撤销、AI三条业务链和完整竞赛材料仍待后续开发。本原型不等于完整竞赛作品。阶段1只在本地功能分支，未经批准不推送、不合并main。

## 本地运行阶段1

环境：Node.js 24.x（本机实测v24.22.1）和随Node发行的npm、支持WebGL的桌面浏览器。仅有两个精确依赖：Three.js 0.160.0、SunCalc 1.9.0；无构建步骤或数据库。

在PowerShell中：

```powershell
Set-Location -LiteralPath 'D:\ShadeTime'
git switch feature/phase1-courtyard-scene
node --test --test-reporter=spec
node server/index.js
```

庭院入口：http://127.0.0.1:3000/courtyard 。独立盒G入口：http://127.0.0.1:3000/ 。若3000已有本项目服务，直接打开网页，不再启动第二个实例。

在包含阶段1提交的干净源代码目录中，先执行 `npm ci --ignore-scripts`，再运行测试和服务，无构建步骤。当前GitHub main仍为阶段0基线；远程克隆不能获得尚未推送的阶段1分支。上述D盘工作目录已有锁定依赖，本轮未安装额外依赖。

若环境只有node而没有npm，可使用完整Node发行环境的npm，或通过 `node <npm安装目录>/bin/npm-cli.js ci --ignore-scripts` 调用官方npm CLI。阶段0曾使用校验过的临时npm 11.6.2；临时路径不属于项目依赖。

阶段1运行不需要密钥，以上命令不加载.env。原/api/health保留阶段0兼容契约，旧验证页在此启动方式下显示AI未配置，不影响历史真实连通性证据。服务仅监听127.0.0.1。

## 手动验收

1. 打开/courtyard，默认R3区域＋R3棚、2026-06-21 15:00。实际结果为地面20%、1.5米90%；两个参考面分别计算100点。
2. 切换参考高度：G56在地面未命中，H56在1.5米最近命中C_ROOF。显示叠加点不属于遮挡实体。
3. 选择R2或R5，界面拒绝并保留之前合法布置。其他区域和四个棚位可选择；实心棚是当前实体，其他三个仅为候选线框，不投影、不参与遮挡。
4. R3区域改用R1棚，在默认15:00得到0%/0%；R1区域＋R3棚得到100%/100%，最近命中B1。
5. R3区域＋R3棚改为夏至12:00，结果90%/100%；00:00和04:45返回N/A；15:01被输入步长规则拒绝，旧指标不残留。
6. 切到2026-12-21 12:00，同布置实际为30%/40%，不是套用夏季结果。
7. 俯视为北上东右；可旋转、缩放、重置视角。参考点叠加开关只影响辅助显示，阴影贴图不参与比例计算。
8. 打开/的独立盒G页面，人工45°下仍为100%/30%，与业务庭院隔离。

盒G页面中的区域X[-0.95,1.05]、Z[-1,1]只用于数学回归，不是合法庭院布置模板。阶段1净距规则见TD006：XZ矩形最短欧氏距离至少0.010米，含等号及斜对角。

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
- `src/domain/`：不可变场景配置、统一几何、净距、严格ID合法性和业务遮阴入口。
- `src/probe/`：阶段0独立几何夹具；`src/view/`：太阳光照接线。
- `src/main.js`、`public/`：最小验证页及原版SunCalc的浏览器适配器。
- `src/courtyard.js`、`public/courtyard.*`：庭院页面；`src/view/courtyard-model.js`从同一状态生成网格和阴影覆盖。
- `server/`：Node内置HTTP、服务端AI诊断；`test/`：node:test。
- `docs/PROJECT_CONTEXT.md`：冻结范围；`docs/TECHNICAL_DECISIONS.md`：决策。
- `docs/DEVELOPMENT_ROADMAP.md`：阶段门槛；`docs/DEVELOPMENT_LOG.md`：真实过程。
- `docs/PHASE0_ACCEPTANCE.md`、`docs/evidence/`：验收、输出与Prompt过程索引。
- `docs/PHASE1_ACCEPTANCE.md`：阶段1验收及截图索引；`docs/evidence/phase1-all-tests.tap`：完整55项原始测试输出。

原始对话保留在当前Codex聊天。过程索引是摘录，尚不能替代赛事要求的至少3条完整Prompt链。访谈、用户测试、视频、最终PDF和性能验收尚未执行。

## 计算边界

+X东、+Y上、+Z南。SunCalc 1.9.0角度单位为弧度、方位从南起算；界面罗盘单独转换。太阳向量指向太阳，灯光传播相反。射线算法是Three.Ray.intersectBox，原点在实体内部/表面视为无效，不删采样点。

大连坐标是城市级近似；1.5米是实验参考高度。离散采样不是连续面积或全时段遮阴保证，不推算温度、紫外线或人体健康。完整模型规则见项目上下文。
