# French Close Reading · Milestone 0

书籍目录、阅读位置和段落接续写在本机 localStorage，键名见下文「浏览器调试入口」。2026-10-08 的接线说明，以及其后的复测、审计和交接，已归档到 [docs/archive](../../docs/archive/README.md)。没进仓库的本机笔记在 `<本机工作区>/archive/french-close-reading/`。

A DSH Host/Client plugin for reading French passages. The first vertical slice is deliberately small: create a passage, retrieve it through a generated Typert Remote API, and export the saved originals. Source text is immutable after creation; later stages will add paragraph/sentence segmentation, translations, grammar analysis, branches, and knowledge records without merging sibling discussion branches.

## Verified runtime contracts

Checked against the installed DSH `0.2.0-rc.2` artifacts (not only the docs):

| Surface | Verified fact |
|---|---|
| `client-modules` | Scans enabled Loader entries; a bundle resolves `require` against the frozen baseline table plus declared externals. Error text for a miss: `missed the module table`. |
| Module graph | A row declaring its own package in `dsh.client.external` is rejected (`a row must not declare its own package in dsh.client.external`). |
| Codecs | The client only checks `codec.mode === 'strict'`; `codec.create` and `result.decode` are optional and never called on the request path. |
| `ctx.remote.$mount(contribution)` | Takes the contribution only, returns the disposer; the plugin owns calling it on unload. |
| `main` slot | Declared `kind: 'keyed'`, so registration carries `key`. |
| `sidebar.panellist` slot | Declared `kind: 'list'`; entries contribute `id` (required), `order` (default `0`), `label`. |
| `ctx.layout.selectPanel(null)` | Allowed; a non-null id must name a registered main panel. |
| `ctx.locale` | Provides `register(ns, dictionaries)` and `bind(ns)`. |
| Host `TypertRemoteService` | `constructor(ctx, serviceKey, options?)`; registers the Cordis service and the Gateway binding. |
| Storage domain | `defineDomain`/`domainTable`/`DomainFacility.open`; tables expose `get`/`entries()`/`keys()`/`size`/`put`/`delete`; `DomainError.code` is the discriminant and `detail` carries `invalid-record` location; writes are durable-before-memory and emit `domain/changed`. |

Desktop crash recovery (`disableAllPlugins`) renames the profile patch to `cordis.patch.yml.bak-<epoch-ms>` and resets `dsh.profile.bundles` to the app's own templates. A client-bundle failure therefore also resets unrelated third-party bundle enablement; keep `client.js` boot-safe and the backup handy.

## Runtime contract

- Target runtime: DSH `0.2.0-rc.2`.
- Host state is owned by `ctx.storageDomain` in the `french_reader` per-record domain. No direct filesystem or session-log writes.
- `FrenchReaderController` exposes `listPassages`, `getPassage`, `createPassage`, `exportPassages`, `getSegmentation`, `saveTranslation`, `addBranch`, and `listAnalysis`. Host/Client descriptors are produced by `@deepseek-ai/dsh-typert-generator`; the UI mounts the generated contribution and calls `ctx.remote.frenchReader`.

## Reading model

Records live in the `records` table of the `french_reader` domain, one key per artifact:

| Key | Record | Mutability |
|---|---|---|
| `<passageId>` | `passage` | written once; the source text never changes |
| `<passageId>#segments` | `segments` | derived from the source, written once per `sourceRevision` |
| `<passageId>#analysis` | `analysis` | append-only translations and branches |

- **Anchors.** `passage` names the whole passage (the overall translation), `p2` a paragraph, `p2.s3` a sentence. `segmentSource()` splits the source on blank lines, then sentences on terminal runs (`.!?…`, with closing quotes), on dialogue dashes after a line break, and holds periods back for abbreviations, initials, and decimals. Ids are positional and meaningful only together with `sourceRevision` + `SEGMENTATION_REVISION`; every anchor carries absolute offsets into the original source. `getSegmentation` computes and persists them on first use, then replays the stored copy so stored `anchorId`s keep pointing at the same text, and every write validates its `anchorId` with `isKnownAnchor` first.
- **Translations are versions, not overwrites.** Each `saveTranslation` appends `{ id, anchorId, language, text, createdAt, operationId }`; retrying the same `operationId` is idempotent, and reusing it with different content is a conflict.
- **The discussion is a tree.** `addBranch` appends `{ id, parentId, anchorId, kind, title, body }` with `kind ∈ constituents | grammar | vocabulary | translation | note`. Siblings under one anchor stay independent, so per-sentence grammar and vocabulary notes live in their own branches rather than in one linear transcript. `parentId` must name an existing branch of the same passage, and the kind allowlist is enforced before storage.
- `MAX_BRANCHES = 1000` per passage; each branch add rewrites the analysis record, which is acceptable at that size and keeps the record self-contained.

