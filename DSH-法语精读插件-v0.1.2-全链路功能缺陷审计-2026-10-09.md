# DSH 法语精读插件 v0.1.2：重新开展的全链路功能缺陷审计

**审计基线**：`helix-drop/dsh-french-reader-workspace`，`main`，提交 `067c275d150c749ef9e04a57aeb18738c53d45d3`（2026-10-09）。

**审计方式及边界**：通过 GitHub 连接器读取当前源码、客户端 Remote 目录、工具定义、已有测试、`FRONTEND_CHANGES.md` 和 `docs/verification/french-computer-use-v0.1.2-2026-10-09.md`；进行了静态跨层调用、协议和状态流核对。当前环境无法启动安装在用户 macOS 上的 DeepSeek Harness，未在这一轮实际运行插件、发起模型请求或重跑全套自动测试。2026-10-09 复测报告中所列的原生故障作为**既有实测证据**，但不能当作本轮新复现。仓库既有 431/431 测试通过的记载不等于下面的故障不存在。

## 一、审计标准

只收录满足以下条件之一的条目：（A）已有原生复测证实的不正确行为；（B）输入、控制流、前后端契约已经充分确定，能够直接推导出失效行为；（C）界面或已经启用的功能入口承诺某个操作，但对应路径缺失。C 类应实现功能需要同产品约定核准范围，不与运行时故障混淆。

评级依据：**P1**＝可能改写用户已有资料，或主要流程根本不能工作；**P2**＝已开放的核心功能失效、不可恢复，或跨模块阻塞；**P3**＝局部功能错显、静默失效、真实交互不一致。附加“验证”表示根因尚未实机定位，不表示故障未被发现。

本审计不因源代码行数、编程风格、理想化架构、潜在扩容或一般安全清单自动提出整改；不建议重建状态管理、缓存、任务调度、迁移系统。每条仅要求修正其确定的用户行为。

## 二、按证据强度及优先级整理的缺陷总表

| ID | 级别/证据 | 模块 | 用户能遇到的错误 | 当前建议 |
|---|---|---|---|---|
| F01 | P1 / A | 生成取消及保存 | 点击取消后仍写入并覆盖既有句子解析 | 首先定位实际 Remote 取消信号，修真实根因 |
| F02 | P1 / B | 动词变位前后端 | 数据集已返回，UI 判为未准备好，无法显示 | 修正状态名、字段路径，写实际组件回归 |
| F03 | P2 / B | 模型工具 / 生成入口 | 30 秒取消信号与 60 秒工具预算使正常长解析失败 | 为生成类动作设置与真实运行时相容的时限 |
| F04 | P2 / A+B | 讨论上下文预览 | 问题改变后旧预览仍有效，发送被拒且无法继续 | 客户端重置预览和异步请求身份 |
| F05 | P2 / B | 讨论上下文预览 | 预览不 trim，发送 trim；原文未编辑仍可能指纹不一致 | 预览/发送统一问题文本 |
| F06 | P2 / B | 语法详情状态操作 | 缺少后端必填字段，掌握状态更新不能正常成功 | 补齐参数且按返回值决定更新状态 |
| F07 | P2 / A+B | 语法条目内容 | 已存易混点只有条数、无正文，相关正文与例句也未投影 | 扩展已有条目读取数据并展示 |
| F08 | P2 / B | 词汇来源抓取 / 全局保存 | 网络请求占用全局写队列，其他操作无法及时保存 | 网络请求移出 serialize，仅写入置于锁内 |
| F09 | P2 / B | 归档与恢复 | 可归档但普通 UI 无法列出或恢复；旧备份也不能覆盖归档记录 | 增加最小归档列表+恢复入口，或暂不开放归档按钮 |
| F10 | P2 / C | 完整备份 | 书籍章节、归类及接续不在完整备份中；面板无库导入入口 | 明确产品范围，补齐可恢复性或修改界面承诺 |
| F11 | P2 / B | 模型工具重复提问 | 相同问题自动使用相同 operationId；第二次提问会重放第一次回答 | 一次用户意图一次新 ID；重试自行保留 ID |
| F12 | P2 / B | 变位显示 | 即便修复 F02，复数人称会映射为单数，且只读第一个时态 | 正确映射 1s/1p 等代码，提供时态导航 |
| F13 | P2 / B | 语法列表 | 使用不存在的 `title`，把数值 `examples` 当作数组 | 改 `topic` 与数值本身 |
| F14 | P2 / B | 词汇/语法筛选 | 词汇库的掌握度筛选使所有词消失；当前句筛选不执行 | 纠正筛选作用域；落实或隐藏未实现控件 |
| F15 | P3 / B | 变位抓取错误 | fetch 拒绝结果未检查；失败原因可能不在界面出现 | 检查 `fetched` 和 `status`，使用后端返回的原因 |
| F16 | P3 / B | 语法导航 | 点击语法列表后仍显示“知识库 / 词汇” | 只保留一份被显示的 tab 状态 |
| F17 | P3 / B | agy 后端 | CLI 运行中因 abort 而抛错会被标记为“无法启动” | catch 时以 request.signal.aborted 优先区分取消 |
| F18 | P3 / B | 段落批量解析 | 提前中断仍报告原计划句数；忙碌检查与下层返回码不匹配 | 统计实际请求数；根据真实 failure 判断 busy |
| F19 | P3 / B | 来源归属 | 手动传入的 mot 不必对应 entryId，可能把另一词来源附给当前词 | 后端根据 entryId 取得词头而非信任冗余参数 |
| F20 | P3 / B | 语法列表失败反馈 | `listGrammar` 异常被吞掉，页面显示空数据却不告知加载失败 | 显示明确错误并允许重试 |
| F21 | P3 / B | 语法详情缺失 | 查询不到 entryId 时，页面长时间呈现“加载中”而非“未找到” | 分离 loaded/entry 状态 |
| F22 | P3 / C | 后端模型选择 | 列表支持多个后端，但面板只自动选第一个，无切换入口 | 若要求面板可用 agy，增加一个简洁后端选择控件 |
| F23 | P3 / B | 变位待完成状态 | 前端读取 `status`、`missing`，实际接口字段为 `fetchStatus`、`missingForms` | 与 F02 一起更正 |
| F24 | P3 / B | 解析阶段记录 | 当前标记 `streaming` 的瞬间尚未收到模型的任何正文 | 修正文案语义；若需要首正文延迟，另设观测点 |

