# 法语精读第五轮故障接口调查

2026-10-09。本报告补充[第五轮实机复测报告](french-computer-use-round5-2026-10-09.md)，调查 F01—F06、取消状态同步及生成等待。调查基线为 main 提交 `00e04e9302257b4d0516a864aa9b25b6600cb317`，插件 v0.1.2，客户端 SHA-256 为 `45b8c7027d2a4fc95787559f4d1d41fbb95dfb42a33d25c94a47f010239c81a7`。本次只修改报告，没有修改产品代码、调用模型、改写用户存储或向 DSH 开发会话发送指令。

六项故障均有具体定位。F01 在点击处理时退出，未发出解析请求。F02 的创建接口成功，界面读取了错误的返回字段。F03 的词性语义在保存与卡片分类之间不一致。F04 恢复旧查词快照。F05 的结论已经返回客户端，但客户端没有生成入口。F06 是本地 Markdown 解析缺陷。这些证据不支持将六项问题归因于模型速度、网络连接或全域存储损坏。

## 证据及调查边界

| 证据层 | 本次核对方式 | 能够支持的结论及限制 |
|---|---|---|
| 真实用户操作 | 采用第五轮原生 Codex computer-use 的鼠标、键盘、可访问性树、截图及重启记录 | 保留已观察到的故障；本次没有重新执行整轮实机验收，也没有增加小窗口通过结论 |
| 实际记录 | 只读加载本机 french_reader 记录，在内存中执行当前 lib 的查询及渲染方法；禁止该内存表写入 | 验证已保存词条、结论和任务能经当前宿主查询返回；不是对运行进程的网络抓包 |
| 客户端行为 | 临时探针执行仓库实际 client.js、其内联 codec 和真实组件处理器，使用已有测试框架的 React 替身 | 能验证点击参数、返回字段和恢复状态；不能替代浏览器布局、真实网关流或外部来源抓取验收 |
| 远程协议 | 对比内联描述、生成客户端、生成宿主及 controller；对实际查询结果执行两套客户端 codec | 针对本报告相关接口核对，不宣称 45 个接口的所有输入组合都已验证 |
| 模型适配器 | 只读提取本机 DeepSeek Harness.app 的 app.asar 中相关模块，查看请求构造、默认推理强度、流与取消代码 | 证明安装包的实现；未截获本轮实际 HTTP 请求，不推测凭证、实际 endpoint 配置或实际推理强度 |
| 自动测试 | 阅读本轮已经通过的 473 项测试及替身实现，补充针对性只读探针 | 原测试通过事实沿用上一报告；本次新增的是调查证据，没有新增产品测试或声称修复完成 |

临时探针和完整本机记录没有提交仓库。报告仅保留专门创建的测试记录标识及必要摘要。

## 请求与返回的完整路径

客户端注册的服务为 `frenchReader`，调用标识统一采用 `@local/french-close-reading#frenchReader/<method>`。浏览器无法直接依赖 zod，因此 client.js 手工维护内联校验器；lib/typert.remote-client.js 和 lib/typert.host.js 是另一套生成协议。宿主 Remote 方法还会执行 controller 中的请求校验，随后读写 french_reader 域。

直接调用由客户端 `unwrap` 解开 `{ ok: true, value: ... }` 外层结果，业务结果保留自己的 kind 或 ok。streamAsk 使用异步帧流，delta 携带文本，done 携带终结业务结果。业务取消、网关断开和业务冲突并非同一种返回。下面省略直接调用的公共外层结果。

