# DSH 法语精读插件 v0.1.2：第四轮实机反馈后的源码复审与修改实施指南

**审计日期：**2026-10-09  
**代码审计基线：**`9e391431e0fb3871d38381d168d4e556992ed96f`。审计时远端 `main` 最新为 `2ab8ff6f0ade02d3a0fc129fc8499b8a2266c54a`；通过 GitHub compare 核实两者之间只增加了验收报告，**没有任何功能源码变化**。  
**实机依据：**用户提供《法语精读第四轮实机验收：真实阅读流程》，实测三句解析、讨论与词库、取消、恢复、备份等，编号 U01—U15。前一轮《french-computer-use-round3-2026-10-09.md》用于比较修复效果及遗留问题。  
**审计方式：**逐项从 GitHub 当前源码检查客户端事件 → inline Remote descriptor → Host Remote 入口 → controller / domain / store / provider → 测试文件。**本次没有写入仓库、没有重新构建或运行本机 DSH；源码可证明的调用问题与只能由原生应用确认的执行机制分开陈述。**

## 0. 判定规则和修复边界

缺陷只按三种情形成立：（a）已公开的功能在真实 UI 下失败；（b）前后端/数据层存在可演算的执行错误；（c）某操作按其设计应完成却缺少最后一个必要环节，导致真实工作流被阻断。除此之外的布局、提示、内容偏好列为可选或独立 UX 工作。严重度：P0 数据丢失或不可逆；P1 数据正确性、确认操作失败；P2 核心学习链路不能完成；P3 使用连续性/表达错误。**缺陷有结论，不等于根因每层都已确定。**

先保存修改前样本及数据备份；使用独立测试篇目，保留原解析 revision、当前 `generationJob` 和失败回复。不要为了修复一次失败把原有结构化校验禁用。不要在此轮重建数据库、迁移书架、重写 controller、替换整套 Remote 或引入第二套状态容器。原生宿主信号传播没有可检视的完整实现，本轮不可声称已定位其内部失效点。

| 项 | 实机结果/源码证据 | 性质 | 优先级 | 修复归属 |
|---|---|---|---|---|
| U01 取消后覆盖 | 取消后任务 `succeeded`、解析 revision 1→2，操作 ID 可追踪 | 已复现严重故障，底层具体断点尚待测 | P1 | UI—Remote—Host 取消链路 |
| U02 提炼结论 | 缺三项 Remote 必填字段，且先关闭对话框再保存 | 已复现且根因定位 | P1 | 前端请求及弹窗 |
| U03 我已理解 | `settled` 不属于接受的五个状态 | 已复现且根因定位 | P1 | 前端状态参数 |
| U04 回答 Markdown | 文本直接放入 `<div>`，Markdown 标记和换行不能按文档格式呈现 | 已复现且根因定位 | P2 | 前端答案渲染 |
| U05 新词无出口 | 本地只读查词，后端建词条能力未暴露到面板 | 功能链路缺口 | P2 | 词汇录入 Remote/UI |
| U06 解析说明法语化 | 实测第三句大量解释是法语；仅一般中文指令 | 生成质量故障，输出随机性非程序确定 | P2 | 解析 prompt / 质量跟踪 |
| U07 跨段指代 | 单句 prompt 只包含当前段；第三句所在段单独成段 | 已证实信息不足的设计缺口 | P2 | analysisPrompt 构造 |
| U08 问答进度 | 回答增量显示在 composer 尾部，忙碌期缺少可见状态和取消 | 功能反馈缺口 | P2 | 讨论交互与 stream 视图 |
| U09 滚动与空间 | 多滚动区、回答与输入隔离，原生已观察 | UI 效率问题 | P3 | 阅读区布局 |
| U10 导入预览 | 后端只返回 120 字符摘要和句数，无逐句边界 | 已证实预览能力不足 | P3 | 预览数据与表单 |
| U11 创建分支多一步 | 创建成功不选择新分支；初次提问强制先填标题 | 已证实交互中断 | P3 | 分支创建流程 |
| U12 阅读位置丢失 | 加载阅读时永远重置为首句，无阅读指针持久化 | 已复现且定位 | P2/P3 | 本地阅读指针 |
| U13 历史上下文无法查 | 消息有 contextId，Host 已有 readContext，但前端只展示待发送 preview | 已复现且定位 | P2/P3 | 单条消息历史回看 |
| U14 提示与章节名称 | 错误归为 generationUnavailable、成功消息不可见、无效章节替代 | 反馈及呈现问题 | P3 | 前端局部修复 |
| U15 音频占位 | 多个禁用按钮与接口占位一直出现 | 已知未接入功能误占界面 | P3 | 前端隐藏 |
| R3 结构化解析索引失败 | 3 次模型 stop 但索引不满足协议，全部拒收 | 已复现的模型输出可靠性故障 | P2 | prompt/解析门禁/诊断 |
| R3 语法列表标签 | 子组件 tab 与父层 knowledgeTab 分离 | 已复现且定位 | P3 | 前端单一状态源 |
| R3 备份反馈 | `setStatus` 存在但相关视图不显示 | 已复现且定位 | P3 | UI 成功提示/冲突报告 |