此表中的 F10/F22 属于**实现边界核准项**，不是声称仓库承诺了所有未来功能；其余静态确定项可以建立极短输入复现/合同测试。以下给出关键链路与最小修复。

## 三、F01：解析取消后仍覆盖原有资料（P1，实测）

**实测**：复测报告明确记录 `p2.s1` 重新生成后立即取消，后台仍运行 73.824 秒，任务最终 `succeeded/stop`，保存记录从 revision 1 变为 revision 2；前端却显示“即使模型稍后返回，其结果也不会写入”。这是数据损坏式问题，而不仅是取消按钮失灵。

**代码路径**：

- `client.js:3838–3893` 创建 AbortController，按钮调用 `.abort()`；`:4009–4012` 将 signal 作为 Remote 末尾参数传入；`:5855–5863` 是前端适配层。
- `src/controller.ts:681–687` 的 `@Remote('analyseSentence')` 接受 AbortSignal；`:2765` 及 `:2795–2810` 已存在取消拒写检查。
- `src/generation.ts:164–166, 198–246` 把请求 signal 向准备阶段和模型 stream 传递，并在流结束后拒绝取消的成功结果。
- `test/analysis-generation.test.mjs:253–278` 已有“模型忽略取消但不得写入”的单元测试。

**判断**：真实 bug 已确认；**Signal 在哪一环没有传播属于未定位根因**。不能断言缺少 Controller 拒写逻辑，更不能不经定位引入第二套取消 RPC、全局任务表或复杂状态机。最先需要在真实 DSH 依次观察点击取消后的客户端 AbortController、RPC adapter、Host 入参 `signal.aborted`、保存前检查值，并核实 Host 本地运行的是此 commit 构建产物。只修改找到的失效一层，实机复现“取消后老记录不变”，再测试成功生成、超时、切换句子取消。

**额外注意**：如果宿主 Remote 只把 abort 当作“取消等待回复”而没有撤销服务器执行，那么 UI 内的 `.abort()` 从机制上不能单独保证后台拒写。这是需要通过宿主契约实验确认的关键，不是先验结论。

## 四、F02/F12/F15/F23：变位功能是一组真实的跨层错接（P1/P2/P3）

