# MiMo 全量开发任务包

编写日期：2026-10-13。**T01–T10 代码及完整发布门禁已完成，并发布第 13 版；T11 基础真实模型验收与发布交接完成，未实测项单独记录。** 用户指定协调者接手后不再调用 MiMo，实际状态见 [验收记录](../MIMO_ACCEPTANCE_RECORD.md)，下表职责保留原计划。

入口：[开发指导与验收矩阵](../MIMO_DEVELOPMENT_GUIDE.md)。执行清单：[mimo-task-plan.json](mimo-task-plan.json)，包含每项任务的前置依赖、角色、逐文件 AllowedFiles、计划新增文件与执行器检查。任务书已写全，不再只给首个任务或后续概括路线。

## 全部任务与顺序

| 编号 | 完整任务书 | 前置 | 执行职责 |
| --- | --- | --- | --- |
| T01 | [停止提示词构建与宏变量提交](MIMO_T01_PROMPT_CANCEL.md) | 无 | MiMo 实施；协调者独立验收 |
| T02 | [SSE 与 JSON 完成原因及失败保护](MIMO_T02_RESPONSE_COMPLETION.md) | T01 | MiMo 实施；协调者独立验收 |
| T03 | [XML 选项控制块与代码示例隔离](MIMO_T03_OPTIONS_CODE_BOUNDARIES.md) | T02 | MiMo 实施；协调者独立验收 |
| T04 | [历史消息 MVU 与同步异步正则上下文](MIMO_T04_MVU_REGEX_CONTEXT.md) | T03 | MiMo 实施；协调者独立验收 |
| T05 | [卡片静态预览与原始源码分离](MIMO_T05_CARD_STATIC_PREVIEW.md) | T04 | MiMo 实施；协调者独立验收 |
| T06 | [生成操作、设置快照与阶段诊断](MIMO_T06_OPERATION_CONTEXT_DIAGNOSTICS.md) | T05 | MiMo 实施；协调者独立验收 |
| T07 | [消息格式化与静态显示业务接口](MIMO_T07_MESSAGE_DISPLAY_MODULE.md) | T06 | MiMo 实施；协调者独立验收 |
| T08 | [生成传输与流程业务模块解耦](MIMO_T08_GENERATION_TRANSPORT_MODULE.md) | T07 | MiMo 实施；协调者独立验收 |
| T09 | [重复符号处理与模块契约检查](MIMO_T09_SYMBOL_DEPENDENCY_CHECK.md) | T08 | MiMo 实施；协调者独立验收 |
| T10 | [可重复的浏览器交叉验收与产物检查入口](MIMO_T10_RELEASE_GATE.md) | T09 | MiMo 实施；协调者独立验收 |
| T11 | [全量验收、真实样本、合并与发布交接](MIMO_T11_FINAL_ACCEPTANCE_RELEASE.md) | T10 | 协调者总验收、合并与发布交接 |

T01–T05 是已复现问题的最小修复；T06 统一操作身份、设置快照及诊断；T07/T08 建立显示与传输的真实业务接口；T09 防止隐式符号覆盖和依赖错误；T10 建立产物与浏览器发布检查；T11 完成真实样本、供应商验收及发布交接。必须走完所有计划项，不能仅完成一个任务就报告全量完成。

## 共用执行规则

1. 主协调者每次选择一个任务，从上项已验收源码创建独立 D 盘副本。MiMo 读当前 AGENTS、任务和 spec，只改本项文件；不得递归启动执行器、模型或其他代理。
2. 下项启动的门槛是协调者核查实际 diff、检查结果、浏览器冒烟与 runtime_cleanup 后接收前项，不是执行器进程返回 completed。失败由协调者整理返工，不跳过失败继续后续重构。
3. 本任务包的路径清单为写入上限。不得整个目录/仓库放行，不得覆盖用户修改，不顺手清理无关代码。AllowedFiles 必须是 PowerShell 数组，不是逗号拼接字符串。
4. 代码与测试由 MiMo 实施，构建产物由协调者运行构建生成；不得手改 bundle/HTML/CSS，不放宽正则超时、卡片许可、可靠保存、私有设置和同步保护。TTS 不开发、不强制 HTTPS、远端 L3 不自动部署。
5. 独立验收通过后只合入对应文件及实际构建产物。协调者处理提交/推送/发布；T11 不派给 MiMo。根据项目规范检查其他活跃同项目 Session 后处理提交。
6. 所有未执行项、真实用户预设/真实供应商限制如实记录。修复先复现，重构先标定行为；模拟响应不等于真实供应商通过。

