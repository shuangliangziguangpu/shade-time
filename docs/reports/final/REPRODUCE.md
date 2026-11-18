# ShadeTime 冻结候选版本复现步骤

完整作品候选分支为 `feature/phase1.5-batch1d-release`，`main` 保留阶段0。版本以交付包评审入口和 `git rev-parse HEAD` 为准。`ShadeTime-Phase1.5-Release-Readiness.md` 是旧公开基线的历史记录。

## 0. 公开分支快速复现（目标10分钟以内）

准备 Node.js 24.x、npm 和支持 WebGL 的浏览器。测试使用本地计算或模拟传输。启动读取本地 `.env`，无密钥仍可体验三维、手动分析和 JSON 保存恢复。10 分钟是复现目标，耗时取决于网络和设备。

```powershell
git clone --branch feature/phase1.5-batch1d-release --single-branch https://github.com/shuangliangziguangpu/shade-time.git shade-time
Set-Location -LiteralPath './shade-time'
git rev-parse HEAD
npm ci --ignore-scripts
npm test
npm start
```

打开http://127.0.0.1:3000/courtyard；先核对默认76.25%/60%，进行一次手动候选和保存刷新导入。3000占用时勿重复启动，另用进程环境变量PORT启动并打开对应端口。可读发布证据与实测耗时位于docs/evidence/release-publication。

## 1. 本机冷启动

环境：完整Node.js 24.x发行环境（本轮v24.22.1）、npm、支持WebGL的桌面浏览器；应用仅依赖Three 0.160.0和SunCalc 1.9.0，无构建、数据库或云服务依赖。真实AI需要网络与本机已有专用环境变量。

```powershell
git status --short --branch
git rev-parse HEAD
npm test
```

如工作区有不认识的修改，保留，不执行reset/clean。如果3000端口已有ShadeTime服务，直接打开下述页面，不启动第二个实例。可读检查：`Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue`。不要终止未经核实的进程。

没有服务时启动：

```powershell
npm start
```

- 庭院与AI助手：`http://127.0.0.1:3000/courtyard`
- 盒G独立验证：`http://127.0.0.1:3000/`
- 健康状态：`http://127.0.0.1:3000/api/health`

服务仅监听 `127.0.0.1`。需要真实 AI 时复制 `.env.example` 为 `.env`，在本机配置 `SHADETIME_AI_API_KEY`，由 `npm start` 在服务端读取。密钥仅留在本机服务端。缺少配置时仍可手动分析。供应商配置见根目录 README。

## 2. 干净源代码目录

从包含本地功能的Git归档或合法源代码副本开始，目录不得含.env、node_modules或别人的缓存结果。不要复制密钥。先`npm ci --ignore-scripts`，再执行上述测试与服务命令。只有node而无npm时，使用完整Node发行环境的npm，或`node <受信任的npm安装路径>/bin/npm-cli.js ci --ignore-scripts`，不要改项目依赖。

旧应用提交 `e691826` 的独立归档获得 130 项通过，原始输出见 `docs/evidence/final/batch1d-clean-repro.spec.txt` 与 `.tap`。B01 候选含新增 7 项，预期 137 项通过。模拟传输、真实 AI 调用与人工验收分别记录。

## 3. 固定手动场景

R3区域/R3棚，2026-06-21，15:00–16:00，15分钟采样，1.5米。五个采样值90/80/80/70/60%，梯形平均76.25%，采样最低60%在16:00；地面平均5%、采样最低0%。这些是本场景程序计算结果，不是任意场景通用常数。

只移区域/棚固定、目标80%时，6组合中4合法、2通道拒绝；R1/R3和R4/R3在此采样下最低/平均100%。最优仅限当前有限候选和采样规则，不是连续全时段保证。

保持 15:00 并选 P56。正式 A（R3/R3）地面直射，1.5 米命中 `C_ROOF`。预览 B（R1/R3）双射线均命中 `B1`，AI 解释禁用。切回 A 或确认应用 B 后重新选点可以恢复解释，程序事实随正式布局更新。

## 4. 保存与恢复

1. 点击“保存已确认场景 JSON”。导出正式A，即使当前正在看B预览也不保存B。
2. 保存文件只含项目/格式/几何/算法/采样版本及selection、period、height、constraints；没有比例、排名、射线或AI授权。
3. 刷新页面，或手动改为其他合法布局后，在“导入场景 JSON”选择保存文件。
4. 导入严格校验后调用原analyzePeriod重新计算，并清旧候选、点证据、AI会话和草案。导入完全相同参数也必须新建分析版本；旧确认不可复用。
5. 核对参数和重算结果。夜间合法任务可保存恢复，但结果仍N/A，不能强行显示正常比例。

样例文件由真实浏览器下载得到：`docs/evidence/final/batch1d-browser-initial-exported-scene.json`。文件上限16KiB。旧/未知版本不自动迁移；损坏JSON、非法ID/R2/R5、非法时间/高度、额外历史指标或令牌均拒绝。失败时保留当前状态，原文件不会被写回修改。

本功能没有LocalStorage自动恢复、云同步、账户、撤销或历史管理；重新打开需明确选择导入文件。下载成功后还需由浏览器/用户保管文件。

## 5. 自动化与人工验证分开执行

- 普通测试：`node --test --test-reporter=spec`，不调用真实API。
- 可选浏览器保存验收：`node scripts/check-release-browser.mjs <已有playwright-core/index.mjs绝对路径> <新的输出JSON路径>`。使用本机Edge，外置playwright-core 1.65.1不属于应用依赖，无需下载新浏览器。默认headless；即使用--headed也仍是自动化。
- 可选真实三链回归：`node scripts/check-ai-browser.mjs <已有playwright-core/index.mjs绝对路径> <新的输出JSON路径>`，会产生真实DeepSeek请求，失败记录也要保留。
- 人工验收：按Manual-Acceptance.md在真实前台操作并登记。目前用户明确尚未执行，不能引用自动化通过代填。

新增验证写入单独输出路径。参赛视频的录制版本和镜头时段见提交包的《视频版本与影响镜头》。人工结果单独登记。

## 6. 历史记录与发布状态

Phase 1 验收 `50893b8`、Batch 1D 归档 `35dbde3` 和旧公开基线 `c9c0d38` 均可从候选历史追溯。`final/manifest.json` 是 `35dbde3` 当时的快照。B01 证据见 `docs/evidence/b01-closeout`，最终包的 HEAD 和哈希见交付报告。