### 已完成、不能重复计入未修复问题的部分

新代码已增加后端选择、语法正文/例句/易混点、语法详情掌握度参数、归档恢复、浏览器书架及接续元数据随 schemaVersion 2 备份、首正文延迟 `firstTextDeltaMs` 与模型调用耗时 `modelCallMs`，并将工具入口 `timeoutMs` 改为 600000。第三轮真实验收支持这些功能中的多项；第四轮真实备份为 360109 字节且包含非空 browserLibrary。**不建议再为这几项重复新增协议或一套新的时间统计。**

## 1. P1：U02 结论确认失败并丢失编辑内容（可直接改）

**前端** `client.js:5711–5719` 的 `concludeFrom(node,message)` 只把 `branchId`、原答案传入 `actionDialog`；`client.js:5366–5377` 调用 `recordConclusion({passageId,branchId,text,operationId})`，缺 `anchorId`、`messageId`、`status`。实际协议 `client.js:507–527`、`src/controller.ts:352–360` 要求全部三个字段；`src/controller.ts:648–659` 成功结果为 `kind:'recorded'` 或 `already-recorded`。**网关在 controller 之前拒绝；不能用后端默认值来绕过已有协议。**

**第二个独立故障：**`client.js:5397–5405` 在 `await recordConclusionFor` 前调用 `closeActionDialog(false)`；即使后端拒绝，编辑后的 `actionText` 也已清空。`recordConclusionFor` 还在返回 conflict 后仍调用 `showToast(t('conclusionSaved'))`，存在假成功提示。

**建议最小修改：**

1. `concludeFrom` 把**产生结论的那条模型消息**的 `message.messageId` 与 `node.anchorId` 一起写入弹窗上下文，不要在提交时用可能已经切换的全局 `anchorId`。提交 `status:'confirmed'`，因操作名就是「提炼并确认结论」；若未来有只暂存的操作，才使用 `proposed`。将 UUID 绑定到本次提交意图，网络重试不应重复追加结论。
2. 让 `recordConclusionFor` 返回明确的 `{ok:true,conclusionId}` 或失败原因，只对 `recorded` / `already-recorded` 显示成功；`conflict` 不能触发成功 toast。
3. `commitActionDialog` 在发送期间保持弹窗、正文原封不动，禁用重复确认按钮；**收到确认后再**关闭弹窗。失败时在弹窗内展示「结论未保存，编辑内容仍在」，允许直接重试。若内容改写，应使用新的 operationId；同一内容重试沿用原 ID。
4. 校验非空、最大长度及被引用消息 ID 的归属；不增加结论新表或新服务。可选的存储校验是确保 `branchId` 存在且 `messageId` 属于该分支，以防陈旧客户端创建孤立结论。`src/discussion-store.ts:377–417` 当前按 operationId 去重，但**没有校验 `branchId`、`anchorId` 与消息关系**；至少给这个入口增加一项端到端断言。

**建议代码形状（示意，按现有闭包调整）：**

```js
function concludeFrom(node, message) {
  openActionDialog({
    kind: 'conclude', title: t('distilConclusion'),
    description: t('conclusionDialogDescription'),
    branchId: node.id, anchorId: node.anchorId,
    messageId: message.messageId, value: message.text,
    operationId: createUuid(),
  })
}
// 确认时：
const request = {
  passageId: activePassage.id,
  branchId: dialog.branchId,
  anchorId: dialog.anchorId,
  messageId: dialog.messageId,
  text,
  status: 'confirmed',
  operationId: dialog.operationId,
}
const result = unwrap(await recordConclusion(request), t)
if (result.kind !== 'recorded' && result.kind !== 'already-recorded') {
  // 弹窗与 actionText 保持不变，展示冲突原因
  return
}
// 确认成功后，加载新结论并关闭弹窗
```

**必须测试：**真实 inline Remote codec 的全字段请求能通过；同一内容确认一次只生成一条；模拟边界错误和网络错误后弹窗保留**用户修改后的**文字；按钮/⌘Enter 不能双写；切换句子后不把结论写在另一个锚点；完成后列表可以重新读取。**实机通过条件**：第四轮中的同一条 allée 讨论能编辑、保存、重启后查看结论。

## 2. P1：U03「我已理解」状态无法保存（可直接改）

`client.js:5824–5825` 传入 `settled`；但 `client.js:487–504` 和 `src/controller.ts:345–350` 只接受 `open | understood | unresolved | disputed | archived`，即网关边界错误的直接原因。`client.js:4772–4782` 已正确传 `title:null`，**不要修改这个合法字段**。修改点击映射为 `understood`，反向动作需要明确语义：若文案是「标记待查证」，用 `unresolved`；若只是「撤销已理解」，用 `open`。不要一边显示待查证，一边写入 open。

调用 `setBranchState` 成功只有 `kind:'updated'` 才刷新状态并显示成功；`kind:'conflict'` 时保留旧视图、提示「状态未保存」。如需乐观更新，应在失败时回滚；最简方式是等待确认后 `loadDiscussion`。单测要执行按钮，而不是仅匹配字符串；原生验证 open→understood→open/unresolved 后路线和讨论一致，重启仍一致。

