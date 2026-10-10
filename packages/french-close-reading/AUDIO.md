# 音频接入规格（v1）

目标：法语精读面板里的**朗读/发音**，按工作区根目录两份预留契约实现：

- `../../french-sentence-audio-contract.d.ts`（句子朗读）
- `../../french-inflection-audio-contract.d.ts`（变位形式朗读）

## 0. 不可协商的边界（来自契约，逐条落实）

1. **一次请求 = 一个不可变来源**：句子音频只允许一句（`SentenceSpeechSource.text`）；变位音频只允许一个形式（`InflectionSpeechSource.utterance`，真实法语，不能是 IPA/斜杠并列）。
   段落标题、段落正文、讨论、译文**绝不能**成为合成输入。
2. **版本追加**：每次"重新生成"都是新 take（`versionPolicy: 'append'`），**永不覆盖**旧 take。
3. **缓存优先**：已有 take 直接播放，**不得触发合成**；`regenerate` 是独立动作。
4. **来源变更使旧 take 失效**：`sourceRevision` / `sentenceRevision` 变化即 stale；改书名/章节名**不**影响。
5. **路由按 id**：结果按 `sentenceId + revision + requestId` 归属，不看当前 UI 选中项。
6. **导航/缩放/重开不得触发生成**；未配置时控件**不得**显示 queued/generating/ready，也不得产出音频。
7. 生成中或失败时，**保留上一个可播放 take**；迟到的成功 take 追加但**不抢占**更新的活动请求。
8. 同一 `requestId` 重试**不得**重复排队或产生重复 take（幂等）。

## 1. 后端与协议（已用真实 key 验证）

- 默认后端：`{ kind: 'live', providerId: 'google', modelId: 'gemini-3.8-live' }`
  - 只支持 `bidiGenerateContent`。WS：
    `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=<KEY>`
  - 帧序：`setup{model, generationConfig{responseModalities:['AUDIO'], speechConfig{voiceConfig{prebuiltVoiceConfig{voiceName}}}}, systemInstruction}` → `setupComplete` → `clientContent{turns:[{role:'user',parts:[{text: <句子>}]}], turnComplete:true}` → 多个 `serverContent.modelTurn.parts[].inlineData.data`（base64 PCM）→ `turnComplete`。
  - 忽略 `sessionResumptionUpdate` 等无关帧。
  - 取消 = 关闭 WS；`capabilities: { streaming: true, cancellation: true }`。
- 备选后端：`{ kind: 'tts', providerId: 'google', modelId: 'gemini-2.5-flash-preview-tts' }`
  - `POST /v1beta/models/<model>:generateContent`，`generationConfig{responseModalities:['AUDIO'], speechConfig{...}}`。
  - 返回 `inlineData.mimeType ∈ { audio/wav | audio/L16;codec=pcm;rate=24000 }`。
  - `capabilities: { streaming: false, cancellation: true }`（AbortController 中断 fetch）。
  - 注意：`gemini-3.8-flash-tts` 会把"朗读指令"也读出来；若要切换该模型，提示词必须只含句子本身（不要写"Lis cette phrase…"）。
- 输出统一转成 **WAV**（裸 PCM 前面补 44 字节头）后落盘/返回，客户端可直接播放。
- 密钥来源：`config.audio.apiKey` → 回退 `process.env.GEMINI_API_KEY`。**任何情况下不得写进源码、测试或 git。**

## 2. 宿主侧改动

- `src/audio.ts`
  - `SentenceAudioConfig`（zod）：`{ enabled, backend: 'live'|'tts', apiKey?, liveModel, ttsModel, voice, rate, timeoutMs, maxCharacters }`。
  - `synthesizeSpeech(target, config, signal): Promise<{ mimeType, bytes: Uint8Array, durationMs, modelId }>`，两个适配器 + PCM→WAV + 超时 + 取消 + 错误分类（`unconfigured | unauthorized | rate-limited | timeout | cancelled | provider-error`）。
  - 输入校验：空、多句（句末标点后还有实词）、超 `maxCharacters`（默认 400）→ 直接拒绝，不发请求。
- `src/audio-store.ts`（KV，记录 kind `sentenceAudioTake` / `inflectionAudioTake`）
  - `appendTake`（幂等：同 takeId/requestId 重放不重复写）、`listTakes(sourceKey)`、`selectTake`（只能选 revision 匹配的已完成 take）、`readAsset`。
  - 音频字节存记录内（base64），并记 `mimeType/durationMs/bytes`；来源指纹 = `passageId|sentenceId|sourceRevision|sentenceRevision`（变位：`formId|inflectionRevision`）。
- `src/controller.ts` 新增 Remote（direct）：
  - `synthesizeSentenceAudio` / `synthesizeInflectionAudio`（请求含 requestId，操作幂等）
  - `listSentenceAudio` / `selectSentenceAudio` / `readSentenceAudioAsset`
  - 变位同理（`listInflectionAudio` / `selectInflectionAudio` / `readInflectionAudioAsset`）
- 类型放 `src/generation-types.ts`，并从 `src/types.ts` 公开再导出（typert 要求）。
- 测试 `test/sentence-audio.test.mjs`（**全部离线，注入假的 fetch/WebSocket**）：一句校验、revision 失效、append 版本、缓存不合成、取消、同 requestId 幂等、未配置不发请求。
- 完成后：`pnpm build`（tsc）+ `node scripts/generate-typert.mjs`，`npm test` 必须全绿。

## 3. 客户端改动

- 内联契约新增上述端点（严格 codec），`face` 同步补条目（有 face 覆盖不变式测试守着）。
- 阅读工具栏新增 `发音`：未配置 → 禁用并明确写"未配置"；有缓存 take → 直接播；无 → 请求合成，期间显示生成中并有 `取消`；失败显示原因且保留旧 take；`重新生成` 单独入口。
- 播放：把返回的 base64 WAV 转 Blob URL → `<audio>`/Web Audio 播放；`rate` 用 `playbackRate`。
- 变位表每一行加行内发音（走变位端点）。
- zh/en 文案；`test/client-*.test.mjs` 覆盖：未配置不声称 ready、缓存播放不调合成端点、regenerate 走独立调用。