**输入输出已经确定**：`src/controller.ts:2479–2534` 的成功回复是 `{state:'dataset', tenses:[...]}`；前端内联严格 Remote 契约 `client.js:863–885` 也已经正确声明 `dataset` 与根级 `tenses`。

**实际渲染**：`client.js:2213–2215` 使用 `state.state === 'ready'`，随后尝试读取 `state.dataset?.tenses`。因此真实后端的任何成功回复都无法通过 ready 分支。待完成状态 `client.js:2225–2230` 使用 `state.status` 和 `state.missing`，但后端字段为 `fetchStatus` 与数组 `missingForms`。

**第二层错误**：`client.js:2208–2241` 的人称名用 `Number(String(person).slice(0,1))-1` 映射到单数列表；`1p` 被展示为 `je` 而非 `nous`，`2p` 被展示为 `tu` 而非 `vous`，`3p` 被展示为 `il/elle` 而非 `ils/elles`。列表行、base 分组及缺失人称均受影响。该组件仅选择 `(tenses ?? [])[0]`，没有切换其他时态的控件，后端返回多时态却无法浏览。

**第三层错误**：`client.js:2200–2211` 发起 `fetchConjugation` 后未检查 `fetched`、`status`、`reason`。例如后端返回 `{fetched:false,reason:'web-unavailable'}` 时不会以该原因显示失败。

**建议**：只修改现有组件。正确读取 `state === 'dataset'` 和 `state.tenses`；按完整的 `1s/2s/3s/1p/2p/3p` 代码映射显示名称；用一个时态下拉或标签切换 `tenses`，切换时清空上一时态的选中 base/row；处理抓取状态及真实失败原因。无需改变后端存储或创造变位数据。增加一个**向现有 React 组件传入真实 `ReadConjugationValue` 的测试**。现有 `test/client-conjugation.test.mjs:122–136` 主要测试源码中存在字符串及标签，不足以检测该状态与路径错接。

## 五、F03/F11：模型工具入口可调用，但超时与幂等标识阻断正常业务（P2）

### F03：双重限时直接短于正常解析

`src/tools.ts:151` 使用 `const signal=()=>AbortSignal.timeout(30_000)`；`:1152–1156` 对整个 `french_reader` 工具又设置 `timeoutMs:60_000`；`:707–735` 的 `ask` 和 `:791–806` 的 `analyse` 实际都拿到 30 秒 signal。原生测试一条成功解析为 217.029 秒，耗时更长的已保存任务亦有多次记录。工具入口能启动模型，却无法允许它完成当前实际工作量。

**建议**：区分轻量读取/写入动作和生成动作。生成动作采用与面板预算一致且明示的时限，工具注册总预算不能短于生成动作；不要把所有动作统一延长十倍，避免无关操作挂起。若工具平台硬限制 60 秒，则这属于接口设计不适配长生成，需要采用宿主已有 job 机制“启动/查询”，而不是假装拉长 `AbortSignal` 就能解决。

### F11：两次相同提问被当作一次写入重试

`src/tools.ts:729–731` 在未指定 operationId 时按 `passageId,branchId,question` 派生确定性 UUID。`src/controller.ts:1960–1968` 对已成功的相同 operationId 直接返回先前保存的回复，不重新编译上下文、不发送模型调用。故用户在相同分支有意再次问同一句话，也会收到第一次回答而不会产生新的回合，即使历史对话已经不同。相比之下，面板 `client.js:4386–4391` 每次发送都用 `createUuid()`。

**建议**：工具的每一次独立 ask 产生新操作标识，真正重试由调用者显式复用它。不要调整 Controller 已存在的幂等规则。类似的确定性 ID 在 `discuss`（同标题）、`translate`（同文本）等工具中存在，应以是否允许用户重复同一动作作为产品契约逐项核对，不能一律将确定性 UUID 改为随机数。

## 六、F04/F05：预览即发送的契约被客户端破坏（P2）

`client.js:4347–4372` 生成预览时读取 `askDraft`；`:5424–5437` 输入变更只更新 draft，并未清除 `contextPreview`，按钮仍进入发送分支；`:4386–4390` 用修改后的问题配旧 fingerprint；`src/controller.ts:1997–2000` 正确拒绝 `context-changed`。原生复测已确认用户无法从旧预览状态重新预览。

