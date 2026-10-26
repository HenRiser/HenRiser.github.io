---
title: PROJECT-V M6：从单局生成到 Roguelite 元进度
date: 2026-10-03 08:00:00
summary: 在既有生成器上接入构筑上下文，贯通灵魂、永久升级和存档；用代表种子与资产级门禁验证元进度链路。
tags:
  - ProjectV
  - Unity
  - Devlog
---

M5 解决了“怎样生成一条可复现且可达的路线”。M6 接着处理“玩家带着什么构筑进入这条路线，以及这次冒险给下一局留下些什么”。阶段于 2026-06-30 完成，本文依据当时的工程提交、测试结果与交付报告补记。

实现的中心是 `BuildContext`：把武器、技能、永久升级和纯度整理成明确的输入，再交给既有生成与难度链路。围绕这个输入，灵魂结算、升级树、存档、Seed UI 和数据采集形成了元进度闭环。

<!-- more -->

## 从构筑上下文进入生成链路

M6 给 `LevelGenerator.GenerateRun` 和 `GenerateLevel` 增加了可选的 `BuildContext` 参数。旧调用可以继续传入 seed、原型注册表和难度配置；新的调用额外带上构筑信息。

```csharp
public static GeneratedRun GenerateRun(
    uint seed,
    RoomPrototypeRegistry registry,
    LevelConfigSO[] levelConfigs,
    DifficultyScalingConfigSO difficultyConfig,
    BuildContext buildContext = null)
```

`BuildContext` 包含当前武器、使用过的武器、U/I/O 技能效果、纯度、升级快照、协同结果，以及供难度评估使用的升级强度与世界覆盖数量。`BuildSystem.CreateContext` 统一计算这些派生值，避免 UI、生成器和升级系统分别推导一套规则。

路线仍由 seed 决定。构筑主要进入难度输入，而原有房间拼接规则与路线 hash 的稳定性保留。于是，同一路线可以承载不同构筑，也可以在复盘时分别定位“地图变了”与“玩家状态变了”。

`StableBuildHash` 提供构筑标识，`runHash` 提供生成路线标识。它们服务于可复现测试和日志关联；hash 相同本身并不是完整状态等价的证明。

工程入口均相对于 `PROJECT-V` 根目录：

- `unity-project/Assets/_Project/Roguelite/Scripts/BuildContext.cs`
- `unity-project/Assets/_Project/Roguelite/Scripts/BuildSystem.cs`
- `unity-project/Assets/_Project/Levels/Scripts/LevelGenerator.cs`

## 灵魂：分清本局收益与永久货币

`SoulSystem` 把货币分为 `RunSouls` 和 `BankedSouls`。普通敌人、精英、清房与 Boss 的奖励进入本局收益；通关结算可以全部入库，死亡则按保留比例入库，并清零本局收益。

默认死亡保留 50%，保留升级逐级增加比例，配置上限为 80%。奖励数值和比例来自 `SoulConfigSO`，可以调整数值而不改结算算法。

```csharp
var retained = Mathf.RoundToInt(
    RunSouls * CalculateRetainPercent(soulRetainUpgradeLevel));
BankedSouls += retained;
RunSouls = 0;
```

这个区分让死亡、通关和购买升级的职责明确：升级只从入库货币消费，死亡只结算尚未入库的本局收益。运行探针记录的死亡保留灵魂为 `280`；这个值是该探针情境的结果，不是每次死亡的固定奖励。

## 永久升级与构筑协同

永久升级以 `UpgradeNodeSO` 描述节点，`UpgradeCategorySO` 描述分类，注册表负责查找节点。当前有 Common、Wasteland、Cyberpunk、Biohazard 四条线，共 14 个节点，并保留 `IUpgradeCategory` 扩展接口。

`PermanentUpgradeSystem.TryUpgrade` 的顺序是查找节点、检查等级上限、扣除货币，最后增加等级。货币不足时返回失败，等级不会提前变化。导出的升级快照按升级 ID 排序，让稳定标识和持久化数据不依赖字典枚举顺序。