## 3. P1：U01 取消解析之后仍成功写入（根因定位须先做，防护必须落地）

**证据：**第四轮首次解析后对第三句重新生成，用户立即取消，但同一 `operationId` 后台在约 53.6 秒后标记 `succeeded` 并写入 `revision 2`。前一轮也复现了任务没取消、只是 JSON 校验失败才没写入的情况。此时 UI `client.js:1207` 明确承诺取消后不会保存，所以已经构成**数据正确性事故**。测试记录见用户报告 U01 的两条 UTC 时间戳，不能把 `analysisCancelledRef` 的本地状态变化算作 Host 取消成功。

**当前代码链路：**

- `client.js:4115–4170` 创建 `AbortController`，取消时调用 `abort()`；`client.js:4286–4289` 把 `run.controller.signal` 传给前端包装；`client.js:6216–6221` 再以第二个实参调用 `api.analyseSentence(request,signal)`。
- 前端 inline descriptor 声明 `cancellation:{parameter:'signal'}`。但 **DSH 0.2.0-rc.2 运行时是否把第二个实参解释为取消配置并传入 Host，单靠声明无法证明**。该协议解析和真实 Remote 分发源不在本仓库。
- `src/controller.ts:2758–2965` 在模型回复后 `outcome.finish==='cancelled' || signal.aborted` 时拒绝，在写入事务 `:2897–2911` 开头再次检查 `signal.aborted`；`src/generation.ts:266–274` 同样在 provider 完成时检查信号。既有 `test/analysis-generation.test.mjs:253–278` 只使用**直接传给 controller 的同一个** AbortSignal，不能发现 Remote 到 Host 之间传递失败。
- Job 记录 `status:'succeeded'` 是很强的定位信息：至少持久化路径没有观察到有效取消；不能仅凭此断言究竟是浏览器实参、Gateway 转发还是 SDK 对提供者取消失效。

**必须先完成的四步隔离试验：**

A. 在原生 DSH 的 `analyseSentence` **远端 Host 入口** (`src/controller.ts:720–727`) 临时记录 `operationId`、进入时 `signal.aborted` 和 `signal.addEventListener('abort',...)` 的触发（只记录任务 ID 与事件时刻，勿输出私有原文）；在前端 `cancelAnalysisRun` 记录相同 ID。判断 UI 已 abort 之后 Host 是否收到该事件。

B. 用**可控的延时生成后端**从真实 `api.analyseSentence(request,signal)` 走完整客户端—Remote—Host，等待后点击取消；记录 Host abort 回调、job 最终状态及句子 revision。**禁止用 controller 直接调用替代 Remote 试验**。

C. 若 Host 未收到 abort，检查当前 DSH remote-client 具体签名，确定传 `AbortSignal` 的合法方式；按宿主接口修正 `client.js:6216–6221`，保留已有 controller 检查；复测已成功输出但取消发生在保存前的窗口。

D. 若 Remote 无法可靠取消已开始的长耗时请求，则以已有 `operationId` 实现**最小的服务器侧撤销确认**：新增一个专用取消动作，宿主在现有任务记录或同一 controller 的活动任务状态中标记撤销，并在序列化写入区读取**当前撤销状态**，拒绝完成提交；前端必须收到确认后才写「已取消且不会覆盖」。如果 Provider 无法物理停止，可以如实反馈「已阻止保存，模型可能仍继续生成」。不先引入独立任务调度器、全局事件总线或分布式任务机制。若选择持久化标记，必须防止后到的 progress 写入用旧 job 结构覆盖取消标记（`generation-store.ts:115–165` 基于传入 job 快照改写）。

**并发边界：**现有 `controller.ts:2897–2911` 在异步 `putSentenceAnalysis` 前检查一次 signal；若取消在持久化写**已经开始后**才到达，不能承诺强撤销已完成的原子写。需定义取消的线性化语义：收到宿主「取消已确认」时，任何尚未提交的结果不会入库；已经提交的要明确反馈，而不能报无条件取消。可以用测试存储桩在 `table.put` 时延迟，检查取消与提交的竞态。UI 不应将 `run.isCurrent()===false` 当作存储撤销。

**原生验收：**带已存 revision 1 的句子：①生成中取消不改变已有译文、revision 与更新时间；②模型忽略取消仍返回合法 JSON，也不会提交；③正常运行可以覆盖并升 revision；④重启、切换句子后结果相同；⑤job 必须诚实反映取消/已提交，不能继续 `succeeded` 而 UI 宣称未写。两个后端 route 如可用，至少各做一次。取消链路根因没确定前，**不算修复完成**。

## 4. P2：U04 讨论回答不是可读文档（已证实渲染错误）

`client.js:5786–5820` 的 `discussionNode` 在 `:5802` 直接 `h('div',{className:'answer'},message.text)`；React 对纯文本不会渲染 Markdown，CSS 的普通空白压缩也会使表格行、标题和列表合并。模型回答里已有 `**...**`、反引号、管线表格，故无需再做模型格式猜测。