还有一个独立的输入不一致：预览使用 `question: askDraft`，正式发送却使用 `question: askDraft.trim()`；`src/context-compiler.ts:358–389` 的指纹包含精确 question 文本。用户即便不编辑，只要有首尾空白，就可能触发错误。

**建议**：

1. 在预览与发送两处使用完全相同的问句规范化方式（建议在构造两个 request 前都 `.trim()`；不改变后端 fingerprint）。
2. 问题、选定分支或所选模型变更时，旧预览立即失效，并在 `context-changed` 返回后恢复预览入口。
3. 预览异步返回时，确认它仍属于发起时的同一问句、分支、模型与段落。可复用现有 `passageRequest` 加简单递增 preview request 号，不需要全局请求框架。

**验收**：修改 A 为 B → “发送”恢复为“预览”，B 的新完整 prompt 展示并可发送；输入首尾带空白不会自相矛盾；切换模型/分支后旧预览不被复用；后台指纹不一致仍拒绝发送（保留安全边界）。

## 七、F06/F07/F13/F16/F20/F21：语法库（P2/P3）

### F06 掌握度保存请求没有构造合法的 Remote 参数

`client.js:2388–2394` 仅发送 `{entryId, mastery}`，未提供必需的 `expectedRevision:number|null` 和 `operationId:UUID`；`src/controller.ts:752–766,2561–2575` 的请求 schema 和写入函数要求这些字段。同一前端文件已有可参考的正确调用 `client.js:2516–2527`。

**最小改法**：填 `expectedRevision:null`（如不要求并发冲突保护）和新 `operationId`；接收并检查 `updated / unchanged / already-updated / conflict`，只有确认未被拒绝才改变显示；冲突时重新读取。若产品要求防止跨窗口覆盖，必须另将 `revision` 送到页面并传真实预期值，但**不是本轮默认必做**。

### F07 已记录的内容无法从语法详情阅读

`src/domain.ts:397–417` 的持久化条目含 `notes`、`examples[]`、`pitfalls[]`；但 `src/controller.ts:898–924` 投影只含 keyPoints、examples 数目、pitfalls 数目。`client.js:2274–2289` 因而只能显示“已记录 N 条”，完全不显示文本。原生复测 FCR-012-02 已观察到实际发生。

**最小改法**：在现有 `listGrammar` 条目投影中增加必要文本字段（例如 `pitfallTexts`，若详细页承诺显示例句与笔记则加入 `examples` 和 `notes`）；同步类型和前端内联严格 codec；渲染数据自身的文字。无需增加详情数据库或独立候选合并服务。建议分别明确“当前缺陷必需字段”和“随需求扩展字段”，不要凭结构存在即要求所有内部元数据对外显示。

### F13 列表 title / examples 的类型错接

`client.js:2005–2010` 把 `entry.title` 当名称、`(entry.examples??[]).length` 当数量，而 `src/types.ts:330–344` 与控制器返回的是 `topic:string`、`examples:number`。列表名称将为 undefined，例句数也将为 undefined。改为 `entry.topic` 和 `entry.examples`，不改 Host。

### F16 语法页导航错显

`client.js:5191–5193` 在两个分支都返回 `lexiconTab`；`KnowledgeLibrary` 自己维护 `tab`（`:1971–1973`），父组件又有 `knowledgeTab`（`:3030–3033`），造成导航和当前实际列表状态分离。统一使用父级 `knowledgeTab` 或由子组件报告 tab，改动仅限 React 属性。

### F20/F21 错误伪装为空与加载中

`client.js:1983–1995` 抓取 `listGrammar` 时 `catch(()=>null)`，没有将失败写入 error；页面将失败表现为空语法库。`KnowledgeEntry` `:2371–2405` 读取不存在 entryId 返回 null，而 null 同时被用作“尚在加载”，永久显示“加载中”。两个问题都可通过分别记录 loading/failed/not-found 状态修正，无需增加缓存。

## 八、F14：词汇/语法筛选控件不能实现所显示的功能（P2/B）

`client.js:1971–2050` 向用户开放掌握度与“当前句”两个筛选器。