`BuildSystem.EvaluateSynergies` 检测八种武侠协同：武器组合、内外兼修、暗影刺客、真气护体、灵活身法、百兵之王、长兵组合、短兵组合。输入是武器集合、技能效果和升级信息，输出是独立的协同结果。

构筑强度通过升级权重和协同权重汇总，参数可由 `BuildConfigSO` 提供。它目前是难度评估的工程输入，权重是否能准确代表真人操作下的强弱，还需要后续样本验证。

`PuritySystem` 将纯度限制在 0–100，并读取升级节点的纯度消耗；镜像 Boss 触发判断使用低于 30 或高于 70 的区间。纯度参与构筑上下文，具体数值平衡仍要结合实际游玩观察。

## 存档：元进度与单局状态分别保存

`SaveSystem` 采用两种文件：

| 文件名 | 内容与格式 |
| --- | --- |
| `projectv_meta_save.json` | JSON 元进度：入库灵魂、永久升级等长期信息 |
| `projectv_run_save.bin` | 二进制单局状态：seed、路线 hash、房间索引、本局灵魂、build hash |

两类存档都有版本字段。元进度保留可读性，方便调试；单局状态采用固定字段顺序读写，减少格式歧义。保存位置由 Unity 的 `Application.persistentDataPath` 决定，方法也允许传入目录，方便隔离测试数据。

版本迁移入口已经存在，但它不代表完整的历史版本迁移方案。当前代码直接写入文件，也不能据此声称具备原子替换、损坏恢复或断电安全保证。这些是产品化存档需要继续核验的边界。

## Seed UI 与可关联的数据采集

`SeedDisplayUI` 与 `SeedShareService` 将种子暴露给玩家：显示、复制、解析和加载八位十六进制 seed。分享使用剪贴板字符串，当前没有联网分享服务。

`PlaytestDataCollector` 将房间、死亡、Boss 结果写为 JSON 事件。事件同时携带 `runSeed`、`runHash`、`buildHash`，再附上房间 ID、类型、世界、时间与压力值。

这三个标识支持有针对性的复盘：同一路线、不同构筑的死亡位置是否变化；同一构筑在不同路线中，Boss 前压力是否明显不同。M6 验证了事件采集与导出链路，尚未产生代表真实玩家表现的调参结论。

## 将生成验证拆成三种证据

M6 继续沿用 M5 生成器，门禁改为互补的三层：

1. **生成不变量**：Start 首房、Boss 末房、Shop/Rest 保底，以及 Elite 的位置和相邻限制。
2. **资产级门禁**：36 个原型的可达性、RoomConfig 引用和 prefab key 等完整性检查。
3. **代表 seed 门禁**：24 个固定 seed 覆盖不同生成情境，在运行探针中检查了 647 个房间。

原型级检查覆盖整个资产集合；seed 检查覆盖实际组合。二者承担不同职责，24 个 seed 通过不能替代所有可能路线的穷举，也不能单独证明帧率长期稳定。

构筑多样性门禁自动构造五个代表 build，得到五个不同的 stable hash。对应测试是 `FiveRepresentativeBuildsProduceDistinctHashes`。它验证构筑输入可区分，**不等同于五次真人通关，也不证明五个构筑都已达到玩法平衡**。

## 七个 OGG：从 hook 到打包资产

M6 补齐了七个原创程序化 OGG，接到房间与元进度反馈点，并由交付报告记录纳入 Windows build：

| 反馈 | 资产，路径相对 `unity-project/Assets/_Project/Audio/` |
| --- | --- |
| 房间切换 | `SFX/M6/sfx_room_transition_m6.ogg` |
| 关卡完成 | `BGM/M6/bgm_level_complete_m6.ogg` |
| 升级确认 | `SFX/M6/sfx_upgrade_confirm_m6.ogg` |
| 升级树打开 | `SFX/M6/sfx_upgrade_tree_open_m6.ogg` |
| 升级成功 | `SFX/M6/sfx_upgrade_success_m6.ogg` |
| 灵魂获取 | `SFX/M6/sfx_soul_gain_m6.ogg` |
| Seed 分享 | `SFX/M6/sfx_seed_share_m6.ogg` |

