# ShadeTime 最终候选证据索引

本目录整理既有真实证据及Batch 1D新增记录。**目录名final表示交付候选材料归档，不代表赛事提交、人工验收或视频录制已经完成。** 原Batch 1A/1B/1C目录不改写；文件哈希见manifest.json。

## 证据类别

| 类别 | 可以说明什么 | 不能冒充什么 |
| --- | --- | --- |
| LIVE_API | 实际请求DeepSeek、实际JSON回复及程序校验结果 | 不代表所有自然语言都能成功或有真实用户研究 |
| MOCK_TRANSPORT_TEST | 可控失败/非法输入下的真实程序行为 | 不是供应商在线调用成功 |
| DETERMINISTIC | 原太阳/射线/100点/合法布局/时段计算结果 | 不是AI自己计算或连续时间极值证明 |
| AUTOMATED_BROWSER | 真实运行页面、真实WebGL/按钮/文件下载/HTTP与截图 | 即使headed也不是前台人工可用性验收 |
| HUMAN_STATUS | 真实用户回报“本轮暂未执行人工验收” | 不能代填人工PASS |
| DERIVED_INDEX | 从原文件按JSON路径摘录、建立SHA256索引 | 不是新的API运行或重造原始历史 |

## 三条真实AI链

快速入口：`ai-chains-index.json`，明确记录原始source、SHA256、JSON pointer、原输入、请求ID、模型文字与程序事实。来源是Batch 1C实际browser-final.json，不冒充本轮新请求。确认/拒绝/应用由验收脚本操作，非人工访谈。

- **A需求理解**：`../batch1c/browser-final.json`的parse/confirm-draft；`../batch1c/ai-live-final.json`的真实结构化回复。
- **B空间解释**：上述文件的explain，R1/R3夏至14:00，P56地面命中B1、1.5米未命中；数值事实来自程序。
- **C布置建议**：recommend/reject/recommend/apply，候选ID白名单、只移区域、目标80%、B预览、明确确认与重算。
- **真实失败与拒绝**：`../batch1c/ai-live-initial.json`、`ai-live-protocol-recheck.json`；browser-final中的INVALID_INPUT类、NEEDS_CLARIFICATION、NO_FEASIBLE_CANDIDATE，以及原RED输出。原始失败保留，不选择性覆盖。
- **本轮整链回归**：`batch1d-ai-regression.json`及同名前缀PNG，当前Batch 1D页面实际再次请求DeepSeek并通过七场景。它仍是自动化浏览器，不是人工。

## 测试、保存与复现

- 原119项历史输出：`../batch1c/all-tests.spec.txt`、`../batch1c/all-tests.tap`，完整保留；本轮重新跑原119项：`batch1d-baseline-119.spec.txt`。
- 新保存模块RED/GREEN：`batch1d-save-red.spec.txt`、`batch1d-save-green.spec.txt`、`batch1d-module-final.spec.txt`。
- 当前完整回归：`batch1d-all-tests.spec.txt`、`batch1d-all-tests.tap`，原119＋新增11，共130项。早期模块全套输出另保留initial，不将其当最新运行。
- 保存浏览器验收：`batch1d-browser-initial.json`，六场景全PASS；同名前缀restored/rejected/AI-cleared/final PNG来自真实浏览器。
- 实际下载JSON：`batch1d-browser-initial-exported-scene.json`，只含参数，不含历史结果或令牌。可导入复核，不能据文件里的指标认定结果——文件没有指标。
- 干净重装：`batch1d-clean-install-tool-result.json`、`batch1d-clean-repro.spec.txt`、`.tap`，Git归档e691826、无.env、安装两个锁定包、130通过。
- 首次误在依赖安装结束前运行的失败：`batch1d-clean-repro-before-install-complete.spec.txt/.tap`，41个测试入口中22通过/19失败，缺包原因；保留且不冒充最终应用回归失败或成功。

## 人工、视频、Git与材料

- `manual-status.json`：负责人本轮真实答复，人工12项均NOT RUN。清单在`../../reports/final/Manual-Acceptance.md`。
- `../../reports/final/Demo-Storyboard-and-Recording.md`：7:20分镜，02:15–04:55计划为2:40真实AI协作；正式录制NOT RUN。
- `git-history.json`：索引时刻的真实提交链；后续归档提交可用`git log --oneline main..HEAD`核对。最终HEAD见本轮交付记录，索引文件不伪造自引用SHA。
- `../../reports/final/REPRODUCE.md`：环境、冷启动、固定任务、下载/导入、AI与普通测试分离运行说明。
- `../../reports/final/ShadeTime-Phase1.5-Batch1D-Acceptance.md`：本轮正式验收、待办与条件裁决。

完整原生会话导出、真实人工使用反馈、正式视频与最终PDF未完成。用户数、访谈、效果提升等数据没有编造或补写。平台提交和GitHub推送未执行。