- 词汇列表每条 `mastery` 取 `entry.mastery??''`，但 `LexiconView` 本身不具备该字段。因此在词汇选项卡选 learning/reviewing/known 时，筛选器会过滤掉**所有**词条，造成假空库。最低成本修复是仅在语法选项卡显示掌握度筛选，或按业务要求真正为词汇构建掌握度模型；本轮不默认新建后端字段。
- 当前句 `scope` 的状态只由下拉框更新，`:2012–2016` 的过滤器不读取它，后端 `ListGrammarRequest` 与 `ListLexiconRequest` 仅接受 `scope:'all'`（`src/types.ts:459–462,497–500`）。因此当前句选项始终无效。产品若明确需要此功能，应先定义“当前句相关”的判定（词汇 occurrence 的 anchor，语法 example 的 anchor），再在已有前端记录上过滤或补充最少必要映射；否则应将未实现选项禁用并说明，而非悄悄无效。不要默认增加大型查询接口。

## 九、F08/F19：词汇来源抓取的持久化脆弱点（P2/P3）

### F08 一个慢 HTTP 请求卡住所有写入

`src/controller.ts:2322–2359` 中 `fetchLexiconSource` 直接 `return this.serialize(async ()=>{ ... await fetchLexiconSource(ctx,...); await recordLexiconSource(...) })`。而 `serialize` 是单实例串行队列，`src/controller.ts:3885–3889` 使用 `this.writeTail.then(operation)`；其他语法学习状态、模型任务记录、句子分析最终保存也通过此队列。因此外部来源在网络等待期间，其他写入操作都必须等它返回。即使本次请求最终失败，用户其他保存操作也被无谓拖慢。

**最小改法**：先读取必要的 entry、在队列外执行 `web.fetch`，然后仅在保存阶段进入 `serialize` 并再次确认目标条目存在；保持现有来源判定。验证：模拟来源请求悬而未决时，另一个段落的保存可先成功完成。

### F19 来源词头与目标词条可能错配

`src/controller.ts:2337–2349` 根据 `entryId` 找到条目，却直接把请求参数 `input.mot` 发给外部词源查询，未验证它与该条目 `mot` 相符。面板本身一般提交 `card.mot`，但 `src/tools.ts:881–887` 的模型工具允许独立传入 `entryId` 和 `mot`；如果不一致，查询甲词得到的来源可能被记到乙词条上。

**最小改法**：将已存 entry 的词头作为来源请求词，或拒绝不一致请求；无需增加通用权限认证、任意 URL 屏蔽或新安全层（现有来源域白名单已存在）。

## 十、F09/F10：书架、归档和备份的闭环缺口（P2/C）

### F09 归档不能在正常 UI 中恢复

`client.js:4248–4270` 对每个段落显示直接归档按钮，`:2949–2975` 归档成功后删除前端书架/接续引用；`src/controller.ts:498–516` 的普通列表排除 `archivedAt!==null`，`:800–828` 仅有 archive 无 restore；仍可通过 `getPassage(id)` 读取底层资料，但界面没有已归档列表，用户通常无从知道 ID。`src/controller.ts:3291–3337` 的库导入策略只插入缺失记录，不覆盖不同内容；因此将归档前的备份重新导入，也不能把已有归档记录恢复成未归档。

**最小改法**：补一个查看归档项与恢复归档的能力，沿用现有 passage 记录，不修改原文/解析格式；如果短期不能实现，请至少对归档明确提示“目前不能从面板恢复”，并考虑暂停开放归档按钮。这样是完成现有行为闭环，不是建设回收站系统。

### F10 “完整备份”缺书架目录和前后段接续；UI 不能直接导入完整库

`client.js:2924–2934` 直接下载 `exportLibrary` 的后端记录。`FRONTEND_CHANGES.md` 明确把 `bookshelf-v1` 的书籍/章节/位置与 `continuations` 放在 `localStorage`，且表示尚不包含在备份或导入中。后端 `src/controller.ts:3261–3288` 只导出表记录。当前 `importLibrary` 是控制器内部方法（`:3298–3339`）及模型工具 action（`src/tools.ts:952–965`），前端没有相应的完整备份文件恢复 UI。

**判断**：这部分是明确暴露的**产品完备性缺口**，但不等于已承诺跨设备同步。若产品只保证当前浏览器原文保存，可以将“导出全部”明确改为“导出宿主记录（不含书架排列）”，并使限制在界面可见；若完整备份被定义为数据安全功能，则必须纳入本地组织元数据并提供可用恢复路径。无需直接跳到宿主实体 ID、版本合并和多设备同步方案。