| 用户动作 | 涉及接口及主要字段 | 宿主及存储路径 | 界面处理与问题位置 |
|---|---|---|---|
| 单句预览及解析 | previewAnalysisContext 请求 passageId、anchorId、可选 paragraphIds；返回材料、纳入段落、字符数和 fingerprint。analyseSentence 另携带 backend、model、operationId、expectedFingerprint | 解析预览读取篇目与切句；模型生成后进行协议解析、门禁及持久化 | F01 未到 previewAnalysisContext；600 秒超时、生成门禁及 cancelAnalysis 均尚未进入 |
| 首次讨论、分叉及查词提问 | createBranch 请求 passageId、anchorId、kind、title、parentId、forkedFrom、operationId；成功返回 kind 与 branchId | createBranchRemote → createDiscussionBranch → discussion-store 的 createBranch；随后应调用 listDiscussion | F02 使用 value.branch.id，成功后提前返回，未刷新讨论、选中分支或转移首个问题 |
| 查词及手动保存 | lookupMot 返回 found、entries、candidates；createLexiconEntry 返回 kind、entryId、occurrence，冲突时另带 reason | 创建精确词形和词性对应的词条；词条与出处分次持久化，部分失败单独报告 | F03 保存中文词性后渲染分类失配；F04 保存后返回旧 lookup 节点 |
| 词卡与变位 | renderLexicon 返回 kind 及 rendered、sections、errors、hints；readConjugation/fetchConjugation 请求 lemma | lexicon-store → output-policy；变位另查独立数据记录，抓取需要外部来源 | F03 词卡没有 §4，界面没有创建 ConjugationView，变位读取及抓取入口均不可达 |
| 保存与回看结论 | recordConclusion 请求来源分支、锚点、消息、正文、状态及 operationId；返回 conclusionId。listDiscussion 已返回 conclusions | addConclusion 写入来源及修订信息；listDiscussion 投影为 conclusionId、branchId、anchorId、text、status、messageId | F05 loadDiscussion 接收数据，routeNodes 只消费 branches，遗漏 conclusions |
| 讨论生成、取消及格式 | previewAsk → streamAsk；delta.text、done.result；取消使用原调用 AbortSignal；listDiscussion 的消息带 status | ask 保存问题、上下文、job，调用 DshLlmBackend，再保存回答及终结 job，处理语法点 | 取消后的 catch 刷新记录却固定显示未确认；F06 将回答字符串交给本地 renderMarkdown 时丢失列表序号与嵌套内联格式 |

## F01：点击事件进入材料确认参数

| 环节 | 证据 |
|---|---|
| 真实结果 | 新篇 595b0a45-209d-4d94-b547-6b0ddde3add9 的第一句和第三句均无法打开预览，没有 analyse job，覆盖仍为 0/3 |
| 入口 | packages/french-close-reading/client.js:7356 将 analyseCurrent 直接交给 onClick |
| 提前退出 | client.js:5032 的参数为 confirmedContext，默认 null。只有 null 才打开预览；真实 React 点击传入事件对象，该对象缺少 ok、fingerprint、anchorId，函数直接 return |
| 动态对照 | 执行真实处理器并传入普通 click 事件，预览调用数为 0；省略事件参数执行同一处理器，调用数为 1 |
| 接口可用性 | 当前 lib 对实际测试篇 p1.s1 执行 previewAnalysisContextRemote，返回 ok: true、p1/p2 材料及字符串 fingerprint；内联与生成 codec 均接受该结果。此次只读直接调用不计入实机通过 |
| 影响范围 | 同一个 start 按钮同时承载首次解析与重新解析，两者都受影响。弹窗中的确认按钮使用显式包装并传入 preview，但正常操作无法打开该弹窗 |
| 未受检验的下游 | analyseSentence、模型调用、解析协议、源修订拒写及取消解析没有在第五轮真实进入，仍需独立实机复测 |
| 测试缺口 | test/client-continuation.test.mjs:1367 的预览测试调用 onClick()，没有真实事件参数，恰好绕过故障条件 |

根因确定为界面事件绑定与函数参数不匹配。预览接口不是本次无响应的故障点，也不能把无请求期间的等待解释为模型处理缓慢。

## F02：实际成功结果与界面所需结构不同

| 环节 | 证据 |
|---|---|
| 协议 | client.js:695 起的内联 CreateBranchValue 和生成协议均要求 `{ kind: 'created', branchId: string }` 或 already-created，均不要求 branch 对象 |
| 宿主 | src/controller.ts:730–736 返回 branchId；内部 discussion-store 返回 branch 对象后，控制器已将其转换为公开返回结构 |
| 错误消费 | client.js:6167 检查 value.branch.id；随后选中节点也使用 value.branch.id/title。真实返回因此触发 Host returned no branch id |
| 动态复现 | 提供符合真实协议的成功返回，创建调用 1 次，listDiscussion 刷新 0 次，诊断出现，composer 草稿仍为空。真实结构通过两套 codec；原测试中的 branch 对象结构同时遭两套 codec 拒绝 |
| 实际持久化 | 分支 a078f0e7-daf3-487f-b458-0de6c289eb9d 已存在，operationId 为 91c59b50-778a-496e-8066-652e27a7875e。重试同一操作未重复创建；重开篇目后可见 |
| 问题保留边界 | 表单失败时保留首个问题，但没有转移到讨论 composer，也没有发送模型。关闭表单后必须重新输入；不能宣称问题已经作为讨论消息保存 |
| 共享影响 | 常规首次提问、从消息分叉、未命中词在讨论中询问均调用 createBranchWith。后三者的相同代码风险成立，其中分叉未在第五轮额外创建实测 |
| 测试缺口 | test/client-continuation.test.mjs:1113 起的首次提问测试、后续分叉及词汇讨论测试模拟返回 branch 对象；panel 的 remote.$mount 是空替身，调用不经过 codec，所以不合法返回也能通过 |

