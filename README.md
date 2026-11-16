# 荫时 ShadeTime

面向校园户外活动组织者的 AI 三维遮阴实验与布置决策实验室。

目前完成**阶段0、阶段1及Phase 1.5 Batch 1A/1B/1C**：在完整24×18米庭院与可信双高度时段分析上，新增真实DeepSeek需求解析、草案确认、合法候选建议、A/B预览与服务端重算应用，以及双高度证据解释。原盒G独立验证页保留。当前119项测试通过（原93项＋Batch 1C新增26项）；三条真实AI链已在本机Edge实际验收。

保存撤销、完整竞赛材料、B2精细立面和树木仍待后续开发。本批未新增遮挡物。当前改动只在本地功能分支，未经批准不推送、不合并main。AI失败或回复不合规时会拒绝并保留手动分析，不能保证每次模型调用成功。

## 本地运行当前样板

环境：Node.js 24.x（本机实测v24.22.1）和随Node发行的npm、支持WebGL的桌面浏览器。仅有两个精确依赖：Three.js 0.160.0、SunCalc 1.9.0；无构建步骤或数据库。

在PowerShell中：

```powershell
Set-Location -LiteralPath 'D:\ShadeTime'
git switch feature/phase1.5-batch1c-ai
node --test --test-reporter=spec
node --env-file-if-exists=.env server/index.js
```

庭院入口：http://127.0.0.1:3000/courtyard 。独立盒G入口：http://127.0.0.1:3000/ 。若3000已有本项目服务，直接打开网页，不再启动第二个实例。

在包含当前样板提交的干净源代码目录中，先执行 `npm ci --ignore-scripts`，再运行测试和服务，无构建步骤。本地main及origin/main引用仍为阶段0基线；远程克隆不能获得尚未推送的阶段1/1.5本地分支。上述D盘工作目录已有锁定依赖，本轮未安装额外依赖。

若环境只有node而没有npm，可使用完整Node发行环境的npm，或通过 `node <npm安装目录>/bin/npm-cli.js ci --ignore-scripts` 调用官方npm CLI。阶段0曾使用校验过的临时npm 11.6.2；临时路径不属于项目依赖。

手动庭院功能不需要密钥；真实AI需要本机已有SHADETIME_AI_API_KEY。以上启动命令仅在Node服务端加载.env，密钥不进入浏览器。原/api/health保留阶段0兼容契约；服务仅监听127.0.0.1。没有配置时AI返回AI_UNAVAILABLE，手动分析仍可用。

## 手动验收

AI闭环：在顶部“AI空间助手”解析默认活动需求，核对日期/时段/高度/权限/目标后点“确认约束草案”，再点“生成布置建议”。程序重算有限合法候选后，DeepSeek只能选择达标候选ID；点击“预览AI建议B”不会改变正式A，只有确认应用才进行服务端与本地二次计算并应用。可以切A/B或拒绝。改变业务条件使旧结果失效。

证据解释：设置R1区域/R3棚、2026-06-21 14:00–14:15，在侧栏选择P56，再点“解释当前证据”。实际地面命中B1、1.5米未命中。AI只组织文字，命中对象、交点和引用由服务器重建；点击证据定位按钮显示对应双射线。切观察上下文后旧解释清除。