**改法：**给 AI 回答和流式尾部统一一个 `renderAnswerMarkdown(text)`，按实际输出覆盖标题、普通段落、粗体/斜体、内联 code、围栏代码块、列表和 GFM 简单表格。首选仓库已有且能在**裸 `client.js` 模块加载器**使用的安全渲染机制；如果没有，不可直接在浏览器半部 `require` 未声明的 Markdown 库，也不能将未净化的模型 HTML 交给 `dangerouslySetInnerHTML`。可以写轻量 Markdown→React 元素渲染器，保持原始文本复制和换行；链接仅允许明确允许的 URL scheme、禁用内嵌 HTML 与脚本。代码块 `pre/code`，表格真实 `table/thead/tbody/tr/td`；移动端表格可横向滚动。**不要借修排版重写问答存储或生成协议**。

**测试：**使用 U04 同类含星号、内联代码、3×3 管线表及换行的真实文本，检查渲染节点、段落可读性、复制内容、窄屏溢出、恶意 `<img onerror>` 不执行、增量尚不完整围栏时仍可回退纯文本显示。

## 5. P2：U05 查到未收录词以后无法继续学习（明确功能缺口）

`client.js:5341–5358` `lookupWord` 仅调用 `lookupMot`；`src/controller.ts:1436–1444` 明确这是**本地只读检索**；随后 UI 构建 knowledge node，仅返回「未收藏」和候选，不产生词条。`src/controller.ts:1451–1483` 已经具备 `createLexiconEntry`、`appendLexiconOccurrence` 等业务方法，但**未声明对应的 UI Remote 入口**。`answer-extraction.ts` 负责语法点而非新词积累；因此不能仅依赖一次讨论自动把 allée 转为 aller 词条。

**建议分两步，每步可独立交付：**

- **先实现最小闭环：**未收录词的结果卡显示「以当前词形查询」「手动添加词条」「就此词提问」。添加表单让用户填写/确认 `mot`（原文实际词形 allée）、`lemma`（原形 aller）、词性、定义、例句，来源状态默认 `user`，绝不假称联网词典已核验。UI 按现有 controller 输入形状新增 `createLexiconEntry` Remote；如需把当前句挂到词条，再最小暴露 `appendLexiconOccurrence`，复用已有存储/索引/去重逻辑。
- **再做讨论后入库：**从一条模型回答点击「存入词库」，预填可编辑的原形、词性、意义与本句语境。用户确认后保存，模型材料应带 `ai` / `mixed` 来源标识和未核实说明，不自动无条件猜测 lemma。保存已有动词后从现有词条导航到已有 `ConjugationView`（不要另建变位数据库）。

**必须区分：**查词命中本地库、未命中但有候选、未命中且无候选；UI 不能把「本地未收藏」说成「法国词典没有该词」。词形 `allée` 与原形 `aller` 必须可被相互检索，但相同词形有多词性时不可强制合并不同释义。测试新库查询 allée→补充为 aller→保存本句 occurrence→重新打开能查询→进入变位；不依赖模型自动识别才能完成手动路径。

## 6. P2：U06 解析说明语言漂移（模型输出质量，不是解析器故障）

`src/analysis-store.ts:159–175` 要求 JSON 字段、字符下标和语义分类，但没有按字段显式要求**译文及 explanation.text、morphology.note 使用中文**；`src/context-compiler.ts:287–292` 系统提示虽继承 `SYSTEM_BASE` 的「回答用中文，保留法语原句与术语」，但第四轮有法语 explanation 的有效案例。这个一般指令对结构化字段不够明确。

在 `analysisPrompt` 和 `renderAnalysisSystem` **同一协议下**明确：`translation` 用自然中文；`explanations[].text` 与 `morphology[].note` 原则上中文说明，法语仅保留术语、引文、形态标记；`role` 可用规范中文句法名称；不得把法语整段解释视为符合中文阅读任务。测试检查生成请求中存在这些指令，并以真实第三句重复 A/B 样本记录语言分布。**不建议仅靠检测拉丁字母比例就拒收整条解析**，那会误伤必须出现的法语原句及术语；也不建议强行机器翻译存入作为模型原输出。

## 7. P2：U07 跨段指代材料缺失（应补的业务信息）

`controller.ts:2788–2795` 从 segmentation 找到当前段并把 `paragraph.text` 交给 `analysisPrompt`；`src/analysis-store.ts:172–174` 只发送「当前段落」和目标句。第二段只有 bibliothécaire 一句，模型看不到前段 Léa 与行动链，因而 `lui`、`elle` 的判断所需证据不全。这是**输入缺口**，不是要求模型在缺材料时猜对。

**最小第一阶段：**在 `analyseSentence` 根据**当前 segmentation 的真实顺序**选取当前段和一个前段（建议在不影响模型输入限制时，也包含下一段），逐段携带 `pN`、`sourceRevision` 与清楚的「仅供消歧，不是解析目标」标签；目标句仍严格唯一。短文本直接给上下文；长篇按已存在的 20,000 字符原文限制设置独立上下文预算，例如先保留当前段和完整前段，超过预算时明确缩减或返回可读的容量提示。不要将另一篇或整个书架默认引入；不要为了首个修复新建材料选择数据库。