## 任意 MiMo 任务的统一调用

以下示例只说明未来调用方法，编写文档时没有启动 MiMo。PowerShell 7 中把 taskId 设为当前已满足前置条件的任务；不把整张清单放进无验收的自动循环。选择 MiMo 会将任务/相关源码发送至 MiMo 服务端，密钥由本机 MIMO_API_KEY 读取，不在命令或文档中填写密钥。

```powershell
$sourceWorkspace = '<project-root>'
$taskId = 'T01' # 完成并接收上一项后，依次改为 T02 ... T10
$planFile = Join-Path $sourceWorkspace 'docs\tasks\mimo-task-plan.json'
$taskPlan = Get-Content -LiteralPath $planFile -Raw | ConvertFrom-Json
$selectedTasks = @($taskPlan.tasks | Where-Object { $_.id -eq $taskId })
if ($selectedTasks.Count -ne 1) { throw '任务不存在或编号重复' }
$selectedTask = $selectedTasks[0]
if ($selectedTask.role -ne 'mimo') { throw '本项由协调者完成，不派给 MiMo' }
$taskFile = Join-Path $sourceWorkspace $selectedTask.taskFile
$allowedTaskFiles = @($selectedTask.allowedFiles | ForEach-Object { [string]$_ })
if (-not (Test-Path -LiteralPath $taskFile)) { throw '缺少任务文件' }
if ($allowedTaskFiles.Count -eq 0) { throw '没有逐文件写入范围' }

# 调用前人工核对 selectedTask.dependsOn 的实际接收记录。
# 不用任务清单的待执行状态代替上一项验收证据。
$pendingChanges = git -C $sourceWorkspace status --porcelain
if ($LASTEXITCODE -ne 0) { throw '无法读取主工作区状态' }
if ($pendingChanges) { throw '存在未提交修改，先准备保留修改的独立副本' }
$mimoWorkspace = Join-Path '<worker-root>\work' ('opentavern-mimo-' + $taskId.ToLowerInvariant() + '-' + [guid]::NewGuid().ToString('N'))
git clone --no-hardlinks $sourceWorkspace $mimoWorkspace
if ($LASTEXITCODE -ne 0) { throw '独立副本创建失败' }
git -C $mimoWorkspace rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw '无法读取副本基线' }

& '<worker-root>\worker.ps1' `
  -Workspace $mimoWorkspace `
  -TaskFile $taskFile `
  -Provider mimo `
  -Mode workspace-write `
  -AllowedFiles $allowedTaskFiles `
  -TimeoutSeconds 1800
if ($LASTEXITCODE -ne 0) { throw 'MiMo 失败：查看本次 report.json 和 last-message.md' }
```

入口报告目录位于 `<local-evidence>/runs`。检查的是入口返回的本次运行，不按“最后一个目录”猜测，也不能手改报告。AllowedFiles 检测发生在结束后，因此必须独立审查实际文件差异。

## 全量完成的证据

每项记录“任务编号、实现提交、修复前证据/迁移前基线、修复后命令/断言、浏览器材料、接收结果和回退位置”。最终由 T11 汇总到计划新增的 `docs/MIMO_ACCEPTANCE_RECORD.md`。文件创建本身不算验收。

全部代码项独立通过、总矩阵通过才可报告代码优化完成；真实预设、供应商和发布各自记录实际状态，不虚构未执行结果。本文档交付完成与代码实施完成必须分开表述。
