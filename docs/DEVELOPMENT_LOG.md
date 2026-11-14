# 真实开发记录

日期均按Asia/Shanghai。记录仅陈述已发生事项，计划使用“待执行”。原始对话保留在当前Codex聊天；本文件是工作记录，不替代竞赛所需完整Prompt导出/截图/录屏。

## 2026-11-14 接管与检查

- 用户提交V1.0完整接管档案，授权核验真实工程、创建四份上下文文档并开始阶段0。
- 实查 `D:\ShadeTime` 可访问，工作区干净，main跟踪origin/main，本地和 `git ls-remote origin refs/heads/main` 返回 `d63644dab01985196022cfa4882ade04589326d7`。
- 读取现有README/.gitignore，仅两个文件；未重置、删除、覆盖已有工作。未发现适用AGENTS.md。
- Node实际版本v24.22.1；直接执行 `npm --version` 失败：PATH中未找到npm。正在准备隔离临时npm，不改系统安装或项目技术栈。
- 读取用户Word附件的完整正文，核对材料、评分与日期；附件没有15:00明确时刻，晋级口径仍待官方核验。
- 已向用户询问《荫时》专用供应商/模型/Base URL，要求密钥只存本机服务端环境变量，不进入聊天。未借用旧项目API。
- 首次尝试获取SunCalc `v1.9.0/test/test.js` 返回404，不能把猜测标签当作依据；下一步从npm发布元数据定位真实gitHead。
- 创建 PROJECT_CONTEXT.md、DEVELOPMENT_ROADMAP.md、TECHNICAL_DECISIONS.md 和本日志，建立冻结规格与待验收边界。

## 2026-11-14 依赖与数值验证

- npm 11.6.2从官方registry下载到聊天工作目录，SHA512与发布元数据一致；通过 `node <临时npm>/bin/npm-cli.js` 执行，不改全局安装。`npm install --ignore-scripts --no-fund` 实际安装2个包，审计报告0漏洞；这是当次依赖审计结果，不是整套应用安全保证。
- 锁定Three 0.160.0 / SunCalc 1.9.0，生成package-lock.json。新增.gitattributes规定源文件LF。
- 获取SunCalc发布元数据gitHead=`6bc2757074c1e5eaa2389aa2ab36806f04c6d2a0`。错误的test/test.js路径返回404；GitHub树API还遇到未认证限流。随后读取该提交根目录test.js成功，确认两个基准数值。
- 上游来源：`https://raw.githubusercontent.com/mourner/suncalc/6bc2757074c1e5eaa2389aa2ab36806f04c6d2a0/test.js`。本地UTF-8保存副本SHA256=`9C043CF440B06A4B95FF77911812FE2C9E3B2602841916563B3D6AEE78506071`。未声称执行整套上游tests，只迁移其中太阳位置回归断言。
- 检查实际UMD导出后实现浏览器适配器；核心sun.js/geometry.js由Node和浏览器共用。建立独立盒G夹具、光照定位辅助与21项自动化测试。
- 执行 `node --test --test-reporter=spec test/sun.test.js test/geometry.test.js`：21 PASS、0 FAIL。包括跨进程TZ验证、非法日期、0/2/5°、上游数值、命中/反向/平行/表面/多物体、100点地面1.0与1.5米0.3。测试未覆盖完整庭院业务逻辑。
- 用户真实回复专用配置：DeepSeek，deepseek-flash，https://api.deepseek.com。仅检查专用变量存在性，结果false；项目.env不存在。已请用户在本机配置，未读取其他项目密钥。

当前：数值验证已通过，HTTP/WebGL待执行；真实AI连通性缺密钥，保持BLOCKED。