**第二阶段仅在实际需要时：**允许阅读者预览材料和调整相邻段范围；这涉及新增 Remote 请求字段、Host schema 和客户端 strict codec，须同时更新生成协议与测试，不应抢在基本跨段能力前做。`analysisPrompt` 的输入可扩为 `{sentence, anchorId, paragraph, neighbouringParagraphs}`，保留兼容默认空列表。回归：给第三句时前段 Léa 出现在真实 prompt；当前句坐标仍以**这一句**为零点，不能变成整篇坐标；仍允许针对证据不足使用 unverified。

## 8. P2：U08 问答等待期和流式阅读反馈不足

`client.js:4698–4754` 已经调用 `streamAsk()`，`receiveStream:4757–4765` 会累加 delta，但 `composerBody:5778–5781` 把 `streamText` 放在输入框**下面**，存储后的消息位于另一滚动区域的 `discussionNode:5797–5820`。这解释了为何应用技术上有流式通道，而阅读者仍看不到等待状态/新答案。实测 17.389 秒不代表所有 provider 都不流式，也不能据此断言流事件本身缺失。

**修复不必改 Remote：**发送后将问题以「待处理」呈现在讨论消息区的相应位置（可用临时 UI 消息，以已有 `operationId` 去重），显示模型、开始时间及每秒递增的实时时长；后端 delta 来了就把增量绘制到**同一条临时回答**，完成后用 `listDiscussion` 返回的已持久化消息替换并去掉临时项。未产生 delta 时显示「等待模型正文」，不可造进度百分比。失败时标明「本次未完成」，保留可恢复的问题草稿；用户正在看旧内容则使用「有新回答，跳转」按钮而非强制滚动。取消问答必须先决定是否有宿主确认/是否支持取消持久化，不能仿照 U01 的错误承诺。

**测试：**非流式 reply / delta 分批 / 提前结束无终止帧 / 用户切换段落 / 失败 / 持久化消息刷新，各自不出现重复问答或状态永远 busy；真实文本保持可复制且 Markdown 渲染与最终一致。

## 9. P3：U09 阅读区尺寸与滚动行为

目前 `readingShell` 将 `detailScroll`（`client.js:6043`）与底部 `composer`（`:6144–6145`）分开，CSS 及短屏切换还使用 `readingPaneRef`、`detailScrollRef` 两套滚动容器（`client.js:2986–3006`）。**先解决已复现的到达问题**：新消息完成后将目标回答区的内部滚动位置移到最新消息（仅当用户此前已经在底部），否则给可点击通知；清楚显示当前讨论滚动区和输入区边界。压缩标题和常驻工具条，缩短常用操作到达距离。

报告建议「唯一纵向滚动容器」是较大布局设计，需要 2560×1640、1440×900、320×568、长 Markdown 表格及路线侧栏同时验证。**不要求在 P1 修复中整体改造页面骨架。**对 `shortReading` 手动容器切换要防止 scrollTop 被错误重置。

## 10. P3：U10 新段录入只预览段落摘要

`src/import-preview.ts:31–40` 的 `blocks` 仅 `{id,sentences:number,excerpt:string}`，`:138–142` 明确截断长于 120 字符的段落；`src/controller.ts:1009–1025` 只是转发；因此 UI 不可能渲染逐句边界，不是 CSS 造成的省略。

**建议扩展现有预览，而非新增切分服务：**`blocks` 给出该段实际 `sentences:[{id,text,start,end}]`，或增加兼容字段 `sentenceSummaries`，沿用 `segmentSource` 的唯一算法，不要前端独立再做一套法语断句。原来的 `sentences` 计数保留或单独命名为 `sentenceCount`，避免与新数组重名。同步 `src/types.ts`、Host 生成描述、`client.js` 的 inline strict codec、显示层和 fixture。上下文字数过大可以滚动中间预览区，但底部保留「返回编辑/确认保存」动作（此前确认后才能保存的业务契约不得改变）。测试跨自然段/法文引号/缩写/长句的可见边界与实际持久化 segmentation 完全一致。

## 11. P3：U11 讨论新建后不自动进入

`client.js:5288–5295` 创建前关闭分支弹窗；`:5305–5325` 成功后只 `loadDiscussion`、`setAskStatus`，没有把 `selectedNode` 选为返回的 `branchId`。因此必须再次点击新分支才能提问。

**无协议变更的立即修复：**成功 `createBranch` 后从 `value.branchId` 定位刚创建的 `DiscussionView` 分支、调用 `pickNode(branchNode(branch))` 或直接设置 `selectedNode` 为该分支。原 parent/cut 信息保持，失败时保留标题输入内容或在相同弹窗显示错误。