这是业务成功结果的消费错误，不是网关无法确认保存。addBranch 的旧静态分支接口确实返回 branch 对象，但它与 createBranch 的讨论接口不同；不能混用两者的返回约定。

## F03：合法中文词性没有对应卡片类别

| 环节 | 证据 |
|---|---|
| 请求规则 | src/controller.ts:380 的 partOfSpeech 是长度 1—40 的自由字符串，没有词性枚举或转换。输入动词合法；保存接口没有拒绝它 |
| 实际词条 | envoyée 的词条 aa43b63e-7fef-4393-9f47-1fd4a245869a 查询命中，lemma 为 envoyer，词性为动词 |
| 卡片规则 | src/output-policy.ts:72 的 classify 识别 verbe/verb，中文动词得到 autre。sectionOrder 的 autre 没有 conjugation |
| 实际渲染 | 只读调用 renderLexiconEntry 返回 §1 总览、§2 当前含义、§6 文化语境、§7 固定表达，没有 §4 动词变位，和实机观察一致 |
| 界面连接 | client.js:6876 附近的 extraForSection 只在宿主提供变位章节时插入 ConjugationView。保存后设置 focusConjugation 无法产生宿主没有返回的章节 |
| 下游边界 | 对 envoyer 只读调用 readConjugation，返回合法 no-data，两套 codec 均接受。此结果不表示抓取失败；本轮没有外部抓取请求，更没有音频成功证据 |
| 扩展影响 | 其他中文词性也可能落入 autre；同一词形加动词与 verbe 会使用不同词性参与存储键计算，源码允许分开建条。未制造重复词条验证，不把此风险记为已发生的数据重复 |
| 测试缺口 | 手动添加测试使用 verbe，且只断言保存请求与词卡选中状态，没有覆盖中文词性到真实宿主章节的完整路径 |

词条保存、原形记录和变位数据是三个独立结果。当前故障先阻断变位入口，不能归因于第三方变位接口故障。

## F04：保存后恢复了未命中的旧快照

| 环节 | 证据 |
|---|---|
| 查词状态 | client.js:6225 的 lookupWord 将 miss、entryId、正文与 candidates 固定保存在 selectedNode |
| 保存与离开 | client.js:6298 的 saveLexiconEntryDraft 保存成功后调用 openKnowledge；openKnowledge 在 :4325 把当时的 selectedNode 存入 returnPoint |
| 返回 | returnToAnalysis 在 :4338 恢复 point.selectedNode，没有重新查询词库；保存处理器没有替换旧 lookup 节点 |
| 动态复现 | 未命中 → 手动保存 → 词卡 → 返回解析，lookupMot 仍只调用 1 次，恢复节点 miss: true、entryId: null，手动添加按钮重新出现 |
| 实际存储 | 本轮 envoyée 保存后重新查词命中同一词条，说明写入正常，旧页面显示失真 |
| 影响范围 | 从未命中结果进入保存词条的返回路径；同类从模型回答创建词条是否出现相同误导还取决于离开前节点，不能一概宣称所有返回路径失败 |
| 测试缺口 | test/client-continuation.test.mjs:1289 只验证保存后 knowledgeOpen 与 entryId，未验证返回后的查词结果 |

故障发生在客户端状态恢复，不需要以词条丢失或保存接口失败解释。重复点击手动添加会引入多余操作，已有同词形同词性的存储去重也不能消除界面的误导。

## F05：结论返回正常，路线没有入口

