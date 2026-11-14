# ShadeTime Phase 1.5 Batch 1A 验收报告

日期：2026-11-14，Asia/Shanghai。基线：50893b8bdce79e683ee639d7dd45560673fad727。分支：feature/phase1.5-batch1a-visual-foundation。

**裁决：GO WITH CONDITIONS。** 本批建筑样板、几何/代理绑定、功能及回归验收通过；本机独立Edge前台样本达到合理交互帧率，但存在已记录的窗口/宿主条件相关低帧异常，不能宣称所有环境稳定60/240FPS。视觉样板已可运行、可近距查看，最终审美验收由项目负责人根据真实截图确认。

本批不包含Batch 1B、B2精细立面、树木或AI业务。未推送、未合并main、未读取.env、未安装依赖、未下载资产。

## 1 基线与运行

- 开始时HEAD为阶段1归档50893b8，工作区干净、七笔阶段1提交完整；新分支不存在后才创建，未覆盖工作。
- Node v24.22.1；Three 0.160.0 / SunCalc 1.9.0与lockfile一致。
- 原55项开始时全通过（636.9038ms）；最终原测试文件、分析域、数学核心和依赖相对基线无改动。
- 页面：http://127.0.0.1:3000/courtyard 。已有服务就直接访问，勿在3000重复启动。

```powershell
Set-Location -LiteralPath 'D:\ShadeTime'
git switch feature/phase1.5-batch1a-visual-foundation
node --test --test-reporter=spec
node server/index.js
```

服务以不加载.env方式启动。本轮测试使用原AI诊断模拟传输，真实供应商调用次数0。

## 2 实际实现与文件清单

| 模块/文件 | 实际职责 |
| --- | --- |
| src/view/visual-config.js | 固定seed、0.6米铺装模数、质量档及连续视觉日光曲线 |
| src/view/visual-materials.js | 九个共享材质族、15张程序化源贴图、色彩空间/纹理所有权 |
| src/view/shadow-proxies.js | 七实体ID、分析Box、视觉组、阴影代理、视觉版本及包络验证 |
| src/view/box-parts.js | 真实米制面UV、按材质合并实体构件 |
| src/view/building-visuals.js | B1院侧双层/六开间立面，171构件合为5个材质网格 |
| src/view/ground-visuals.js | 1260块铺装、两组InstancedMesh加底面，边界裁切与UV尺度 |
| src/view/canopy-visuals.js | TD004内收收口、顶板接缝、包络内连接饰面及柱面分段 |
| src/view/visual-scene.js | 静态建筑/地面常驻，棚体变换与辅助层分离 |
| src/view/render-pipeline.js | sRGB、色调映射、环境反射、太阳、缓存阴影、实际WebGL A/B |
| src/view/camera-rig.js | 整体/立面/铺装/棚体/俯视、Orbit及建筑外部相机约束 |
| src/courtyard.js（修改） | UI协调、解析计算接入、诊断上下文失效及实际5秒性能采样 |
| public/courtyard.html/css（修改） | 近景入口、场景放大、辅助显示、色调对照与测量入口 |
| server/app.js（修改） | 明确允许上述ESM及现有BufferGeometryUtils；未开放任意目录 |
| test/visual-foundation.test.js | 新增3项材质、代理与日光测试 |
| test/visual-model.test.js | 新增6项实体/铺装/TD004/变换/资源测试 |
| test/visual-http.test.js | 新增1项本地模块加载与私有文件隔离测试 |
| 工程文档与本报告 | README、上下文、决策、路线、真实日志、Prompt索引与证据 |

代码受测版本：a8ed43610afe546d0635f5bc13c290c31b36cda0。此后的归档提交只增加文档和证据。

## 3 建筑、铺装和棚体样板

### B1

保留X[-12,-8]、Y[0,6]、Z[-9,9]。18米院侧立面由两层、六开间组成，包含真实墙段、凹入揭口、窗框/分格、窗台、基座、层间带、屋面收口和双扇门把手。构件都位于原体积内，按材质合并，不以171个独立Mesh提交。

背后保留完整不透光实体；Physical玻璃transmission=0、transparent=false，不制造真实贯通洞口。B2继续保持单一原盒体，只使用共享涂层和统一光照，未展开B2设计。