## 十一、F17/F18/F22：备用模型后端及批量解析（P3）

**F17**：`src/agy-backend.ts:159–171` 在 CLI runner 抛错时无条件返回 `agy-spawn-failed`；但同段代码可检查 `request.signal.aborted`。例如运行时被中断导致 `handle.done` reject，用户会看到“无法启动本机 CLI”，不是“已取消”。在 catch 内识别实际 abort 并返回 cancelled，其余异常保持原行为即可。注意默认 agy deadline `240_000` 毫秒，与面板 `600_000` 毫秒不一致，但没有 agy 同类时长实测前，不把 240 秒直接认定为故障。

**F18**：`src/controller.ts:2900–2931` 初始化 `missing` 后，循环有提前 break 分支，但返回字段 `asked:missing.length` 始终报告计划句数而非已经实际请求的句数；而 `:2918` 检查 `value.reason==='agy-busy'`，`src/controller.ts:2758–2760` 则会把 backend `finish:'error'` 的结果统一转换为 `model-error`，因此该中断条件不能处理当前 agy-busy 返回。这是批处理报告与失败处理的真实代码不一致。增加 `attempted` 计数，按实际 `failure` 分类 busy，避免将未执行的句子算成“已请求”。

**F22**：`src/controller.ts:3251–3254` 默认后端包括 DSH 与 agy，Remote 能查询每个后端模型。但面板 `client.js:4280–4321` 只把第一个 available backend 设为当前后端，`client.js:5743–5755` 只提供该后端下的模型列表，未提供修改 `backend` 的 UI。因而当 DSH 与 agy 均可用时，普通面板无法选择 agy；只能通过模型工具等另一入口。是否列为当期必修取决于产品明确是否要求用户在面板切换生成后端，不应单凭有后端接口就迫使新增复杂配置界面。若要求，就增加一个简单的 backend select，不做全局 provider 管理界面。

## 十二、F24：计时与生成定位需求

`src/domain.ts:561–601` 及 `src/generation-store.ts` 已保存 generationJob 的 `startedAt`、`finishedAt`、`phase`、`usage` 等。当前 `src/generation.ts:204–206` 在进入 `prepared.stream` 的循环之前标记 `streaming`，因此 phase 只能代表**进入流读取阶段**，不能作为首 token 时间。

用户要求增加调查生成耗时的能力是明确需求。**推荐最小实现**：保留原 job 时间戳计算总耗时；仅额外记录 `modelCallMs` 与 `firstTextDeltaMs`，并注明 firstTextDelta 不等于首推理 token（DSH 适配器可能把推理 token 计入 usage 而不提供 text-delta）。若 CLI agy 没有增量输出，首正文指标应为 null。JSON 解析与校验的既有重放只有几毫秒，默认不需要为其扩展持久化字段。把这一需求与取消修复拆开提交，避免扩大故障定位面。

## 十三、没有证据支持立即修改的模块和事项

1. **原文修订与切分**：`src/controller.ts:1271–1333` 的来源修订采用追加版本、后翻转当前指针；`listAnalysis` 投影会报告锚点重定位，已有独立覆盖测试。未发现本轮足以支持重写切分算法、修订版本或锚点系统的具体失败输入。
2. **结构化解析校验**：已有“拒绝结构不完整 JSON”“覆盖单词片段”“解析仅成功后存储”等现有单元测试。原生成功解析的 JSON 校验耗时不足以解释 3–5 分钟等待。不要在没有复现前重写 parser 或结构校验器。
3. **已实现的指纹校验**：`context-changed` 保护正确阻止未经预览的错误上下文被发送，应保留。错误在客户端预览过期状态，不在指纹判定本身。
4. **禁用的发音控件**：文档明确说明“未接通、保持禁用”。它是可规划功能而非声称已经工作的故障。本轮不为凑缺陷数而要求接入语音。
5. **跨设备目录同步、书籍实体、协同编号**：文档明确将其归为后续设计。除非明确改变现阶段产品验收范围，不应与当前确定缺陷捆绑。
6. **大规模通用异常防御**：不引入第二套 RPC、独立状态数据库、网络重试框架、缓存一致性中间件、复杂 UI 状态机或迁移服务作为当前缺陷的“预防性修复”。

## 十四、按功能模块的最小验收场景