| 环节 | 证据 |
|---|---|
| 写入 | recordConclusionRemote 返回 recorded 或 already-recorded 和 conclusionId。实际结论 a3bd14e1-55c3-4f42-9831-eb43ce5c4241 为 confirmed，重启后保留 |
| 读取 | src/controller.ts:2469 的 listDiscussion 同时读取分支与结论；对上一轮测试篇 a4e166ed-f0a6-40e5-a2d3-78bff31a4ccf 的实际记录只读查询，返回该结论及源分支、源消息、正文、状态 |
| 协议验证 | 实际 DiscussionView 通过内联及生成客户端 codec，conclusions 没有在返回校验时丢失 |
| 客户端接收 | loadDiscussion 在 client.js:5417 接收整个结果；routeNodes 在 :5825 只加入覆盖过的解析节点与 discussion.branches，未读取 discussion.conclusions |
| 展示分支 | :6930 有已确认结论的渲染分支，但缺少把真实结论变成可选节点的流程，因此它不能证明功能可用 |
| 相邻限制 | 该展示分支的返回来源讨论按钮目前仅 setSelectedNode(null)，没有按 branchId 选回来源。这是静态确认的潜在后续导航缺陷，当前入口不可达，未作为新实机故障统计 |
| 测试缺口 | 结论写入及错误保留测试、已有分支显示测试，没有覆盖真实 listDiscussion.conclusions → 路线 → 点击回看 → 来源讨论 |

结论回看不缺宿主数据接口，缺少客户端对已有数据的入口和导航处理。写入成功与学习结果可回看应继续分别判定。

## F06：格式错误发生在模型返回之后

| 环节 | 证据 |
|---|---|
| 输入边界 | ask/streamAsk 提供回答文本，宿主分离 GRAMMAR 块后保存可阅读正文；协议没有承诺返回 HTML |
| 有序列表 | client.js:453 起仅合并相邻列表行，空行或解释段落终止列表；新建 ol 时没有 start。四个带原序号的单项列表都从浏览器默认 1 开始 |
| 动态复现 | 使用 1、2、3、4 四项及间隔段落，真实 renderMarkdown 返回 4 个 ol，各仅 1 个 li，start 均未设置 |
| 内联嵌套 | markdownInline 在 :339 将 strong/em 内部内容作为普通字符串输出，不再识别内部 code。标题 `### **Pourquoi le \`e\` ?**` 渲染后 code 节点为 0，反引号仍在 |
| 影响范围 | 带空行或项内解释的有序列表，以及粗体或斜体中的内联代码；普通连续列表和单独 code 不应一起判失败 |
| 测试缺口 | test/analysis-rendering.test.mjs:56 验证无序列表、表格和彼此分离的粗体/代码，没有有序序号、空行分项或内联嵌套断言 |

原文序号和文本已经存在，当前证据不支持模型生成错误或传输损坏。

## 取消回执：持久化终态与界面状态未同步

第五轮取消讨论 operationId `0175a39e-9592-4940-9908-97c63003f938` 的 job 为 cancelled，结束时间为 2026-10-09T14:05:39.234Z，failure 为 DeepSeek Messages request aborted。对应模型消息为 ff9437dd-8891-4c97-aed0-cb9c3a105a53，保存的是未返回内容的取消说明，消息状态为 cancelled。没有观察到迟到实质回答。

| 层次 | 调查结论 |
|---|---|
| 客户端请求 | cancelAsk 取消 streamAsk 的 AbortController，没有独立 cancelAsk Remote；这是对原调用的带外取消 |
| 供应商适配器 | 本机适配器把 signal 传入 HTTP fetch；调用取消时抛出 ABORTED 及相同错误文案，宿主后端将其映射为 cancelled |
| 宿主持久化 | ask 无论成功、取消或失败都会保存对应消息状态并结束 job。取消说明不是完整生成回答，不能把它等同于取消后仍写入模型正文 |
| 状态接口 | listDiscussion 已包含每条消息的 status、failure、contextId；listGenerationJobs 在宿主和工具层存在，但 45 个当前客户端 Remote 中没有该方法 |
| 界面失配 | client.js:5560 的 catch 在 signal.aborted 时先 loadDiscussion，随后无条件设置 askCancelUnconfirmed；没有使用刚读取的 cancelled 终态 |
| 关联缺口 | UI 的 askRun 没有保存 operationId；listDiscussion 消息投影没有 operationId。确定当前请求和终态消息的对应关系不能仅依赖同一分支里最后一条消息，尤其在并发情况下 |
| 不能外推 | 这一例证明本机调用结束及本机取消记录，不证明供应商服务端停止计算或停止计费。解析使用另一个 cancelAnalysis 接口，F01 阻断它的实机复测 |