**首问的简化路径：**保留手动命名入口；「提问」可创建默认命名的新分支并立即打开 composer，首个问题再按现有预览—发送两步进行。不要把现有分支按钮变成无条件新建（仓库原注释说明这一点曾导致误创建）。对子分支用 `forkedFrom` 的指定 messageId 验证继承历史，不得混入兄弟分支。

## 12. P2/P3：U12 阅读位置无法恢复

`client.js:3990–4003` 的 `loadReading` 每次读取后强制 `setAnchorId(第一句)`，`useEffect:4012–4041` 也重置节点、讨论和路线等状态。浏览器当前只存书架与接续关系（`:3373–3377`），缺少「最后阅读位置」。实测重启回首页再开第一句，与此一致。

**最小持久化方案：**本地 `localStorage` 独立键 `{version,passageId,anchorId,branchId?,updatedAt}`，每次用户主动切换句子、讨论或篇目后保存；书架入口增加「继续阅读」。重新打开读取 Host `getPassage` + `getSegmentation`，只有找到仍有效的 passage/anchor 才恢复；无效则退回该篇首句并告知；不存在的篇目回书架而不是跳到其他书。`branchId` 需要等待 `listDiscussion` 后再确认存在，避免先恢复到被归档/不存在的讨论。初版不必持久化精确像素 scrollTop，先恢复篇目、句子和讨论；之后如要还原滚动可保存相对锚点，不能用易变的绝对高度作为唯一依据。不要改 Host 存储表。

## 13. P2/P3：U13 历史回答看不到当时发送的上下文

`src/controller.ts:808–831` 已公开 `readContext`，可按 `passageId/contextId` 返回持久化的 prompt 与 materials；`listDiscussion:2295–2326` 的每条模型消息也有 `contextId`。`client.js:5733–5758` 只渲染正在草拟的 `contextPreview`，因此重启后展开旧回答时显示「尚未编译上下文」。**这是 UI 未接通既有读接口，绝无必要重新生成旧 prompt 或添加存储表。**

**最小改动：**每条 `message.author==='model' && message.contextId` 增加「查看本次回答使用材料」，点击后调用 `readContext({passageId, contextId:message.contextId})`，展开当时模型、materials、prompt；在同一会话缓存 `{contextId→结果}`，切换篇目清理或按 passage ID 限定。不具 contextId 的旧消息标注「无历史快照」，**不要把新问题的 preview 冒充历史上下文**。错误时仅影响该条历史面板，不影响讨论。测试重启后旧问题无需新提问即可查看；切换分支、修订原文不改变历史内容。

## 14. P3：U14 错误提示、备份操作反馈和章节标题

**操作错误分类：**`client.js:4772–4782` 把状态修改失败描述为 `generationUnavailable`，`client.js:5365–5377` 对结论同样如此，属于确定的错误归因。改为 `conclusionSaveFailed` / `branchStateSaveFailed` / `previewFailed` 等可读操作提示，正文说明「尚未保存」「编辑仍在」，诊断信息可另行展开；不要直接把 Typert boundary/wire field 给一般用户。

**完整备份：**`client.js:3102–3179` 已 `setStatus`，也会收到 `{imported,skipped,conflicts}`；但入口关闭、切换书架后该局部 status 没有可见位置（R3 原生复测已确认）。把导出成功写入书架/段落管理**实际可见**的 toast 或持久状态栏，导入后明确显示导入 N、跳过 M、冲突 K；若有冲突，至少列出冲突的 key/原因或可展开详情。保留导入不覆盖本地不同内容的既有策略。切勿误报「未导出」——真实文件已成功保存。

**章节标题：**阅读目录已经使用 `shelf.placements[passage.id].chapter`（`client.js:6023–6026`）；路线另一处固定「章节 1」应直接从该同一位置对象读 chapter，缺省才回退序号。尽量只修 UI 显示，不让 UI book chapter 混入 segmentation `p1` 段落 ID。

## 15. P3：U15 禁用发音控件

`client.js:5097–5100` 路线句子节点仍生成 `disabled:true` 的发音占位；`client.js:6109–6110` 主工具栏同样有禁用的 `audioGenerate`。音频服务尚不存在。可将这些按钮从普通阅读路径暂时隐藏，把「暂未支持语音」集中写在能力说明；待真实音频接口接入后再显示。不要把无音频能力当作一个需要空白回调的服务来扩展。

## 16. R3：模型已生成完整回复，但字符索引多次拒收（必须专项修复）

前一轮真实测试在同一句上三次请求结果均 JSON 成功且模型 `stop`，却产生末尾漏 `s.`、`83 > 82` 越界、局部单词位移，解析门禁全部拒收。**拒收是正确的**；修改目标应是提高模型生成的可执行索引准确率，而不是放宽范围验证。

相关链：`analysis-store.ts:159–175` 要求模型直接产生 start/end；`analysis-store.ts:230–283` 读取为数字；`analysis.ts:180+` 负责字面匹配、覆盖等校验；`controller.ts:2871–2911` 拒绝后不修改旧解析。

**建议渐进实施：**