| 模块 | 最有价值的验收动作 | 通过条件 |
|---|---|---|
| 生成取消 | 原有分析上重新生成立即取消，等待超过原始调用完成时间，再重开句子 | 原分析正文与 revision 不变；任务状态不能称 succeeded |
| 变位 | 传入真实 `ReadConjugationValue.state='dataset'`，包含多个时态和 6 个人称 | 变位正文可见；复数人称正确；可切时态 |
| 工具生成 | 对标准长句使用 `french_reader analyse` 与面板同后端 | 不被 30/60 秒强制终止；不误报已完成 |
| 讨论 | 预览 A，改成 B，再发送；问题首尾空格；预览期间切换模型/分支 | 先获取 B 预览；发送文本与预览相同；迟到 A 不覆盖 B |
| 语法 | 列表 2 个相近条目、有例句和易混点；修改 mastery | 名称/数量准确；正文可读；保存确实返回 updated/unchanged |
| 词汇来源 | 抓取停留 20 秒，同时对另一句保存译文 | 译文可在抓取结束前保存；来源按正确词头归档 |
| 备份归档 | 归档一篇；查看归档并恢复；导出后复原原文与章节位置 | 归档可逆；若称完整备份则恢复位置和接续 |
| 模型工具重复提问 | 同一分支发送相同问句两次 | 两个独立回合均被模型处理；同 operationId 重试仍幂等 |
| 段落解析 | 段落中若第二句 busy 则中止 | asked 等于真实调用句数，失败详情准确 |
| 变位/语法界面失败态 | 源缺失、网络错误、条目不存在 | 明确显示错误/未找到，不伪装成“空库/加载中” |

## 十五、建议的提交顺序、变更上限

**批次 1：立即可确定的纯前端合同修复**：F02、F12、F13、F06、F04、F05、F16、F14（以及 F15/F20/F21）。除语法内容字段外，不改后端记录协议；每个问题补一条真实组件行为测试。

**批次 2：数据正确性和写入可用性**：F08、F19、F11、F18、F17，尽量保持现有接口不变。先写能复现失败的最小测试，再修代码。

**批次 3：原生环境唯一必测阻断**：F01，在 DSH Host/Remote 全链路定位；只在证实信号传递行为后确定具体修复方案，并完成取消后不覆盖的真实复验。

**批次 4：产品验收边界明确后实施**：F09/F10/F22（可恢复归档、完整备份恢复、切换备用后端）；这些是现有 UI 暴露的业务能力缺口，但在技术上可能需要一个或数个最小增量接口。先确认目标使用方式，不借机整体重构阅读模型。

**独立小提交**：F03 的生成工具预算（必须确认工具运行时允许的最长 timeout）；F24 的生成时长诊断（仅两项新增可观测值）。

**验证总原则**：修改 `src/types.ts` 或新的 Remote 返回字段时，同步 `client.js` 内联严格描述与生成的 `lib/typert*`；先运行 `pnpm build`，再运行既有测试，最后进行有针对性的真实 DSH 复测。测试全绿只证明已有断言成立，不替代用户实际端到端操作。不要将未取得真实运行证据的项目描述为“已修复”。

---

### 可核对源码入口

- [客户端 `client.js`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/067c275d150c749ef9e04a57aeb18738c53d45d3/packages/french-close-reading/client.js)
- [Host 控制器 `src/controller.ts`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/067c275d150c749ef9e04a57aeb18738c53d45d3/packages/french-close-reading/src/controller.ts)
- [模型工具 `src/tools.ts`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/067c275d150c749ef9e04a57aeb18738c53d45d3/packages/french-close-reading/src/tools.ts)
- [变位抓取 `src/conjugation-fetch.ts`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/067c275d150c749ef9e04a57aeb18738c53d45d3/packages/french-close-reading/src/conjugation-fetch.ts)
- [模型后端 `src/generation.ts`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/067c275d150c749ef9e04a57aeb18738c53d45d3/packages/french-close-reading/src/generation.ts)
- [测试 `test/client-conjugation.test.mjs`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/067c275d150c749ef9e04a57aeb18738c53d45d3/packages/french-close-reading/test/client-conjugation.test.mjs)
- [原生复测记录](https://github.com/helix-drop/dsh-french-reader-workspace/blob/067c275d150c749ef9e04a57aeb18738c53d45d3/docs/verification/french-computer-use-v0.1.2-2026-10-09.md)