### 地面

采用0.6米模数、4毫米缝。按庭院/通道精确边界裁切，区分石材和通道铺装，合计1260块，仅两组实例批次，另有灰缝底面。顶面保持Y=0，砖体和缝位于其下。裁切砖的纹理按实际宽深缩放，不把整张贴图压进窄条。

BaseColor、Normal、Roughness来自确定性程序，不含烘焙太阳阴影。不用贴图阴影或底板高度替代参考面。

### TD004

保持3×3米、Y[2.4,2.5]顶板；柱中心与截面直接来自原场景，四柱Y[0,2.4]。新增顶板涂层、1米板缝、内收边缘及屋顶盒内连接饰面。柱体全高保持0.1×0.1截面，底/顶面采用饰面分段，不加外露底座、斜撑或下挂横梁。

## 4 分析、外观与投影绑定

每个实体登记entityId、analysisBox、proxy、visual、变换及batch1a-v1视觉版本。原分析场景版本仍courtyard-v1，业务布局和几何未换版本。

代理保持visible=true、castShadow=true，主画面colorWrite/depthWrite=false，绘制后恢复写掩码；外观castShadow=false、receiveShadow=true。封闭代理采用BackSide深度，避免原外包体把内收立面全部当成内部自遮挡。该做法针对闭合盒体：外部参考点的穿体占据不变，不意味着支持任意镂空/透明代理。

运行时只允许七个可绘投影者：B1、B2、C_ROOF、C_POST_NW/SW/NE/SE，禁止未登记或重复投影。外观包络检查允许1e-6米Float32表示误差，不修改分析精度或1厘米业务规则。

### 实际WebGL验证

对真实场景320×240离屏目标执行A/B，固定阴影能力及材质着色分支，只切代理可见/投影状态：

| 采样 | 代理主通道颜色差异 | 投影开关差异像素 | 投影者 | 实际变换代理射线 |
| --- | ---: | ---: | ---: | ---: |
| 内嵌15:00 | 0 | 3420 | 7 | 200/200 |
| 内嵌08:00 | 0 | 653 | 7 | 200/200 |
| 内嵌16:00 | 0 | 4904 | 7 | 200/200 |
| 独立Edge 15:00 | 0 | 1955 | 7 | 200/200 |

不同机位/画布使像素数量不同，不能互相当成遮阴率。Edge中有影/无影提交为34/27，七个额外提交对应全部代理；细部没有重复投影。诊断另对两个参考面的200条实际变换后Box射线复核，业务分析调用次数不变。

PCF、偏移和栅格精度仍会产生边缘显示差异；这里没有声称截图像素与解析采样百分比逐点完全相等，也没有从画面亮度计算比例。

## 5 PBR、光照与相机

- 混凝土、涂层、石材、棚顶、涂层金属为共享Standard材质；玻璃为不透光Physical材质。
- 15张512×512程序化源图：BaseColor为sRGB；Normal、Roughness为NoColorSpace。涂层metalness采用常量0，未使用Metalness/AO贴图，不伪称已有全通道扫描资产。
- 参数为本批样板的艺术校准值，不是材质、照度、天气实测。没有外部模型、照片纹理或HDR下载。
- sRGB输出，默认ACESFilm、曝光1。同机位08:00、相同曝光实际比较NoToneMapping：ACES亮部较中性，浅色墙面/石材范围较稳；NoTone更偏暖。两种图都保留，业务指标均0%/70%，不是依据映射名称直接采用。
- 程序化环境为没有太阳盘的柔和天/地反射，PMREM仅初始化一次；唯一方向光使用原SunCalc向量。日光强度/颜色和补光随高度连续变化，不是辐照度模型。
- 2048 PCFSoft阴影，normalBias 0.0015米、bias -0.00004；范围仍由全场包围球派生。日期/时间或棚位变化标脏；相机和仅区域移动不要求重算太阳阴影。
- 总览near=0.3米、近景near=0.06米，减少远景浅接缝深度竞争。五个观察预设保留Orbit，相机不进入扩展后的建筑包围体。
- 相机独立性重测：业务analysisRuns为1→1，比例不变。验证与帧率结果随对应上下文变化失效，避免过期PASS。