1. 打开/courtyard，默认R3区域＋R3棚、2026-06-21 15:00–16:00，间隔15分钟。1.5米五值90/80/80/70/60%，梯形平均76.25%，最低60%在16:00。地面独立平均5%、最低0%。
2. 切换参考高度或采样时刻：曲线、当前遮阴率与三维太阳联动，不重新执行整段计算。结束设15:20时包含15:00、15:15、15:20，末段按5分钟加权。
3. 默认只移区域、最低目标80%，点击“计算合法候选”：6组检查、4合法、2通道拒绝；预览R1/R3得平均/最低100%。正式布局仍为R3/R3，只有“确认应用B”才修改。
4. 切回A或拒绝预览可恢复原显示。两者均可移动时检查24组、16合法；只移动棚时保留当前区域。最低不达标的候选可看但不能确认成达标方案。
5. 选择R2/R5会拒绝并保留原布置。日期、时段、间隔、高度或约束变化清除旧候选；午夜/低太阳高度使必要采样无效，整段N/A，不跳过点。活动限同日15–120分钟、5分钟输入步长，不支持跨午夜。
6. R1区域＋R3棚、2026-06-21 14:00–14:15，选P56：地面命中B1，1.5米未命中。切采样、布局、分析或相机后旧证据清空。单点不代表整个区域。
7. 俯视为北上东右；可旋转、缩放、重置视角。相机只改变观察上下文，不改变数值分析版本。辅助对象不进入七个遮挡实体，阴影贴图不参与比例计算。
8. 打开/的独立盒G页面，人工45°下仍为100%/30%，与业务庭院隔离。原太阳/射线和全部旧测试未改。

建筑样板可用“整体/立面/铺装/棚体/俯视”查看，或放大场景。实验辅助显示默认关闭；相机切换不调用业务分析。展开“渲染验证与性能”可对照ACES与NoToneMapping并执行实际WebGL代理A/B；画布下方按钮采样真实5秒RAF/render帧率。请保持独立Edge窗口前台，报告保留了低帧异常，不保证所有窗口条件稳定高帧。

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
- `src/view/visual-*.js`及其他样板模块：共享材质/静态场景/显式代理、立面、铺装、棚面和渲染管线。
- `docs/reports/ShadeTime-Phase1.5-Batch1A-Acceptance.md`：本批验收；`docs/evidence/batch1a/`：65项原始测试、浏览器全部迭代/性能异常及实际截图。
- `src/domain/period.js`、`candidates.js`、`decision-session.js`、`point-evidence.js`：时段、合法比较、单调版本门禁、双高度证据。
- `docs/reports/ShadeTime-Phase1.5-Batch1B-Acceptance.md`：本批验收；`docs/evidence/batch1b/`：93项spec/TAP、逐阶段RED/GREEN、浏览器/性能记录、终审失败与修复、最终截图和Node交叉复核。
- `server/ai-client.js`、`ai-protocol.js`、`ai-service.js`、`ai-http.js`：固定供应商调用、严格协议、服务端权威会话与HTTP边界；`src/view/ai-workflow.js`、`ai-panel.js`接入真实交互。
- `docs/reports/ShadeTime-Phase1.5-Batch1C-Acceptance.md`及`docs/evidence/batch1c/`：119项输出、真实API成功/失败、三链浏览器记录与截图、本轮完整指令转录。会话仅服务端内存，20分钟失效，重启需重新解析确认。

自动化测试不调用真实供应商。`node --env-file-if-exists=.env scripts/check-ai-business.js <新的输出路径>`会发出真实业务请求。可选浏览器验收`node scripts/check-ai-browser.mjs <已有playwright-core/index.mjs绝对路径> <新的输出JSON路径>`使用本机Edge，无浏览器下载；测试工具不属于应用依赖。实际验收使用外置playwright-core 1.65.1。

原始对话保留在当前Codex聊天。过程索引是摘录，尚不能替代赛事要求的至少3条完整Prompt链。访谈、用户测试、视频、最终PDF和跨设备性能验收尚未执行；本机浏览器性能样本见专项报告，不是跨设备保证。

## 计算边界

+X东、+Y上、+Z南。SunCalc 1.9.0角度单位为弧度、方位从南起算；界面罗盘单独转换。太阳向量指向太阳，灯光传播相反。射线算法是Three.Ray.intersectBox，原点在实体内部/表面视为无效，不删采样点。

大连坐标是城市级近似；1.5米是实验参考高度。离散采样不是连续面积或全时段遮阴保证，不推算温度、紫外线或人体健康。完整模型规则见项目上下文。