1. 先把这一句的原文、原模型 JSON、`validation.errors` 做本地固定测试样例；每条错误归类为错位、越界、文本不一致、缺覆盖、句间字符偏移、重复片段歧义。保留成功结果旧 revision 不变的断言。
2. Prompt 中给出文字索引范例、明确 JS UTF-16 字符单位及半开区间；保持句子原样（包括标点、空格、重音字符、缩写）。对复杂 Unicode 如 emoji/组合音符不要含糊地说 code point；JavaScript `.slice` 使用 UTF-16 code unit。实测在同一真实句上比较是否改善。
3. 若实际 JSON 携带每项 `text`，可增加**严格受限的确定性定位恢复**：仅在原区间不匹配而文本片段在目标句中**唯一且精确**匹配时，使用本地 `indexOf(text)` 重新计算位置；所有从句、成分、解释的 ID 依赖及覆盖重新走原验证。若同一片段重复、存在多个合法位置、文本本身不在句中或恢复后仍有覆盖错误，照旧拒收。仅用于被检查为确定无歧义的分段；把 `positionAdjusted` 记入诊断，不能暗称模型输出的原始位置正确。
4. 若上项仍不够，再单独评估输出协议改为模型提供 span 文本/顺序、程序统一派生索引的方案；此为较大协议变更，需要新的测试和历史数据兼容设计，不应首轮直接改动全套存储。

**质量验收：**正常模型生成样本中结构化 JSON 被接收的比例、人工抽样句法正确性和旧数据完整性均需评估。不能以「降级到纯文本」掩盖失败，亦不应重复自动重试数次且吞没模型费用。若做自动重试必须明确次数和费用上限。

## 17. R3：知识库标签状态分裂（直接修）

`client.js:2052–2053` 的 `KnowledgeLibrary` 自己 `useState('vocab')`，父级 `client.js:3293` 的 `knowledgeTab` 在详情与面包屑中使用；`client.js:5526–5527` 的顶部标签取的是父状态。子列表选「语法」不更新父状态，详情返回时子组件重新挂载，又重置到词汇列表，R3 原生已复现。

**最小修复：**给 `KnowledgeLibrary` 增 `tab:knowledgeTab,onTabChange:setKnowledgeTab` 两个 props，删除内部 `useState('vocab')`，选项卡点击更新父状态；返回详情仅 `setKnowledgeEntryId(null)`，列表仍保持 grammar。允许详情打开 `onOpenEntry(id,tab)` 同步父状态。测试实际切语法→顶部语法→打开详情→返回仍语法→切词汇→顶部词汇。**不要再增加路由管理器。**

## 18. 附带的确定性脆弱点（最少修改，勿误作已实测故障）

**A. 结论存储缺少关系检验。** `discussion-store.ts:377–417` 按传入的 passageId/branchId/anchorId/messageId 直接创建，无法断言这些字段互相对应；当 UI 因旧状态传错消息 ID 时会生成错误归属。因为 U02 恰要补三个字段，本轮可以顺手在 `recordConclusion` 同一写事务内确认 branch/message 存在且锚点一致，并返回现有明确 conflict；不是新增防御层。

**B. 同一锚点的跨分支结论会互相 supersede。** `discussion-store.ts:406–415` 写一条 `confirmed` 时，将同 anchor 下所有旧 confirmed 置为 `superseded`，没有按 branchId 划分。产品需决定「一个句子只能有一个最终结论」还是「各个讨论分支结论并存」。分支原始隔离目标支持后者，但当前源码注释写了按锚点唯一，**在确认语义前不能擅自修改**。至少纳入端到端对照测试，避免修 U02 后第一次出现惊讶结果。

**C. 生成中状态不是第一段正文。** `generation.ts:217–231` 用 `onPhase('streaming')` 表示开始消费供应商流，真正首非空文字以 `firstTextDeltaMs` 记录；UI 不能显示「正在输出」作为已收到文字的事实。新字段已经存在且真实 job 有值，无须再添加六阶段持久化协议。

**D. 文件导入和本地书架合并。** `client.js:3165–3169` 导入 Host 后会把 browserLibrary 合并进入本地位置，不会强制覆盖已有本机记录；本轮实机已经验证非空元数据导出，**尚未验证异设备导入之后的非空归类和接续复原**。这是必须补的一项验收，不是已证实导入错误。

## 19. 建议按四批修改，并在每批后执行真实使用验收

| 批次 | 内容 | 代码触点 | 本批不可省略的测试 |
|---|---|---|---|
| A — 保存可靠性 | U02 结论、U03 分支状态，U01 取消信号链定位并落实取消后拒写 | `client.js`, Remote, `controller.ts`（仅必要时） | 真实 strict RPC、失败保留草稿、状态重启恢复、合法 JSON 被取消后无覆盖 |
| B — 可用的学习内容 | U04 Markdown，R3 索引可靠性，U06 中文输出、U07 上下文 | `client.js`, `analysis-store.ts`, `context-compiler.ts`, `analysis.ts`（视定位） | 表格阅读、恶意文本不执行、指代上下文、索引门禁、真实生成成功率 |
| C — 词汇与讨论闭环 | U05 手动建词条和句子 occurrence、U08 流式反馈、U11 自动进入分支、U13 历史上下文 | 现有 lexicon controller + 最少 Remote 声明、`client.js` | allée→aller→变位，发送即显示，历史快照回看，分叉隔离 |
| D — 连续阅读与 UX | U09 滚动、U10 逐句预览、U12 位置恢复、U14 提示、U15 隐藏音频、R3 语法列表状态 | 主要 `client.js`，预览少量接口字段 | 新短文三句全部展示、重启回第三句、列表往返、可见备份结果、320 与 1440 像素宽屏 |