## 6 回归与新增测试

最终单次Node运行同时记录spec与TAP，65 PASS、0 FAIL/SKIP/CANCELLED、退出码0，1257.8795ms：

| 分组 | 数量 | 结果 |
| --- | ---: | --- |
| 原有阶段0/1 | 55 | 全部PASS，文件及原预期未改 |
| 材质/代理/连续日光 | 3 | PASS |
| 立面/铺装/静态资源/TD004/3200条变换射线/实例释放 | 6 | PASS |
| HTTP与模块加载 | 1 | PASS |

保护路径相对50893b8的Git diff为空：src/core、src/domain、src/probe、原lighting/courtyard-model、原页面/样式、package/lockfile及全部原10个测试文件。没有减少100点、删除测试或改变太阳/求交预期。

浏览器再次确认R2/R5拒绝并保留R3/R3，15:00仍20%/90%；08:00为0%/70%，16:00为0%/60%；低于5°、夜间和15:01均N/A，非法时间还清除太阳读数。已知时刻的21个记录与Node再算一致。全部原始迭代保留，不把30个混合记录统称30项最终PASS。

## 7 真实性能、加载与资源

### 设备和方法

LENOVO 83LT，AMD Ryzen 9 8945HX，16核32逻辑处理器；系统报告物理内存16,962,326,528字节。WebGL报告NVIDIA GeForce RTX 5060 Laptop GPU、ANGLE D3D11。独立Edge 157.0.0.0，Windows。

下表是用户确认电脑解锁、Edge置前后取得的实际样本；画布CSS 1643×666，DPR 1.5，drawing buffer 2464×999，非笼统称为“1080p”。RAF每回调实际调用render，记录真实间隔；CPU提交不是GPU时间，未进行GPU计时器测量。

| 视角 | 窗口时长ms | 帧数 | 平均FPS | RAF P95 ms | CPU提交P95 ms | Draw Calls中位 | 提交三角形中位 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 整体 | 5000.2 | 1200 | 239.99 | 4.3 | 0.3 | 27 | 17546 |
| 立面 | 5000.2 | 548 | 109.60 | 8.6 | 0.4 | 9 | 17186 |
| 铺装 | 5804.3 | 274 | 47.21 | 20.9 | 0.5 | 27 | 17546 |
| 棚体 | 5254.4 | 202 | 38.44 | 29.2 | 0.5 | 27 | 17546 |

绘制统计在每次实际render前清零并包含该调用内的阴影提交。稳态复用阴影时27次；验证的更新帧为34次。三角形是提交量，不等于屏幕可见量。视角裁剪使立面提交数较少。

### 必须保留的异常

内嵌另有2.53和1.00FPS；独立Edge最初4.38FPS。可见/焦点标志为true仍出现长RAF间隔，不能仅凭这些标志排除系统/宿主影响。用户随后确认前台，复测取得上述结果；铺装和棚体前台样本仍各有4次超过250ms的RAF间隔。

**这些低值没有删除。没有证实唯一根因，也不能据此宣称始终稳定60或240。** 当前前台样本达到合理交互平均帧率，长期稳定性和其他设备仍待验证。CPU提交不足1ms仅用于定位，不能冒充GPU完成时间。

### 加载与资源

Edge该次本地导航：DOMContentLoaded约412.7ms，导航duration 416ms；程序化纹理生成156.7ms；首个render调用返回时刻约988.7ms（相对导航，不是屏幕呈现/LCP）。ResourceTiming包含27条子资源、transferSize合计1,431,391字节，不含主文档导航；纹理由代码生成，无纹理下载。localhost条件不能外推公网加载。

20次真实棚位切换前后：27份renderer几何、17张纹理、11个程序，静态组ID相同。它们是对象数，不是VRAM字节。静态建筑/地面常驻，动态棚变换；共享材质/纹理不随位置重建。实例缓冲、自有几何/克隆材质、环境与阴影目标有独立释放责任，BFCache保留页面时不销毁。实例释放与共享纹理保留契约测试通过；未声称长期GPU内存回收已测。

## 8 实际截图与原始证据

全部来自实际运行浏览器，没有生成图片冒充截图。路径相对本报告：