## Model-facing tool

`apply` also registers one `french_reader` tool, so the agent can fill the model instead of only reading it: `list`, `save`, `read`, `translate`, `branch`, `analysis`. `save`/`read` return the anchors with their exact text; `translate` and `branch` write against an anchor id. The tool calls the same controller the Remote API uses — one storage owner, two entrances.

Deliberate limits, stated in the tool description so the model sees them:

- the tool persists decisions; it never calls a model itself;
- the source is immutable — a wrong source means a new passage, not an edit;
- pass the same `operationId` only to retry the same write;
- an invented `kind` is refused before storage, so the branch kinds stay a closed allowlist;
- uncertain analysis belongs in the branch body as a stated doubt, never as an invented classification.
- The initial passage record carries `sourceRevision: 1`, `segmentationRevision: 1`, and `status: 'source-only'`. It contains no translation or model-generated analysis yet.
- To recover a retry after a lost response or page refresh, the Client stores only a per-tab idempotency token and source fingerprint in `sessionStorage`; it does not store the French text there.
- Current prototype safeguards: 20,000 source characters per passage and 250 passages per profile. The panel pages through all saved entries and exports a full JSON backup.

## Client bundle constraint (do not regress)

`client.js` is loaded raw by the browser module loader and must resolve against the **baseline module table only** (React, Cordis, and the shell's static UI libraries). A client half may **not** require a subpath of its own package: the module table materializes a package's own subpaths only for in-box bundles, so `require('@local/french-close-reading/remote')` misses the table and fails the entire web boot (`web boot: 1 entry did not activate`), which the Desktop app reports as a fatal startup failure.

Consequences, all enforced by `test/client-bundle.test.mjs` and `test/manifest.test.mjs`:

- `dsh.client.external` must stay absent; a self-request is rejected by the module graph.
- The four strict Remote descriptors are inlined in `client.js`. The client only checks `codec.mode === 'strict'` and never calls a codec's `create`, so the inlined descriptors carry no zod schemas and the generated `lib/typert.remote-client.js` stays unused by the browser half.
- Bootstrap registration during `apply` was dropped: a failing client entry is fatal to the whole web boot.

## Build

From this workspace root, run `pnpm install --ignore-scripts`, `pnpm build`, then `pnpm --filter @local/french-close-reading test`. The build typechecks the Host face and emits strict Host/Client Remote descriptors. The sibling `packages/typert-protocol` package is a build-only type-identity bridge for the standalone generator; it is excluded from the pnpm workspace and plugin bundle, so the linked plugin resolves the real `0.2.0-rc.2` protocol peer. It must not be installed into a DSH profile.

## 浏览器调试入口

桌面宿主会把未知路径交给 DSH 自己的页面，所以调试页不挂在 `127.0.0.1:19387` 上。`debug/server.mjs` 在本机另开一页，铺满同一份 `client.js`，只把 `frenchReader` 调用转到已经开着的桌面宿主。它不启动第二个 DSH，也不使用 `dsh web` 那个没有本插件的 web profile。

先让 DeepSeek Harness 桌面版保持运行。在本包目录执行：

```bash
npm run debug
```

等价命令是 `node debug/server.mjs`。默认地址是 `http://127.0.0.1:19487/`，可以用 `FCR_DEBUG_PORT` 换端口；端口被占用时换一个即可。这个地址可以收藏，没有每次启动都变的口令。刷新页面就会重新载入当前的 `client.js`，不必先构建。React 18.3.1 的 UMD 在 `debug/vendor/`，调试页不用 StrictMode。

启动前会用桌面宿主已有的浏览器会话试一次 `listPassages`。宿主没开、会话读不到或被拒绝时，进程直接退出，不会监听。会话只从 `~/.dsh/.credentials.yaml` 的 `client-connection/browser-session` 读出并留在进程内存里（可用 `DSH_HOME` 指向别的主目录），不会写到文件，也不会打印出来。

和在桌面里打开面板相比：

- 只代理 `POST /api/frenchReader/<method>`。其它路径和命名空间返回 404。请求体必须是宿主那份 `client-request`。代理不转发浏览器的 `Origin` 和 `Cookie`。
- 书架分组、上次阅读位置、段落接续和模型选择写在这个调试源自己的 `localStorage` 里，键分别是 `french-close-reading/bookshelf-v1`、`french-close-reading/last-position-v1`、`french-close-reading/continuations`、`french-close-reading/model`。端口算进源，所以调试页第一次打开是空书架。段落、解析和讨论仍是桌面宿主上的同一份，未归类下列出宿主里的段落。
- `streamAsk` 在调试页里改成调用一次普通 `ask`，只交出一个完成帧，增量文字不会逐段出现。其它流式方法会报「调试入口还不能流转」。
- 底部开关「Mac 顶栏遮挡」设置 `globalThis.__FCR_DEBUG_DESKTOP__`，用来排练桌面窗口的上 52px、左 84px 留白。状态记在 `french-close-reading/debug-desktop-chrome`。正式宿主不会设置这个标志。桌面里要看到同一份 `client.js`，重新打开插件面板即可。
- 只监听 `127.0.0.1`。本机其它进程仍能经这个代理调用法语精读接口。

`node --test test/debug-entry.test.mjs` 覆盖会话读取、cookie 往返、路径限制和一次转发。

## Verification plan

1. Install the built local bundle through DSH's Plugin Manager.
2. Confirm the French Close Reading panel appears and can call the mounted Remote namespace.
3. Save a passage, reload the DSH page, and confirm it remains available; use Export to keep a JSON backup.
4. Disable/remove the bundle and confirm its panel, namespace, and open storage domain are released cleanly.

The sections above describe the first slice and the host constraints that still apply. Reading, discussion, lexicon, audio, and the browser debug entry now live in this package. Dated handoffs and QA rounds are in [docs/archive](../../docs/archive/README.md), not here.

## 查词流程更新（2026-10-11）

查词优先显示已保存的本地词条。未命中时从维基词典获取法语词形的简短释义，词形说明直接转换为中文，其余释义由翻译工具转换为中文，并保留原始词条链接。词典与翻译请求合计最多等待 6.5 秒，成功结果在宿主内缓存六小时，缓存最多 128 项；未找到或请求失败会明确显示，不调用模型补造词典内容。

点击进一步查询，当前所选模型直接结合阅读句子生成中文解释，无需再次点击发送。材料仍在宿主编译，并使用指纹检查原文版本。查询支持取消，回答保存在词汇讨论中；点击整理为词条并明确保存后才进入本地词库。

连续段落解析默认启动，并发上限为 2。进度按钮可以暂停、继续或重试；当前原文保持展开，随正文正常滚动，结构片段沿用原句的语法配色。解析保存仅要求译文非空、原文引用可定位、结构引用有效及原文版本一致；成分覆盖不完整只提示，不阻止保存。模型索引错误时，唯一原文引用可纠正索引；含歧义或外来内容的引用仍拒绝。

## 正式解析输出预算与思考模式（2026-10-12）

逐句解析与段落队列显式请求大预算：DeepSeek-V4.1-Flash和MiMo-v2.6-flash为131072，GPT-6 Luna为128000，Gemma 4 31B为32768。预算包括适配器计入的思考token，是输出上限，不是每次必须消耗的数量。讨论功能继续使用宿主原有配置。

模型设置里可选择适配器声明支持的思考等级，选择按模型保存在`french-close-reading/analysis-efforts`。已评估模型的推荐设置在其支持high时使用high；未知模型沿用宿主默认值。推荐high与显式high复用同一份完整解析，原文、材料、模型或其他思考模式变化仍会重新分析。

解析接收器按词段编号和准确原文引用定位，允许明确的排版差异，歧义或缺失的结构保留为部分解析并标明待处理内容。定位校验不等于语法正确。成功任务记录实际输出上限和思考等级，便于检查正式调用配置。

构建与618项测试通过，DeepSeek在真实桌面入口完成两次131072/high解析；重启、思考偏好保存和缓存复用均已核验。其他模型此次没有全量真实API复测。详见[预算与互动优化验证](../../docs/verification/plugin-output-budget-2026-10-12.md)和[解析接收器重设计](../../docs/verification/analysis-reception-redesign-2026-10-12.md)。