**批次 A 的完成要求高于单元测试通过：**必须在原生 UI 逐项复现原故障，再证明旧 revision 和用户刚编辑的结论不会丢。批次 B 不应为更高的解析成功率牺牲结构化语义准确性。批次 C 的自动词条积累先以用户确认路径落地，不凭空连接线上辞典。批次 D 可以分为多个小 PR，不需要一次重做整套布局。

### 最小回归测试矩阵

1. **Remote 契约**：结论/状态/新词请求字段合法、生成客户端 inline codec 与 Host 实际 schema 一致；批次涉及 Remote 变更才重新运行 Typert 生成与契约测试。
2. **持久化**：新结论和状态在关闭、重启后仍存在；失败时原值不变；同 operationId 重试不追加；有冲突时 UI 不显示成功。
3. **取消**：Remote 真实调用+延迟后端+取消确认+合法 JSON 返回后保持原 revision（这是当前测试套未覆盖的环节）。
4. **解析**：相同句子的成功/错位/多重相同词/越界/未覆盖四类 fixture，门禁仍保护旧结果；真实中文字段说明和跨段上下文抽样。
5. **学习路径**：空词库里 allée 查询与入库、aller 变位入口、一次问答与分叉、单条历史上下文，不依赖已有示例数据。
6. **UI**：Markdown 结构、滚动、失败保留文本、备份操作结果、位置恢复、知识库往返、长篇三句以上预览、低宽度无遮挡。
7. **完整测试**：构建后运行仓库根 `pnpm build`，然后 `pnpm --filter @local/french-close-reading test`；通过后**必须重新安装或重新加载实际 DSH** 执行原生操作。上一轮 449/449 是已有报告的数字，本审计没有重新运行。

## 20. 源码导航（精确到文件/行区间）

以下链接固定指向本次源码提交，避免后续提交导致行号漂移：

- [前端协议、按钮、状态、内容渲染：`client.js`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/9e391431e0fb3871d38381d168d4e556992ed96f/packages/french-close-reading/client.js)
- [Host Remote / 生成 / 存储接口：`src/controller.ts`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/9e391431e0fb3871d38381d168d4e556992ed96f/packages/french-close-reading/src/controller.ts)
- [上下文与系统提示：`src/context-compiler.ts`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/9e391431e0fb3871d38381d168d4e556992ed96f/packages/french-close-reading/src/context-compiler.ts)
- [句法生成 JSON 与解析：`src/analysis-store.ts`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/9e391431e0fb3871d38381d168d4e556992ed96f/packages/french-close-reading/src/analysis-store.ts)
- [结构化区间门禁：`src/analysis.ts`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/9e391431e0fb3871d38381d168d4e556992ed96f/packages/french-close-reading/src/analysis.ts)
- [模型调用与计时：`src/generation.ts`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/9e391431e0fb3871d38381d168d4e556992ed96f/packages/french-close-reading/src/generation.ts)
- [生成任务写入：`src/generation-store.ts`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/9e391431e0fb3871d38381d168d4e556992ed96f/packages/french-close-reading/src/generation-store.ts)
- [结论与分支存储：`src/discussion-store.ts`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/9e391431e0fb3871d38381d168d4e556992ed96f/packages/french-close-reading/src/discussion-store.ts)
- [段落预览：`src/import-preview.ts`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/9e391431e0fb3871d38381d168d4e556992ed96f/packages/french-close-reading/src/import-preview.ts)
- [前端回归测试：`test/client-audit-regressions.test.mjs`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/9e391431e0fb3871d38381d168d4e556992ed96f/packages/french-close-reading/test/client-audit-regressions.test.mjs)
- [逐句解析回归测试：`test/analysis-generation.test.mjs`](https://github.com/helix-drop/dsh-french-reader-workspace/blob/9e391431e0fb3871d38381d168d4e556992ed96f/packages/french-close-reading/test/analysis-generation.test.mjs)
- [第四轮真实阅读测试报告（仓库版）](https://github.com/helix-drop/dsh-french-reader-workspace/blob/2ab8ff6f0ade02d3a0fc129fc8499b8a2266c54a/docs/verification/french-user-journey-deepseek-v41-flash-2026-10-09.md)

**审计收束：**最先修改结论与状态两个确凿协议错误，并对取消执行真实 Remote 信号追踪；其次提高实际逐句解析可接收率与输出语言一致性。剩余工作均按具体学习流程逐项交付。现有已有功能的存储契约和校验仍是可靠性的基础，不能以「过度防御」为由删掉。