| 证据 | 文件 |
| --- | --- |
| 整体 | ../evidence/batch1a/images/batch1a-overview.jpg |
| B1近景 | ../evidence/batch1a/images/batch1a-facade.jpg |
| 石材近景 | ../evidence/batch1a/images/batch1a-paving.jpg |
| 棚体近景 | ../evidence/batch1a/images/batch1a-canopy.jpg |
| 夏季上午/下午（不同投影方向） | batch1a-summer-morning.jpg / batch1a-summer-afternoon.jpg，同一images目录 |
| 同机位ACES/NoTone | batch1a-tone-aces.jpg / batch1a-tone-none.jpg |
| 夜间/低太阳 | batch1a-night.jpg / batch1a-low-sun.jpg |
| 独立Edge三近景及迎光B1 | batch1a-edge-facade.jpg / edge-paving.jpg / edge-canopy.jpg / edge-facade-sunlit.jpg（均带batch1a-前缀） |
| 原始测试 | ../evidence/batch1a/all-tests.tap 与all-tests.spec.txt |
| 全部30个浏览器混合迭代记录 | ../evidence/batch1a/browser-records.json |
| 数据汇总/保护路径/已知时刻再算 | ../evidence/batch1a/summary.json |
| 初次代理失败及基础修复通过 | proxy-initial-failure.json / proxy-foundation-pass.json |
| 迎光自遮挡调整前 | images/self-shadow-before.jpg |

raw文件的历史标签可能包含final字样，但历史诊断失败没有因此改成PASS。判断最终结果应结合后续rechecked/verified/edge记录、代码提交及本报告；原始快照内容保留。

## 9 真实问题与修复

1. 初次WebGL A/B投影差异0：保留失败；恢复写掩码后仍0，改为固定阴影着色能力只切投影者，才通过。未降低阈值、删除代理或关闭阴影。
2. 诊断误把光源castShadow算作物体：改只数可绘投影者，逐ID/角色核验，仍要求恰好7。
3. 内收立面被外包代理自遮挡：以闭合盒BackSide投影解决并实际检查迎光面，原解析体积不变。
4. 诊断JSON发布滞后：首轮相机核对读到旧快照5→6；同步发布后重测1→1，数值不变。不是虚构相机修复数学Bug。
5. 远景浅缝存在深度冲突：改善相机near及场景画布布局，没有抬高分析面。
6. 低帧异常：保留所有样本，补充焦点/可见/CPU提交记录，并请求真实桌面条件后在独立Edge复核；未降低分析精度。

这些是助手执行已授权任务时的真实发现，不补写不存在的用户修复Prompt。

## 10 提交与停止点

| 代码提交 | 内容 |
| --- | --- |
| aaa0269e9b2c29d1b5b3ba113aaa84ec896fec3f | 共享PBR、可复现表面与显式代理绑定 |
| 59afdaab20f431adafea1606ea6a6c27bf144671 | B1、实例铺装、渲染管线与近景基础 |
| a8ed43610afe546d0635f5bc13c290c31b36cda0 | TD004饰面、验证/性能/资源生命周期及65项回归 |

正式文档/截图归档另作本地提交。归档后的HEAD、完整清单与干净状态写入交付副本，并可在git log中复核，避免文档自引用自身提交SHA。

main仍7bf34be，阶段1分支仍50893b8。本批不推送、不合并、不改全局Git配置。

## 11 已知限制与未完成项

- B1院侧为本批样板，其他立面/B2仍简化；无树木和完整校园环境。
- 程序纹理、柔和环境和日光曲线是可复现视觉近似，不是扫描材质、气象、辐照或全局光照实测。
- 玻璃不透光；没有真实室内、贯通窗、透射或树叶Alpha分析。
- GPU时间/VRAM、长时稳定性、跨设备/手机/全面浏览器验证均NOT RUN。已测内嵌与独立Edge，不把它称为全部浏览器兼容。
- 阴影栅格软边不用于1厘米业务判定或数值比例。
- 时段统计、候选排名、AI三链、保存撤销、比赛视频/PDF仍未完成。

本轮仅完成Batch 1A，后续开发与GitHub推送等待用户明确指令。