## 生成速度与可见等待

| 指标 | 正常 envoyée 讨论 | 取消 gardée 讨论 |
|---|---|---|
| operationId | 6bdc4439-9463-482b-b301-80709d1baf41 | 0175a39e-9592-4940-9908-97c63003f938 |
| job 起止 | 14:04:33.218Z → 14:04:56.818Z | 14:05:31.104Z → 14:05:39.234Z |
| job 区间 | 23.600 秒 | 8.130 秒 |
| modelCallMs | 23.577 秒 | 8.112 秒 |
| firstTextDeltaMs | 20.368 秒 | null |
| usage | 输入 246，输出 4905 tokens | null |
| route | deepseek-official/deepseek-flash | deepseek-official/deepseek-flash |
| 终态 | succeeded | cancelled |

第一条记录约 86.4% 的模型调用区间经过后才出现正文，正文首块到调用结束约 3.209 秒。4905 输出 tokens 是适配器报告的 usage，没有拆分推理与可见正文；不能用 4905 / 3.209 计算正文速度，也不能把它直接当作可见回答长度。

src/generation.ts:170 起先 prepareCall，再开始模型调用计时，读取 prepared.stream；只处理 text-delta、usage、finish。安装的 dsh-llm-deepseek 适配器实际构造 Messages 请求，stream: true，并分别输出 reasoning-delta 与 text-delta。插件忽略 reasoning-delta，因此即使推理正在输出，读者也可能尚看不到正文。该事实解释了一种可见等待机制，不能排除供应商排队或网络等待。

| 待解释现象 | 已确认事实 | 仍未确认 |
|---|---|---|
| Flash 也等待约 20 秒才显示正文 | 显示名 DeepSeek-V41-Flash 对应适配器目录中的 deepseek-flash；当前任务记录使用同一路由 | resolvedModel 在插件中沿用请求路由，不是供应商单独确认的实际模型版本，不构成服务端 v4.1 身份证明 |
| 推理强度可能影响等待 | 客户端发送 reasoningEffort: null，后端变为未指定。安装适配器依次采用请求值、连接默认值；thinking 未禁用且没有默认值时采用 high | job 没有保存有效 thinking/effort，本次没有捕获实际请求体，因此不能确定该样本为 high |
| 23 毫秒的差额很小 | job 区间与 modelCallMs 相差 23 毫秒 | job 开始前已编译材料和保存问题；结束后还处理语法记录、返回 done、刷新界面。该差额不是点击到最终展示的完整本地开销 |
| job phase 一直为 dispatched | ask 传入 onDelta 与 onFirstTextDelta，没有传入 onPhase；解析路径另有 onPhase 写入 | 现有 phase 不能拆解这次 metadata、HTTP、首字等待和推理时间，也不能据此判定请求一直没有发出 |
| 是否自动重试或调用两次 | 插件本轮 job attempt 为一次，预览没有调用模型；仓库 ask 路径直接使用准备好的适配器流 | 未做网络抓包，不声明服务端内部没有重试；当前证据没有支持将长等待归因于重复发送 |
| 真实 endpoint | 安装适配器默认 root 为 https://api.deepseek.com/anthropic，实际发 POST 到 root/messages | root 可由配置覆盖，本次未核对实时连接配置，默认值不是本轮请求地址证据 |

旧轮次 162—291 秒来自其他模型或其他请求，不能与本次一条 23.600 秒讨论直接比较为整体性能提升。单句解析本轮没有发起，仍无对应速度数据。

安装包证据为 DeepSeek Harness.app/Contents/Resources/app.asar 中 dsh-llm 与 dsh-llm-deepseek，版本均为 0.2.0-rc.2；适配器 lib/index.js SHA-256 为 `226e2047b843f954d8478207613f3e44448671c6f98f8edee77008d0fe005484`。引用安装包代码位置为适配器 :43 模型目录、:1694 推理默认规则、:1876 推理流、:2130 取消、:2188 HTTP 请求。本次没有提交适配器源码或配置。

## 两套客户端协议的独立风险

内联客户端、生成客户端和生成宿主均暴露 45 个相同调用标识。但数量、标识及 strict 标签相同，不代表所有校验语义相同。