房间切换和关卡完成也清理了 M5 的音频资产债务。资产存在、触发点已连接、资产进入构建，是音频工程的三个检查点；风格化混音与最终听感是另一层工作，M7 仍可以继续优化。

## 验证结果与解释边界

以下数据来自阶段结果文件与交付报告，本文编写时未重新运行 Unity 门禁。

| 验证 | 阶段记录 |
| --- | --- |
| `M6ProjectBuilder.VerifyM6Setup` | passed |
| EditMode 回归套件 | 38/38 passed |
| PlayMode 回归套件 | 28/28 passed |
| Windows Development Build | passed |
| Runtime Probe | 60 秒，3601 帧，`m6SystemsReady: true` |
| Average FPS | 59.975 |
| `p95Fps` / `p99Fps` | 60.002 / 60.01 |
| 代表 seed | 24，`generationGatePassed: true` |
| 可达房间检查 | 647 |
| 性能门禁字段 | `p95Passed: true` |

`p95Fps`、`p99Fps` 按探针原字段记录。检查 `M6RuntimeProbe.Percentile` 可见，它将逐帧 FPS 升序排序后取第 95/99 百分位，因此这两个值反映的是 FPS 分布的较高一端；它们不表示“95% 的帧都至少达到这个帧率”，也不是 P95/P99 帧时间。现有 `p95Passed` 是该算法下的工程门禁结果。评估慢帧应补看低百分位 FPS 或高百分位帧时间，60 秒窗口也不能替代长时 soak、真人操作和发布前性能验证。

关键工程产物，均相对 `PROJECT-V` 根目录：

| 产物 | 路径 |
| --- | --- |
| 交付报告 | `reports/M6_delivery_report.html` |
| EditMode 结果 | `qa/results/M6_EditMode_TestResults.xml` |
| PlayMode 结果 | `qa/results/M6_PlayMode_TestResults.xml` |
| 运行探针 | `qa/results/M6_RuntimeProbe_60s.json` |
| 代表 seed 门禁 | `qa/results/M6_24seeds_GenerationGate.json` |
| 资产可达性门禁 | `qa/results/M6_AssetReachabilityGate.json` |
| 构筑多样性 | `qa/results/M6_5Builds_Diversity.json` |
| 测试场景 | `unity-project/Assets/Scenes/TestScenes/M6_Metaprogression.unity` |
| 自动生成与验证工具 | `unity-project/Assets/_Project/Editor/M6ProjectBuilder.cs` |

设计与 QA 依据，以下路径相对 `PROJECT-V-game-docs` 根目录：

- `design/feature_specs/M6_metaprogression.md`
- `design/data/M6_upgrade_values.md`
- `design/data/M6_build_synergies.md`
- `design/playtest/M6_Playtest_DataSchema.md`
- `qa/reports/M6_test_report.md`
- `qa/reports/M6_5runs_test_report.md`
- `project/sprints/SPRINT_06.md`

阶段交付报告归档于工程仓库的 `reports/`，docs 仓库保留设计、QA 与状态文档。

## 提交与后续方向

| 提交 | 内容 |
| --- | --- |
| `27322b8e6837703076a6ced7f6df33a93df15aa0` | `feat(roguelite): deliver M6 engineering gate` |
| `2f34abc0966f9cbb09c929b695d7b43000cf72d5` | `audio(roguelite): complete M6 ogg assets` |

两个提交属于阶段 `develop` 实施历史。M6 交付了元进度工程链路与自动化证据，后续方向是完整体验整合、存档稳健性、真实玩家数据和音频风格化。自动门禁提供继续迭代的基础，长期可玩性仍需由真实游玩回答。