| 项目 | 确认证据 | 与本轮故障的关系 |
|---|---|---|
| nullable 字段缺失 | client.js:35 的 nilable 同时接受 undefined 和 null；生成协议对必需 nullable 字段只接受 null 或指定类型。对 createBranch 请求省略 parentId/forkedFrom，内联接受，生成协议拒绝 | 确认存在协议漂移；本轮 createBranchWith 显式发送两个 null，不是 F02 根因 |
| 校验范围不同 | 内联只检查基础形状，宿主还检查 UUID、长度、锚点、枚举及 strict 输入；例如 createLexiconEntry 的真实请求规则更严格 | 需要区分浏览器预检、生成协议与宿主业务校验，不把任何一层接受等同于最终可用 |
| 自动契约测试范围 | contracts.test.mjs 核对生成宿主与生成客户端的标识、strict 标签和方法清单；组件替身不会执行真实 codec | 不覆盖手工内联协议与真实组件对返回字段的消费。F02 不合法替身被放行，F01 真实事件参数未进入测试 |

该协议漂移单独记录为调查发现，尚未在本轮用户操作中复现，不扩大为新的已发生 P1 故障。

## 体验优化方案及验收依据

此处只提出体验优化方案。F01—F06 保留故障定位，不展开代码修复步骤。

| 体验问题 | 明确方案 | 验收依据 |
|---|---|---|
| 正文前长时间没有可见进展 | 输入区附近固定显示已提交、准备请求、已收到流、等待正文、完成等真实状态；若观察到 reasoning-delta，可显示模型正在推理，不必展示推理正文。同步保留用时与取消入口 | 状态来自真实事件，未收到推理事件时不宣称正在推理；正文到达前也有明确反馈，无需滚动寻找 |
| 不知道等待发生在哪一阶段 | 保存 prepareCall、派发、HTTP 首响应、首个推理事件、首个正文、结束、语法处理及界面就绪的分段时间，并记录有效 thinking/effort；禁止记录凭证 | 同一个 operationId 能串起阶段。给出首正文等待与最终可用时间，不再仅用 job 差额代表本地开销 |
| 简短查词也可能采用较高推理默认值 | 增加清楚标示的快速解答与深入分析选项，映射到该路由实际支持的 effort；保留模型选择和当前设置可见性。用同一短句和长句样本比较 off/low/high 的质量及耗时后确定默认值 | 实测各档延迟及法语语法准确性，不能只凭模型名称设定快慢，也不以降低准确性换取未经验证的提速 |
| 取消后长期显示未确认 | 保留可与当前请求关联的标识；取消后读取权威终态，若记录尚未完成则继续核对并显示正在确认，确认 cancelled 后呈现已取消；无法关联时提供刷新记录入口 | 正常取消能够收敛到终态；并发或迟到消息不会被误认成当前请求，供应商停止计费仍不作保证 |
| 保存新词后感觉没有保存 | 保存成功提示中显示词形和去向；返回时呈现当前词条状态，保留阅读锚点与滚动位置 | 保存 → 回看 → 返回的连续流程结果一致，无重复添加暗示。F04 仍须单独通过功能验收 |
| 词性输入要求用户猜测内部值 | 采用中文标签与规范词性值对应的选项，保留必要的补充说明；原形与原文词形分开显示，额外资料逐步展开 | 中文选择动词后完整阅读及变位路径可达；存量中文词性需要单独核对，不能只验新表单 |
| 空词卡显示编写规则 | 无资料章节默认折叠并写尚未收录，保留出处、读者填写或模型推断的来源标记；内部 errors 不直接作为必须完成的学习任务 | 手动填入释义即可得到可阅读词卡，未记录内容不冒充已知；文化与固定表达的审核规则不打断查词 |
| 保存结论后找不到 | 保存反馈提供立即查看入口；讨论中显示已确认结论及来源消息，重启后保留稳定入口 | 新保存及历史结论都可回看并回到来源。F05 仍须独立验收，提示文案不能替代可达入口 |

## 后续验收边界

当前仍不具备发布验收通过条件。两个 P1 故障阻断首次解析与首次讨论的正常完成。后续实机验收应重新从新文本开始，采用带真实事件的点击，使用实际 Remote 返回完成首个问题转移，再核对取消终态、结论回看、中文动词变位入口、保存后返回和原模型回答排版。解析取消、完整结构化生成、小窗口、长材料、外部变位抓取与音频仍没有本轮通过证据。

本报告的只读接口调用用于定位责任环节，不替代用户入口验收；旧实机问题仍以第五轮报告为准。没有要求或触发 DSH 继续修改。
