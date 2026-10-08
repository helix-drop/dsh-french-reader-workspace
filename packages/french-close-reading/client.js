/* @local/french-close-reading — Client panel + generated Remote contribution. */
window.__ModuleLoader__.load({
  id: '@local/french-close-reading',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React
    // Canvas rows are measured before paint; a preview shim without the layout
    // effect still works through the passive one.
    const useMeasuredEffect = React.useLayoutEffect ?? React.useEffect
    const NS = 'french-close-reading'
    // The generated Remote contract is inlined instead of imported: a browser
    // half may require only baseline modules, and the shell's static table
    // (react, react/jsx-runtime, react-dom, react-dom/client, cordis,
    // client-store, ui-slots, ui-primitives, ui-dockkit) has no zod. The client
    // registry still requires every strict codec to expose a create() factory
    // (typert-registry client: validateCodec), so these descriptors carry small
    // dependency-free wire validators with the zod surface the protocol uses.
    const S = {
      str: (value) => typeof value === 'string',
      num: (value) => typeof value === 'number' && Number.isFinite(value),
      bool: (value) => typeof value === 'boolean',
      nil: (value) => value === null,
      lit: (expected) => (value) => value === expected,
      arr: (item) => (value) => Array.isArray(value) && value.every(item),
      obj: (shape) => (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.entries(shape).every(([key, check]) => check(value[key])),
      oneOf: (...options) => (value) => options.some((check) => check(value)),
      opt: (check) => (value) => value === undefined || check(value),
      // A field the Host declares nullable. The gateway calls this validator for
      // real (`decode` → `codec.create().parse`), so a null the panel sends — or
      // a null the Host returns — must pass here or the call never leaves the
      // browser. `undefined` stays accepted because a missing key is not a null.
      nilable: (check) => (value) => value === undefined || value === null || check(value),
      // A library record is opaque to the panel: every record kind (passage,
      // analysis, lexicon, runs…) travels through this one descriptor.
      any: () => true,
    }

    function schemaOf(check, subject) {
      const safeParse = (value) => check(value)
        ? { success: true, data: value }
        : { success: false, error: new Error(`invalid ${subject}`) }
      return {
        safeParse,
        parse(value) {
          const result = safeParse(value)
          if (!result.success) throw result.error
          return result.data
        },
      }
    }

    /** A strict codec: the registry rejects any other mode for parameter codecs. */
    function strict(typeSymbol, check) {
      return { mode: 'strict', typeSymbol, create: () => schemaOf(check, typeSymbol) }
    }

    /**
     * One turn's result, shared by the unary call and the terminal stream frame: the
     * same turn must decode the same way whether it arrived in one piece or many.
     */
    const askResultShape = S.oneOf(
      S.obj({
        ok: S.lit(true), contextId: S.str, fingerprint: S.str, characters: S.num,
        finish: S.oneOf(S.lit('stop'), S.lit('max-tokens'), S.lit('cancelled'), S.lit('error')),
        failure: S.nilable(S.str), answerText: S.str, resolvedModel: S.nilable(S.str),
        branchId: S.str, messageId: S.nilable(S.str),
        usage: S.nilable(S.obj({ inputTokens: S.nilable(S.num), outputTokens: S.nilable(S.num) })),
      }),
      S.obj({
        ok: S.lit(false), reason: S.str,
        failure: S.nilable(S.str), contextId: S.nilable(S.str),
      }),
    )

    /**
     * One vocabulary entry as the panel reads it (`LexiconView`), shared by the list and
     * lookup calls so the two cannot drift apart. The nested collections are validated
     * as non-strict objects: the panel reads a subset, and the strict shape belongs to
     * the Host's own schema.
     */
    const lexiconViewShape = S.obj({
      entryId: S.str, mot: S.str, lemma: S.nilable(S.str), partOfSpeech: S.str,
      forms: S.arr(S.str),
      provenance: S.oneOf(S.lit('ai'), S.lit('user'), S.lit('mixed')),
      status: S.oneOf(S.lit('draft'), S.lit('reviewed')),
      revision: S.num, updatedAt: S.str,
      senses: S.arr(S.obj({ label: S.str, definition: S.str })),
      sections: S.obj({}),
      sources: S.arr(S.obj({})),
      occurrences: S.arr(S.obj({})),
    })

    const passageShape = S.obj({
      id: S.str, title: S.str, sourceText: S.str, sourceRevision: S.num, segmentationRevision: S.num,
      status: S.lit('source-only'), createdAt: S.str, updatedAt: S.str,
      archivedAt: S.oneOf(S.str, S.nil), archiveOperationId: S.oneOf(S.str, S.nil),
    })
    const summaryShape = S.obj({
      id: S.str, title: S.str, excerpt: S.str, characterCount: S.num,
      sourceRevision: S.num, createdAt: S.str, updatedAt: S.str,
    })
    const sentenceShape = S.obj({ id: S.str, paragraphId: S.str, text: S.str, start: S.num, end: S.num })
    const paragraphShape = S.obj({
      id: S.str, text: S.str, start: S.num, end: S.num, sentences: S.arr(sentenceShape),
    })
    const segmentationShape = S.obj({
      passageId: S.str, sourceRevision: S.num, revision: S.num, paragraphs: S.arr(paragraphShape),
    })
    const anchorStatusShape = S.oneOf(S.lit('resolved'), S.lit('relocated'), S.lit('unresolved'))
    const anchorRefShape = S.obj({
      anchorId: S.str, sourceRevision: S.num, segmentationRevision: S.num,
      start: S.num, end: S.num, excerpt: S.str,
    })
    const translationShape = S.obj({
      id: S.str, anchorId: S.str, anchor: S.oneOf(anchorRefShape, S.nil),
      source: S.oneOf(S.lit('ai'), S.lit('user')), note: S.str,
      language: S.str, text: S.str, createdAt: S.str, operationId: S.str,
      anchorStatus: anchorStatusShape, currentAnchorId: S.oneOf(S.str, S.nil), anchorReason: S.str,
    })
    const branchShape = S.obj({
      id: S.str, parentId: S.oneOf(S.str, S.nil), anchorId: S.str,
      anchor: S.oneOf(anchorRefShape, S.nil),
      kind: S.oneOf(S.lit('constituents'), S.lit('grammar'), S.lit('vocabulary'), S.lit('translation'), S.lit('note')),
      title: S.str, body: S.str, createdAt: S.str, operationId: S.str,
      anchorStatus: anchorStatusShape, currentAnchorId: S.oneOf(S.str, S.nil), anchorReason: S.str,
    })
    const backendShape = S.obj({
      backend: S.str, label: S.str, available: S.bool, reason: S.nilable(S.str),
      streaming: S.bool, cancel: S.bool, singleFlight: S.bool, maxInputCharacters: S.nilable(S.num),
    })
    const modelShape = S.obj({
      id: S.str, name: S.str, reasoningEfforts: S.arr(S.str),
    })
    const materialShape = S.obj({
      kind: S.str, refId: S.str, reason: S.str, characters: S.num, excerpt: S.str,
    })
    const messageShape = S.obj({
      messageId: S.str, author: S.oneOf(S.lit('user'), S.lit('model')), text: S.str,
      status: S.nilable(S.oneOf(S.lit('draft'), S.lit('complete'), S.lit('partial'), S.lit('failed'), S.lit('cancelled'))),
      extraction: S.nilable(S.obj({
        status: S.oneOf(S.lit('extracted'), S.lit('none'), S.lit('invalid'), S.lit('failed')),
        points: S.num, detail: S.nilable(S.str),
      })),
      backend: S.nilable(S.str), model: S.nilable(S.str), resolvedModel: S.nilable(S.str),
      failure: S.nilable(S.str), contextId: S.nilable(S.str), createdAt: S.str,
    })
    const branchViewShape = S.obj({
      branchId: S.str, anchorId: S.str,
      kind: S.oneOf(S.lit('constituents'), S.lit('grammar'), S.lit('vocabulary'), S.lit('translation'), S.lit('note'), S.lit('discussion')),
      title: S.str, parentId: S.nilable(S.str),
      forkedFrom: S.nilable(S.obj({ branchId: S.str, messageId: S.str })),
      status: S.oneOf(S.lit('open'), S.lit('understood'), S.lit('unresolved'), S.lit('disputed'), S.lit('archived')),
      createdAt: S.str, updatedAt: S.str, messages: S.arr(messageShape), historyCount: S.num,
    })
    const conclusionShape = S.obj({
      conclusionId: S.str, branchId: S.str, anchorId: S.str, text: S.str,
      status: S.oneOf(S.lit('proposed'), S.lit('confirmed'), S.lit('superseded')),
      messageId: S.nilable(S.str),
    })
    const extraShape = S.obj({ refId: S.str, reason: S.str, text: S.str })
    const analysisShape = S.obj({
      passageId: S.str, translations: S.arr(translationShape), branches: S.arr(branchShape),
    })

    /**
     * Count characters of the *original* paragraph before a DOM position.
     *
     * The count walks the paragraph's own text nodes, so the chrome the reader
     * renders around the text (paragraph chip, badges, sentence labels) can never
     * leak into the offset. Measuring the whole section instead used to add that
     * chrome, which put every stored selection ahead of the text it named.
     * @returns The offset, or null when the position is outside the paragraph.
     */
    function paragraphOffsetBefore(paraText, node, offset) {
      let total = 0
      // 4 is the DOM's SHOW_TEXT filter. The literal keeps the measured path free
      // of the `NodeFilter` global, which the module may not have been given.
      const walker = document.createTreeWalker(paraText, 4)
      for (let current = walker.nextNode(); current !== null; current = walker.nextNode()) {
        if (current === node) return total + offset
        total += current.textContent.length
      }
      return null
    }

    /** The span a DOM range names inside one paragraph, or null if it does not. */
    function selectionSpanFor(paraText, paragraph, startContainer, startOffset, endContainer, endOffset) {
      if (!paraText.contains(startContainer) || !paraText.contains(endContainer)) return null
      const start = paragraphOffsetBefore(paraText, startContainer, startOffset)
      const end = paragraphOffsetBefore(paraText, endContainer, endOffset)
      if (start === null || end === null || end <= start) return null
      // A server round trip is the real validation; this only keeps an
      // impossible selection from being offered at all.
      if (paragraph.start + end > paragraph.end) return null
      const excerpt = paragraph.text.slice(start, end)
      if (excerpt.trim() === '') return null
      return { start, end, excerpt }
    }

    /**
     * The pure part of reading a selection, exposed for tests: it takes the
     * paragraph element and a plain position pair, so the offset rule can be
     * checked without a browser.
     */
    function measureSelection(paraText, paragraph, startContainer, startOffset, endContainer, endOffset) {
      return selectionSpanFor(paraText, paragraph, startContainer, startOffset, endContainer, endOffset)
    }

    /**
     * Which theme token a constituent role is drawn with.
     *
     * Colour is a *rendering* of the structure, decided here and nowhere else:
     * the stored analysis holds roles and ranges, never a colour. The mapping is
     * by role text so an analysis authored in Chinese or French lands on the same
     * token, and an unknown role gets the neutral token rather than a guess.
     */
    const ROLE_TOKENS = [
      [/^(主语|sujet)/iu, 'var(--fr-role-subject)'],
      [/^(谓语|verbe|predicate)/iu, 'var(--fr-role-verb)'],
      [/^(直接宾语|间接宾语|宾语|objet|cod|coi)/iu, 'var(--fr-role-object)'],
      [/^(表语|宾补|attribut|compl)/iu, 'var(--fr-role-attribute)'],
      [/^(状语|circ|adverbial)/iu, 'var(--fr-role-adverbial)'],
      [/^(不定式|infinitif)/iu, 'var(--fr-role-infinitive)'],
      [/^(修饰|épithète|epithete|modif)/iu, 'var(--fr-role-modifier)'],
    ]

    function tokenForRole(role) {
      for (const [pattern, token] of ROLE_TOKENS) if (pattern.test(role)) return token
      return 'var(--fr-role-other)'
    }

    /**
     * The sentence text as nested spans, one per constituent, longest-first so an
     * inner part sits inside the clause that contains it.
     *
     * Nothing here changes the text: the concat of the pieces is exactly the
     * sentence, which `test/analysis-rendering.test.mjs` asserts, because colour
     * that drops a word would be worse than no colour.
     */
    function renderConstituents(text, constituents) {
      if (!Array.isArray(constituents) || constituents.length === 0) return [{ text, role: null }]
      const spans = constituents
        .filter((item) => Number.isInteger(item.start) && Number.isInteger(item.end))
        .filter((item) => item.end > item.start && item.end <= text.length)
        .sort((left, right) => left.start - right.start || right.end - left.end)
      const pieces = []
      let cursor = 0
      for (const span of spans) {
        if (span.start < cursor) continue
        if (span.start > cursor) pieces.push({ text: text.slice(cursor, span.start), role: null })
        pieces.push({ text: text.slice(span.start, span.end), role: span.role, partOfSpeech: span.partOfSpeech ?? null })
        cursor = span.end
      }
      if (cursor < text.length) pieces.push({ text: text.slice(cursor), role: null })
      return pieces
    }

    const internals = { measureSelection, paragraphOffsetBefore, tokenForRole, renderConstituents }

    const TYPES = '@local/french-close-reading/types#'
    const remoteContribution = {
      package: '@local/french-close-reading',
      descriptors: [
        {
          id: '@local/french-close-reading#frenchReader/listPassages',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'listPassages',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ListPassagesRequest`, S.obj({ offset: S.num, limit: S.num })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ListPassagesValue`, S.obj({
            items: S.arr(summaryShape), offset: S.num, total: S.num, hasMore: S.bool,
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/getPassage',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'getPassage',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}GetPassageRequest`, S.obj({ id: S.str })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}GetPassageValue`, S.obj({ passage: S.oneOf(passageShape, S.nil) })),
        },
        {
          id: '@local/french-close-reading#frenchReader/createPassage',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'createPassage',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}CreatePassageRequest`, S.obj({
              id: S.str, operationId: S.str, title: S.str, sourceText: S.str,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}CreatePassageValue`, S.oneOf(
            S.obj({ kind: S.lit('created'), passage: passageShape }),
            S.obj({ kind: S.lit('already-saved'), passage: passageShape }),
            S.obj({
              kind: S.lit('conflict'),
              reason: S.oneOf(S.lit('id-used'), S.lit('operation-used'), S.lit('limit-reached')),
              maxPassages: S.num,
            }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/exportPassages',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'exportPassages',
          invocation: { kind: 'direct' },
          parameters: [],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ExportPassagesValue`, S.obj({
            schemaVersion: S.lit(1), exportedAt: S.str, passages: S.arr(passageShape),
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/listBackends',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'listBackends',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ListBackendsRequest`, S.obj({ scope: S.lit('all') })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ListBackendsValue`, S.obj({ backends: S.arr(backendShape) })),
        },
        {
          id: '@local/french-close-reading#frenchReader/listBackendModels',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'listBackendModels',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ListBackendModelsRequest`, S.obj({ backend: S.str })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ListBackendModelsValue`, S.obj({
            models: S.arr(modelShape), reason: S.nilable(S.str),
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/previewAsk',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'previewAsk',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}PreviewAskRequest`, S.obj({
              passageId: S.str, branchId: S.str, question: S.str,
              backend: S.str, model: S.str, extras: S.arr(extraShape),
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}PreviewAskValue`, S.oneOf(
            S.obj({
              ok: S.lit(true), contextId: S.str, fingerprint: S.str, characters: S.num,
              backend: S.str, model: S.str, materials: S.arr(materialShape), prompt: S.str,
            }),
            S.obj({ ok: S.lit(false), reason: S.str }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/ask',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'ask',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}AskRequest`, S.obj({
              passageId: S.str, branchId: S.str, question: S.str, backend: S.str, model: S.str,
              reasoningEffort: S.nilable(S.str), extras: S.arr(extraShape), operationId: S.str,
              expectedFingerprint: S.nilable(S.str),
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}AskResult`, askResultShape),
        },
        {
          /**
           * The same turn, streamed. Frames arrive while the answer is written and one
           * terminal `done` frame always follows, so the panel can tell "still coming"
           * from "failed" — the unary call remains the fallback.
           */
          id: '@local/french-close-reading#frenchReader/streamAsk',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'streamAsk',
          mode: 'stream',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}AskRequest`, S.obj({
              passageId: S.str, branchId: S.str, question: S.str, backend: S.str, model: S.str,
              reasoningEffort: S.opt(S.nilable(S.str)),
              extras: S.arr(S.obj({ refId: S.str, reason: S.str, text: S.str })),
              operationId: S.str,
              expectedFingerprint: S.opt(S.nilable(S.str)),
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}AskFrame`, S.oneOf(
            S.obj({ kind: S.lit('delta'), text: S.str }),
            S.obj({ kind: S.lit('done'), result: askResultShape }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/listDiscussion',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'listDiscussion',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ListDiscussionRequest`, S.obj({ passageId: S.str })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}DiscussionView`, S.obj({
            branches: S.arr(branchViewShape), conclusions: S.arr(conclusionShape),
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/createBranch',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'createBranch',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}CreateBranchRequest`, S.obj({
              passageId: S.str, anchorId: S.str,
              kind: S.oneOf(S.lit('constituents'), S.lit('grammar'), S.lit('vocabulary'), S.lit('translation'), S.lit('note'), S.lit('discussion')),
              title: S.str, parentId: S.nilable(S.str),
              forkedFrom: S.nilable(S.obj({ branchId: S.str, messageId: S.str })),
              operationId: S.str,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}CreateBranchValue`, S.oneOf(
            S.obj({ kind: S.lit('created'), branchId: S.str }),
            S.obj({ kind: S.lit('already-created'), branchId: S.str }),
            S.obj({
              kind: S.lit('conflict'),
              reason: S.oneOf(
                S.lit('passage-unknown'), S.lit('anchor-unknown'), S.lit('parent-unknown'),
                S.lit('fork-source-unknown'), S.lit('fork-message-unknown'), S.lit('operation-used'),
              ),
            }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/setBranchState',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'setBranchState',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}SetBranchStateRequest`, S.obj({
              passageId: S.str, branchId: S.str,
              status: S.nilable(S.oneOf(S.lit('open'), S.lit('understood'), S.lit('unresolved'), S.lit('disputed'), S.lit('archived'))),
              title: S.nilable(S.str),
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}SetBranchStateValue`, S.oneOf(
            S.obj({ kind: S.lit('updated'), branchId: S.str }),
            S.obj({ kind: S.lit('conflict'), reason: S.lit('branch-unknown') }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/recordConclusion',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'recordConclusion',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}RecordConclusionRequest`, S.obj({
              passageId: S.str, branchId: S.str, anchorId: S.str, messageId: S.nilable(S.str),
              text: S.str, status: S.oneOf(S.lit('proposed'), S.lit('confirmed')), operationId: S.str,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}RecordConclusionValue`, S.oneOf(
            S.obj({ kind: S.lit('recorded'), conclusionId: S.str }),
            S.obj({ kind: S.lit('already-recorded'), conclusionId: S.str }),
            S.obj({
              kind: S.lit('conflict'),
              reason: S.oneOf(S.lit('branch-unknown'), S.lit('passage-unknown')),
            }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/readAnalysisCoverage',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'readAnalysisCoverage',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ReadAnalysisCoverageRequest`, S.obj({ passageId: S.str })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}AnalysisCoverageValue`, S.obj({
            found: S.bool, sourceRevision: S.opt(S.num), total: S.opt(S.num),
            covered: S.opt(S.arr(S.str)), missing: S.opt(S.arr(S.str)),
            failed: S.opt(S.arr(S.str)), stale: S.opt(S.arr(S.str)),
            perSentence: S.opt(S.arr(S.obj({ anchorId: S.str, errors: S.arr(S.str), hints: S.arr(S.str) }))),
            currentVersion: S.nilable(S.obj({
              versionId: S.str, revision: S.num, sourceRevision: S.num,
              coveredCount: S.num, overallTranslation: S.nilable(S.str), createdAt: S.str,
            })),
            versionCount: S.opt(S.num),
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/readSentenceAnalysis',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'readSentenceAnalysis',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ReadSentenceAnalysisRequest`, S.obj({ passageId: S.str, anchorId: S.str })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ReadSentenceAnalysisValue`, S.oneOf(
            S.obj({
              kind: S.lit('found'),
              analysis: S.obj({
                anchorId: S.str, text: S.str, translation: S.str, backbone: S.str,
                clauses: S.arr(S.obj({
                  id: S.str, role: S.str, start: S.num, end: S.num, text: S.str, parentId: S.nilable(S.str),
                })),
                constituents: S.arr(S.obj({
                  id: S.str, role: S.str, start: S.num, end: S.num, text: S.str,
                  clauseId: S.nilable(S.str), partOfSpeech: S.nilable(S.str),
                })),
                morphology: S.arr(S.obj({
                  id: S.str, form: S.str, lemma: S.nilable(S.str), partOfSpeech: S.nilable(S.str),
                  tense: S.nilable(S.str), mood: S.nilable(S.str), person: S.nilable(S.str),
                  gender: S.nilable(S.str), number: S.nilable(S.str), agreesWith: S.nilable(S.str), note: S.str,
                })),
                explanations: S.arr(S.obj({
                  id: S.str,
                  kind: S.oneOf(S.lit('syntax'), S.lit('context'), S.lit('rhetoric'), S.lit('unverified')),
                  text: S.str, start: S.nilable(S.num), end: S.nilable(S.num),
                })),
                provenance: S.oneOf(S.lit('ai'), S.lit('user'), S.lit('mixed')),
                status: S.oneOf(S.lit('draft'), S.lit('reviewed')),
                revision: S.num,
              }),
              errors: S.arr(S.str), hints: S.arr(S.str),
            }),
            S.obj({ kind: S.lit('missing') }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/analyseSentence',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'analyseSentence',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}AnalyseSentenceRequest`, S.obj({
              passageId: S.str, anchorId: S.str, backend: S.str, model: S.str,
              reasoningEffort: S.nilable(S.str), operationId: S.str,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}AnalyseSentenceResult`, S.oneOf(
            S.obj({
              ok: S.lit(true), anchorId: S.str, backend: S.str, model: S.str,
              resolvedModel: S.nilable(S.str), replaced: S.bool, hints: S.arr(S.str),
              covered: S.num, missing: S.num, failed: S.num, stale: S.num, operationId: S.str,
            }),
            S.obj({
              ok: S.lit(false), reason: S.str,
              failure: S.nilable(S.str), hints: S.opt(S.arr(S.str)),
            }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/analyseParagraph',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'analyseParagraph',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}AnalyseParagraphRequest`, S.obj({
              passageId: S.str, paragraphId: S.str, backend: S.str, model: S.str,
              reasoningEffort: S.nilable(S.str), operationId: S.str,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}AnalyseParagraphResult`, S.obj({
            ok: S.bool, reason: S.opt(S.str), asked: S.opt(S.num), stored: S.opt(S.num),
            failed: S.opt(S.arr(S.obj({ anchorId: S.str, reason: S.str }))),
            covered: S.opt(S.num), missing: S.opt(S.num), failedCount: S.opt(S.num),
            stale: S.opt(S.num), note: S.opt(S.str),
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/putSentenceAnalysis',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'putSentenceAnalysis',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}PutSentenceAnalysisRequest`, S.obj({
              passageId: S.str, anchorId: S.str, analysisJson: S.str,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}PutSentenceAnalysisValue`, S.obj({
            stored: S.bool, reason: S.opt(S.str), errors: S.opt(S.arr(S.str)), hints: S.opt(S.arr(S.str)),
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/publishAnalysis',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'publishAnalysis',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}PublishAnalysisRequest`, S.obj({
              passageId: S.str, overallTranslation: S.nilable(S.str), cohesion: S.str,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}PublishAnalysisValue`, S.oneOf(
            S.obj({ kind: S.lit('published'), versionId: S.str, revision: S.num, coveredCount: S.num }),
            S.obj({ kind: S.lit('conflict'), reason: S.str }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/listLexiconSources',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'listLexiconSources',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ListLexiconSourcesRequest`, S.obj({ scope: S.lit('all') })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ListLexiconSourcesValue`, S.obj({
            sources: S.arr(S.obj({ source: S.str, sections: S.arr(S.str) })),
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/fetchLexiconSource',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'fetchLexiconSource',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}FetchLexiconSourceRequest`, S.obj({
              entryId: S.str, source: S.str, section: S.str, mot: S.str,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}FetchLexiconSourceValue`, S.obj({
            fetched: S.bool, reason: S.opt(S.str), ok: S.opt(S.bool),
            outcome: S.opt(S.str), note: S.opt(S.str), stored: S.opt(S.bool),
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/setGrammarMastery',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'setGrammarMastery',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}SetGrammarMasteryRequest`, S.obj({
              entryId: S.str,
              mastery: S.oneOf(S.lit('learning'), S.lit('reviewing'), S.lit('known')),
              expectedRevision: S.nilable(S.num), operationId: S.str,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}SetGrammarMasteryValue`, S.oneOf(
            S.obj({ kind: S.lit('updated'), revision: S.num }),
            S.obj({ kind: S.lit('already-updated'), revision: S.num }),
            S.obj({ kind: S.lit('unchanged'), revision: S.num }),
            S.obj({
              kind: S.lit('conflict'),
              reason: S.oneOf(S.lit('entry-unknown'), S.lit('revision-conflict')),
              revision: S.num,
            }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/readContext',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'readContext',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ReadContextRequest`, S.obj({ passageId: S.str, contextId: S.str })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ReadContextValue`, S.oneOf(
            S.obj({
              kind: S.lit('found'), contextId: S.str, fingerprint: S.str, characters: S.num,
              backend: S.str, model: S.str, materials: S.arr(materialShape), prompt: S.str,
            }),
            S.obj({ kind: S.lit('missing') }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/exportLibrary',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'exportLibrary',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ExportLibraryRequest`, S.obj({ scope: S.lit('all') })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ExportLibraryValue`, S.obj({
            schemaVersion: S.lit(1), exportedAt: S.str,
            records: S.arr(S.obj({ key: S.str, record: S.any })),
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/renderLexicon',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'renderLexicon',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}RenderLexiconRequest`, S.obj({
              entryId: S.str, wantsEtymology: S.bool,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}RenderLexiconValue`, S.oneOf(
            S.obj({
              kind: S.lit('card'), rendered: S.str,
              sections: S.arr(S.obj({ number: S.str, title: S.str, required: S.bool })),
              errors: S.arr(S.str), hints: S.arr(S.str),
            }),
            S.obj({ kind: S.lit('missing') }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/resolveGrammarCandidate',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'resolveGrammarCandidate',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ResolveGrammarRequest`, S.obj({
              pendingId: S.str,
              decision: S.oneOf(S.lit('attach'), S.lit('create'), S.lit('discard')),
              // The panel sends an explicit null for "no entry named" and "no new
              // wording", which is what the Host's schema declares nullable.
              entryId: S.nilable(S.str), keyPoints: S.nilable(S.str), operationId: S.str,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ResolveGrammarValue`, S.oneOf(
            S.obj({ kind: S.lit('attached'), entryId: S.str, outcome: S.str }),
            S.obj({ kind: S.lit('created'), entryId: S.str, outcome: S.str }),
            S.obj({ kind: S.lit('discarded') }),
            // A resolved candidate keeps its trace; the entry it named may be null.
            S.obj({ kind: S.lit('already-resolved'), entryId: S.nilable(S.str), outcome: S.str }),
            S.obj({
              kind: S.lit('conflict'),
              reason: S.oneOf(S.lit('pending-unknown'), S.lit('entry-unknown')),
            }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/listLexicon',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'listLexicon',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ListLexiconRequest`, S.obj({ scope: S.lit('all') })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ListLexiconValue`, S.obj({
            total: S.num,
            entries: S.arr(lexiconViewShape),
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/listGrammar',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'listGrammar',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ListGrammarRequest`, S.obj({ scope: S.lit('all') })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ListGrammarValue`, S.obj({
            entries: S.arr(S.obj({
              entryId: S.str, topic: S.str, level: S.nilable(S.str), module: S.nilable(S.str),
              mastery: S.oneOf(S.lit('learning'), S.lit('reviewing'), S.lit('known')),
              contentStatus: S.oneOf(S.lit('ai-unverified'), S.lit('user'), S.lit('mixed')),
              askCount: S.num, lastAskedAt: S.nilable(S.str),
              examples: S.num, pitfalls: S.num, keyPoints: S.str,
            })),
            pending: S.arr(S.obj({
              pendingId: S.str, topic: S.str, body: S.str,
              candidates: S.arr(S.obj({ entryId: S.str, topic: S.str })),
              resolution: S.nilable(S.oneOf(S.lit('attached'), S.lit('created'), S.lit('discarded'))),
              resolvedEntryId: S.nilable(S.str),
            })),
          })),
        },
        {
          /**
           * Pronunciation data for one verb. The three states travel as three shapes,
           * so the panel cannot render "no data" as an empty paradigm by accident.
           */
          id: '@local/french-close-reading#frenchReader/readConjugation',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'readConjugation',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ConjugationRequest`, S.obj({ lemma: S.str })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ReadConjugationValue`, S.oneOf(
            S.obj({
              state: S.lit('no-data'), lemma: S.str, reason: S.str,
            }),
            S.obj({
              state: S.lit('pending'), lemma: S.str, source: S.str, fetchStatus: S.str,
              reason: S.str, missingForms: S.arr(S.str),
            }),
            S.obj({
              state: S.lit('dataset'), lemma: S.str, source: S.str, fetchStatus: S.str,
              missingForms: S.arr(S.str),
              tenses: S.arr(S.obj({
                mood: S.str, tense: S.str, label: S.str,
                bases: S.arr(S.obj({
                  ipa: S.str, persons: S.arr(S.str), writtenStem: S.nilable(S.str),
                })),
                forms: S.arr(S.obj({
                  person: S.str, written: S.str, ipa: S.str, baseIndex: S.nilable(S.num),
                })),
                missingPersons: S.arr(S.str),
                notes: S.arr(S.str),
              })),
            }),
          )),
        },
        {
          /** The reader's own act: walk the source for one verb's paradigm. */
          id: '@local/french-close-reading#frenchReader/fetchConjugation',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'fetchConjugation',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ConjugationRequest`, S.obj({ lemma: S.str })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}FetchConjugationValue`, S.obj({
            fetched: S.bool, reason: S.opt(S.str), status: S.opt(S.str),
            bases: S.opt(S.num), tenses: S.opt(S.num), missingForms: S.opt(S.num),
            requests: S.opt(S.num), notes: S.opt(S.arr(S.str)), failure: S.opt(S.nilable(S.str)),
          })),
        },
        {
          /**
           * Exact-Mot lookup. A hit is the stored entry; a miss returns candidates that
           * were never merged into the Mot — lookup and collection stay separate.
           */
          id: '@local/french-close-reading#frenchReader/lookupMot',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'lookupMot',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}LookupMotRequest`, S.obj({
              mot: S.str, partOfSpeech: S.nilable(S.str),
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}LexiconLookup`, S.obj({
            mot: S.str, motKey: S.str, found: S.bool,
            entries: S.arr(lexiconViewShape), candidates: S.arr(lexiconViewShape),
          })),
        },
        {
          /** Adopt one variant for one anchor; the overall translation is not rewritten. */
          id: '@local/french-close-reading#frenchReader/adoptTranslation',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'adoptTranslation',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}AdoptTranslationRequest`, S.obj({
              passageId: S.str, anchorId: S.str, translationId: S.str, operationId: S.str,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}AdoptTranslationValue`, S.obj({
            adopted: S.bool, alreadyAdopted: S.opt(S.bool), reason: S.opt(S.str),
            previousId: S.opt(S.nilable(S.str)),
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/createSelection',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'createSelection',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}CreateSelectionRequest`, S.obj({
              passageId: S.str, operationId: S.str, note: S.str,
              ranges: S.arr(S.obj({ start: S.num, end: S.num })),
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}CreateSelectionValue`, S.oneOf(
            S.obj({
              kind: S.lit('created'), anchorId: S.str, excerpt: S.str,
              ranges: S.arr(S.obj({ start: S.num, end: S.num })),
            }),
            S.obj({
              kind: S.lit('already-existed'), anchorId: S.str, excerpt: S.str,
              ranges: S.arr(S.obj({ start: S.num, end: S.num })),
            }),
            S.obj({
              kind: S.lit('conflict'),
              reason: S.oneOf(
                S.lit('passage-unknown'), S.lit('range-out-of-bounds'),
                S.lit('range-not-integer'), S.lit('ranges-out-of-range'),
              ),
            }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/previewImport',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'previewImport',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}PreviewImportRequest`, S.obj({ title: S.str, sourceText: S.str })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ImportPreviewValue`, S.obj({
            title: S.str, characters: S.num, paragraphs: S.num, sentences: S.num,
            blocks: S.arr(S.obj({ id: S.str, sentences: S.num, excerpt: S.str })),
            flags: S.arr(S.obj({
              code: S.str,
              severity: S.oneOf(S.lit('error'), S.lit('hint')),
              detail: S.str,
            })),
            head: S.str, tail: S.str,
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/archivePassage',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'archivePassage',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ArchivePassageRequest`, S.obj({
              passageId: S.str, operationId: S.str, expectedSourceRevision: S.num,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ArchivePassageValue`, S.oneOf(
            S.obj({ kind: S.lit('archived'), passage: passageShape }),
            S.obj({ kind: S.lit('already-archived'), passage: passageShape }),
            S.obj({
              kind: S.lit('conflict'),
              reason: S.oneOf(S.lit('passage-unknown'), S.lit('operation-used'), S.lit('revision-conflict')),
            }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/getSegmentation',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'getSegmentation',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}GetSegmentationRequest`, S.obj({ passageId: S.str })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}GetSegmentationValue`, S.obj({
            segmentation: S.oneOf(segmentationShape, S.nil),
          })),
        },
        {
          id: '@local/french-close-reading#frenchReader/saveTranslation',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'saveTranslation',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}SaveTranslationRequest`, S.obj({
              passageId: S.str, operationId: S.str, anchorId: S.str, language: S.str, text: S.str,
              source: S.opt(S.oneOf(S.lit('ai'), S.lit('user'))), note: S.opt(S.str),
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}SaveTranslationValue`, S.oneOf(
            S.obj({ kind: S.lit('saved'), translation: translationShape }),
            S.obj({ kind: S.lit('already-saved'), translation: translationShape }),
            S.obj({
              kind: S.lit('conflict'),
              reason: S.oneOf(S.lit('passage-unknown'), S.lit('anchor-unknown'), S.lit('operation-used')),
            }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/addBranch',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'addBranch',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}AddBranchRequest`, S.obj({
              passageId: S.str, operationId: S.str, parentId: S.oneOf(S.str, S.nil), anchorId: S.str,
              kind: S.oneOf(S.lit('constituents'), S.lit('grammar'), S.lit('vocabulary'), S.lit('translation'), S.lit('note')),
              title: S.str, body: S.str,
            })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}AddBranchValue`, S.oneOf(
            S.obj({ kind: S.lit('created'), branch: branchShape }),
            S.obj({ kind: S.lit('already-saved'), branch: branchShape }),
            S.obj({
              kind: S.lit('conflict'),
              reason: S.oneOf(S.lit('passage-unknown'), S.lit('anchor-unknown'), S.lit('parent-unknown'), S.lit('operation-used'), S.lit('limit-reached')),
              maxBranches: S.num,
            }),
          )),
        },
        {
          id: '@local/french-close-reading#frenchReader/listAnalysis',
          service: 'frenchReader',
          namespace: 'frenchReader',
          method: 'listAnalysis',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'request', wire: 'request', source: 'json',
            codec: strict(`${TYPES}ListAnalysisRequest`, S.obj({ passageId: S.str })),
          }],
          cancellation: { parameter: 'signal' },
          result: strict(`${TYPES}ListAnalysisValue`, S.obj({ analysis: S.oneOf(analysisShape, S.nil) })),
        },
      ],
    }
    const PAGE_SIZE = 25
    const PENDING_KEY = 'french-close-reading:pending-create:v1'

    const zh = {
      shelfTitle: '书籍目录', shelfHome: '书架', shelfToggle: '目录', closeDirectory: '收起目录', removeEmptyBook: '移除空书籍', unfilePassage: '移出书籍', newBook: '添加书籍', newChapter: '添加章节',
      bookField: '书名', chapterField: '章节', numberField: '段落序号', unfiled: '未归类', noChapter: '未分章',
      organizePassage: '归类与排序', saveLocation: '保存位置', sourceReading: '原文全文', learningTools: '句子学习',
      shelfWelcome: '从书籍目录开始阅读', shelfWelcomeHint: '展开书籍与章节，选择段落。新内容按书籍归类，段落序号在章节内接续。',
      shelfEmpty: '尚未添加书籍。添加书籍后，可在章节内录入第一段。', shelfLocal: '目录归类保存在本机',
      locationConflict: '本章已有相同段落序号，请修改序号。', bookRequired: '请填写书名。', readingSettings: '显示设置',
      addToChapter: '录入段落', libraryActions: '段落管理', sourceSelectHint: '展开查看上下文，点击句子切换。',
      panel: '法语精读', brandSub: 'FRENCH CLOSE READING · 原文为锚，逐层精读',
      close: '关闭面板', loading: '载入中…',
      tabPassages: '段落库', tabKnowledge: '知识库',
      listTitle: '已保存段落', count: '共 {count} 段 · 上限 250', refresh: '刷新',
      empty: '还没有段落。在右侧保存第一段法语原文。',
      open: '打开', previous: '上一页', nextPage: '下一页', page: '第 {page} 页',
      exportAll: '导出完整备份', exporting: '正在导出…', exportDone: '已导出完整备份（{count} 条记录）：原文、解析、讨论、知识库与任务一并保存。',
      exportSources: '仅导出原文', exportSourcesDone: '已导出原文清单（不含解析与知识库）。',
      untitled: '未命名段落', chars: '{count} 字符',
      compose: '新建段落', composeHint: '原文保存后即为只读基线：译文与分支都作为新版本追加，绝不覆盖原文。',
      startTitle: '开始一段精读',
      passageTitle: '标题', titlePlaceholder: '例如：第一章 · 开篇',
      source: '法语原文', sourcePlaceholder: '在这里粘贴法语原文……',
      sourceHelp: '每段最多 20,000 字符。段落按空行切分，句子保留法文排版细节（缩写、对话破折号、引号间距）。',
      preview: '预览切分', confirmSave: '确认保存', editAgain: '返回修改',
      saving: '正在安全保存…', saved: '已保存；原文基线保持不变。',
      alreadySaved: '这次保存已在先前请求中完成，已恢复原记录。',
      previewTitle: '切分预览（尚未保存）', previewClean: '未发现编码或排版问题。',
      previewReady: '预览已生成：确认分段与标记后再保存。',
      previewUnavailable: '预览不可用：{reason}。再次点击将直接保存（宿主可能需要重启以提供预览端点）。',
      saveWithoutPreview: '无预览直接保存',
      previewCounts: '{paragraphs} 段 · {sentences} 句 · {characters} 字符',
      previewSentences: '{count} 句',
      titleRequired: '请填写标题。', sourceRequired: '请粘贴法语原文。',
      sourceLimit: '原文最多 20,000 字符。',
      saveConflict: '保存冲突：{reason}。请刷新段落列表后重试。',
      limitReached: '已达到当前版本的 250 段上限。请先导出备份。',
      idUsed: '段落标识冲突', operationUsed: '保存操作标识冲突',
      requestFailed: '请求失败，请检查连接后重试。',
      backupFailed: '导出备份失败。', restoreNote: '重新载入页面后，已保存原文仍可恢复。',
      backToLibrary: '段落库', sourceRevision: '原文修订 {revision}',
      currentAnchor: '当前锚点', wholePassage: '整篇',
      sentencesHint: '点击句子设为当前锚点；拖选短语可创建选区锚点。',
      segmentationLoading: '正在切分原文…',
      benchTitle: '锚点工作台',
      readingPaneTitle: '原文', readingEyebrow: 'TEXTE D’ÉTUDE',
      benchHint: '点击左侧的句子或段落，这里即切换到对应锚点的译文与讨论。',
      analysisSection: '逐句解析', analysisNeedsSentence: '选中一句话再生成解析；段落与整篇不逐句解析。',
      analysisStage: '等待模型返回', analysisStageElapsed: '{stage} · 已用时 {seconds} 秒',
      analysisCancelled: '已停止等待这次解析。后台运行若自行完成，重新选中本句即可读到。',
      analysisTimedOut: '等待 {seconds} 秒未返回，已停止等待。可重新点击解析重试。',
      analyseSentence: '生成这句的解析', reanalyseSentence: '重新生成解析', analyzing: '解析中…',
      // The prototype's reading-pane wording, which differs by location from the
      // detail pane's button: 解析这句 in the text, 查看解析 once it exists.
      analyseThisSentence: '解析这句', viewAnalysis: '查看解析',
      paragraphLabel: '段落 {index}', sentenceMark: '当前 · 第 {index} 句',
      // Reading toolbar and route controls.
      analyseTop: '解析', navToggle: '打开路线', navTitle: '原文 · 路线',
      navZoomOut: '缩小', navZoomIn: '放大', navCollapse: '收起路线',
      nextPassage: '录入下一段', startNextPassage: '开始下一段', nextPassageHint: '标题自动接续段落编号，可手动修改。保存后继续学习当前段。',
      saveNextPassage: '保存，继续当前段', nextPassageSaved: '下一段已保存，准备好后即可开始。', resumeReading: '返回当前段',
      navStageLabel: '可缩放导航；加减号缩放，方向键平移', navHint: '双指滑动平移 · 捏合缩放', navFit: '全览',
      progressSentences: '{covered} / {total} 句', paragraphAnchor: '段落后重新解析',
      audioGenerate: '▷ 发音', audioRegenerate: '↻ 重新生成',
      audioNotWired: '逐句发音，接口尚未接入', switchPassage: '切换段落',
      audioRegenerateShort: '↻ 重生成', audioReserved: '接口预留',
      audioSentence: '第 {index} 句发音', audioRegenerateSentence: '重新生成第 {index} 句发音',
      audioNotWiredSentence: '第 {index} 句：{action} 接口尚未接入',
      chapterLabel: '章节 {index}', routeCaption: 'PARCOURS',
      previousSentence: '上一句', nextSentence: '下一句', locateNavigation: '定位 ↙',
      locatedSentence: '已定位到第 {index} 句',
      syntaxLegendLabel: '句法图例', syntaxLegendHead: '颜色：功能 · 下划线：从句范围',
      syntaxTranslationColourOn: '译文配色', syntaxTranslationColourOff: '取消译文配色',
      synSubject: '主语', synVerb: '变位动词', synObject: '宾语／同位语', synPredicative: '表语',
      synAdverbial: '状语／副词', synInfinitive: '不定式补语', synModifier: '名词修饰', synClause: '从句范围',
      syntaxToggle: '句法配色', lookupWord: '查词', audioUnavailable: '未接入',
      addBranchShort: '＋ 讨论', notAnalysed: '尚未解析', statusDraft: '草稿', statusReviewed: '已复核',
      partStructure: '结构与说明', analysisTitle: '句子解析', sentenceTranslationLabel: '句子译文', noStructureYet: '本条尚未给出结构与说明。',
      certainty_syntax: '句法事实', certainty_context: '语境解释', certainty_rhetoric: '修辞效果', certainty_unverified: '待查证',
      lexiconTab: '词汇', statusGenerated: '已生成', branchOpen: '待理解', branchSettled: '已理解',
      confirmedConclusion: '已确认的学习结论', conclusionSource: '来源：', backToSourceDiscussion: '返回来源讨论',
      forkedFrom: '从「{title}」分出{cut}。兄弟分支不进入本次讨论。',
      fixedAtMessage: '固定至第 {index} 条消息', forkedAtMessage: '已分叉 · 固定至第 {index} 条消息',
      forkBranch: '⑂ 分叉', distilConclusion: '提炼结论', markUnderstood: '✓ 我已理解', markToCheck: '↺ 标记待查证',
      you: '你', modelAnswer: '回答', sourceText: '原文', knowledgeChangesLabel: '本次知识库改动',
      backToAnalysis: '← 返回解析', backToEntryList: '条目列表', grammarTab: '语法', searchKnowledge: '搜索知识库', searchPlaceholder: '搜索',
      masteryFilter: '掌握状态筛选', masteryAll: '全部状态', masteryLearning: '在学', masteryReviewing: '熟悉',
      masteryKnown: '已掌握', masteryUnknown: '未设', scopeFilter: '出现范围筛选', scopeAll: '全部',
      scopeSentence: '当前句', noMatchingEntry: '没有匹配条目', exampleCount: '{count} 条例句',
      knowledgePolicyNote: '语法知识在问答后自动积累；词条由查词与讨论收入，均为本地记录。',
      knowledgeLoading: '读取中…',
      contentUser: '读者填写', contentMixed: '混合来源',
      conjBaseCount: '{count} 个语音基底', conjModeLabel: '变位显示方式',
      conjModeOral: '口语', conjModeBoth: '对照', conjModeWritten: '书写',
      conjBaseLabel: '基底 {index}，{persons}',
      partOfSpeechLabel: '词性', notRecorded: '未记录', notRated: '未评级', formsLabel: '形式数',
      registerFrequencyLabel: '语体／频率', contentLabel: '内容来源', entryHintsSummary: '校验提示',
      grammarStoredRule: '已存规则', grammarRuleEmpty: '尚未填写', grammarPitfalls: '限制与易混点',
      grammarPitfallCount: '已记录 {count} 条易混点',
      grammarNoBreakdown: '此条目尚无扩展拆解与对比示例，未套用其他语法点的内容。',
      conjugationNoData: '尚无该动词的读音数据', entryIndexLabel: '词汇详情章节', sectionGapPrefix: '（待补', askCount: '{count} 次提问', contentAiUnverified: 'AI 内容 · 未核实',
      askPlaceholder: '提问……', contextNotCompiled: '尚未编译上下文；按下按钮会先给出将要发送的内容。',
      modelNotConnected: '未连接模型',
      modelFallback: '记住的模型 {model} 已不可用，已回退到默认模型。',
      newBranch: '新分支', newPassage: '新建段落', archivePassage: '归档', archiveDone: '已归档。', passageList: '段落列表', noPassageYet: '还没有段落。',
      previewSummary: '将切分为 {paragraphs} 段、{sentences} 句。',
      titleField: '标题',
      branchFrom: '来源：', branchFromSentence: '第 {index} 句',
      branchTitleRequired: '请输入分支标题', branchNamePlaceholder: '分支标题', lookupRequired: '请输入原文词形或短语',
      lookupPlaceholder: '原文词形或短语', lookupSubmit: '查阅', conversationCancel: '取消',
      cancel: '取消', create: '创建', confirm: '确认',
      conclusionField: '结论内容', conclusionRequired: '请输入结论内容',
      conclusionDialogDescription: '编辑后确认，生成独立结论，不改写原回答。Ctrl / ⌘ + Enter 确认。',
      conclusionSaved: '结论已保存', dialogTooLong: '最多输入 {max} 个字符',
      entryStored: '已有词条', entryNotStored: '未收藏', lookupMiss: '未收藏 · 相关原形 {count} 条（不自动合并）',
      analyseParagraph: '生成本段缺的 {count} 句解析（每句一次模型调用）',
      paragraphComplete: '本段解析已齐', paragraphNothingMissing: '这一段没有缺解析的句子。',
      paragraphDone: '本段完成：{stored}/{asked} 句写入成功，{failed} 句被门禁拒绝。',
      paragraphFailed: '{anchorId} 未通过校验：{reason}',
      publishAnalysis: '发布分析版本',
      analysisRefused: '这次解析未通过校验，未写入：{reason} {detail}',
      analysisDone: '解析已写入。已覆盖 {covered} 句，缺 {missing} 句，校验失败 {failed} 句，过期 {stale} 句。',
      publishedDone: '已发布分析版本 r{revision}，覆盖 {covered} 句。',
      coverageLine: '覆盖 {covered}/{total} 句 · 缺 {missing} · 失败 {failed} · 过期 {stale}',
      partOriginal: '原文与成分', partTranslation: '句译', partBackbone: '主干',
      partClauses: '句法层级', partMorphology: '词形',
      partExplanations: '语篇与表达（按确定性标注）',
      kind_syntax: '句法事实', kind_context: '语境解释', kind_rhetoric: '修辞解读', kind_unverified: '待查证',
      discussionSection: '分支讨论',
      backendLabel: '处理模型', modelLabel: '模型', noModels: '（没有可用模型）',
      unavailable: '不可用', singleFlightHint: '该后端一次只跑一个任务。',
      startBranch: '在当前锚点开一个讨论分支', branchOpened: '分支已建立。',
      noDiscussion: '还没有讨论分支。',
      branchCount: '{count} 个分支',
      discussionTitle: '讨论',
      questionLabel: '问题', questionPlaceholder: '针对这段原文提问，例如：这里的否定范围到哪里？',
      previewContext: '查看本次上下文', sendTurn: '发送', asking: '生成中…',
      contextTitle: '本次上下文（预览即发送内容）', contextSize: '约 {characters} 字符 · {count} 份材料',
      contextChars: '{characters} 字符',
      branchFirst: '先在这个锚点建立一个讨论分支。',
      previewRefused: '本次上下文无法发送：{reason}',
      askFailed: '本次生成未完成：{reason} {failure}',
      answerDone: '已回答（{model}）。',
      answerPartial: '回答结束于 {finish}，可能不完整。',
      historyCount: '本次请求携带 {count} 条历史',
      authorUser: '读者', authorModel: '回答', answerFailed: '失败',
      statusUnderstood: '已理解', statusUnresolved: '待查证', statusDisputed: '有争议',
      generationUnavailable: '生成功能不可用：{reason}',
      sourceLabel: '来源', sectionLabel: '章节', sourceNone: '（未选择）',
      fetchSource: '获取该来源', sourceRefused: '本次未发起获取：{reason}',
      mastery_learning: '在学', mastery_reviewing: '复习中', mastery_known: '已掌握',
      masteryDone: '学习状态已改为 {mastery}（{kind}）。',
      translationSection: '译文', translationEmpty: '尚无译文', versions: '{count} 个版本',
      translationPlaceholder: '在这里写下该锚点的译文……',
      saveTranslation: '保存译文', translationSaved: '译文已保存（追加为新版本）。',
      branchSection: '讨论分支', noBranches: '该锚点下还没有分支。',
      branchKind: '类型', branchTitle: '标题', branchTitlePlaceholder: '例如：无人称句 il faut',
      branchBody: '内容', branchBodyPlaceholder: '写清依据；不确定处直接标明存疑，不要编造分类。',
      addBranch: '添加分支', branchAdded: '分支已添加。',
      kindConstituents: '句子成分', kindGrammar: '语法', kindVocabulary: '词汇',
      kindTranslation: '翻译说明', kindNote: '笔记',
      transBadge: '译 {count}', branchBadge: '分支 {count}',
      selectionFound: '已选中片段', anchorSelection: '设为锚点',
      discardSelection: '取消选择', selectionAnchored: '选区已存为锚点 {anchorId}。',
      selectionUnavailable: '无法创建选区锚点：{reason}（宿主可能需要重启以提供该端点）。',
      knowledgeTitle: '词汇库与语法库',
      knowledgeHint: '精读中积累的词汇与语法条目；歧义候选需要你决定归属。',
      tabLexicon: '词汇库', tabGrammar: '语法库', tabConjugation: '变位',
      answerTruncated: '（因长度截断，未完成）', answerCancelled: '（已取消）',
      extractionAdded: '本次已自动收入 {count} 条语法点',
      extractionNone: '本次回答未提出可复用的语法点',
      extractionUnusable: '语法块无法解析，未收入：{reason}',
      conjugationHint: '读音数据按动词抓取：只取来源实际列出的形式，未取得的一律标为缺失；没有数据时如实说明，不凭记忆变位。',
      conjugationLemmaPlaceholder: '动词原形，例如 venir',
      conjugationRead: '读取已存数据', conjugationFetching: '抓取中…',
      conjugationFetch: '从来源抓取',
      conjugationPrompt: '输入动词原形后读取或抓取。',
      conjugationPending: '上次抓取未完成（{status}）：{reason}；缺 {missing} 个形式',
      conjugationFor: '{lemma} 的语音基底',
      conjugationSource: '来源 {source} · 状态 {status} · 缺 {missing} 个形式',
      conjugationMissing: '数据未覆盖：{persons}',
      conjugationCellMissing: '本次数据未覆盖这一格',
      conjugationFetched: '抓取完成（{status}）：{tenses} 个时态、{bases} 个基底、{requests} 次请求、缺 {missing} 个形式',
      conjugationRefused: '未发起抓取：{reason}',
      streamEndedEarly: '流式回答提前结束，未收到结束帧；请重试或改用非流式发送。',
      knowledgeCount: '共 {count} 条', lexiconMeta: '{forms} 个词形 · {senses} 个义项',
      grammarMeta: '提问 {count} 次 · {status}',
      noLexicon: '词汇库还是空的：查询具体 Mot 后会在这里出现。',
      noGrammar: '语法库还是空的：提问后会自动积累语法点。',
      pendingTitle: '待审候选', pendingHelp: '自动匹配置疑：由你决定归属；留空表述则只追加例句、不改规则。',
      pendingOpen: '待审',
      attachTo: '归入所选条目', createAsNew: '作为新条目', discardCandidate: '丢弃候选',
      ruleRewriteHint: '可选：填写新表述＝明确改规则；留空＝只追加例句',
      decisionDone: '已处理：{outcome}',
      openCard: '查看词卡', openCardEtymology: '含词源', closeCard: '收起',
      cardTitle: '{mot} · 词卡（按输出规范渲染）', cardMissing: '条目不存在',
      knowledgeUnavailable: '无法读取知识库：{reason}（宿主可能需要重启以提供该端点）。',
      activationFailed: '插件界面未能挂载 Remote 契约。',
      activationFailedHint: '应用本身未受影响：这一条只是本插件自己的失败信息。请在控制台查看完整堆栈，修好后重新加载页面。',
    }
    const en = {
      shelfTitle: 'Books', shelfHome: 'Library', shelfToggle: 'Contents', closeDirectory: 'Close contents', removeEmptyBook: 'Remove empty book', unfilePassage: 'Unfile passage', newBook: 'Add book', newChapter: 'Add chapter',
      bookField: 'Book', chapterField: 'Chapter', numberField: 'Paragraph number', unfiled: 'Unfiled', noChapter: 'No chapter',
      organizePassage: 'Organize and order', saveLocation: 'Save location', sourceReading: 'Full source text', learningTools: 'Sentence tools',
      shelfWelcome: 'Read from your book library', shelfWelcomeHint: 'Expand a book and chapter to open a passage. Add new text within its chapter.',
      shelfEmpty: 'Add a book, then enter the first passage in its chapter.', shelfLocal: 'Organization is saved on this device',
      locationConflict: 'This paragraph number is already in use in this chapter.', bookRequired: 'Enter a book title.', readingSettings: 'Display',
      addToChapter: 'Add passage', libraryActions: 'Passage management', sourceSelectHint: 'Expand for context; select a sentence to focus it.',
      panel: 'French Close Reading', brandSub: 'FRENCH CLOSE READING · the source is the anchor',
      close: 'Close panel', loading: 'Loading…',
      tabPassages: 'Passages', tabKnowledge: 'Knowledge',
      listTitle: 'Saved passages', count: '{count} saved · limit 250', refresh: 'Refresh',
      empty: 'No passages yet. Save a French source on the right to see it here.',
      open: 'Open', previous: 'Previous', nextPage: 'Next', page: 'Page {page}',
      exportAll: 'Export full backup', exporting: 'Exporting…', exportDone: 'Full backup exported ({count} records): sources, analysis, discussions, knowledge and runs.',
      untitled: 'Untitled passage', chars: '{count} chars',
      compose: 'New passage', composeHint: 'The saved source stays immutable: translations and branches are appended as versions, never written over it.',
      startTitle: 'Start a close reading',
      passageTitle: 'Title', titlePlaceholder: 'e.g. Chapter 1 · Opening',
      source: 'French source', sourcePlaceholder: 'Paste the French source here…',
      sourceHelp: 'Up to 20,000 characters per passage. Paragraphs split on blank lines; sentences keep French typography details.',
      preview: 'Preview split', confirmSave: 'Confirm and save', editAgain: 'Back to editing',
      saving: 'Saving durably…', saved: 'Saved; the source baseline is unchanged.',
      alreadySaved: 'This save had already completed; the original record was restored.',
      previewTitle: 'Split preview (nothing saved yet)', previewClean: 'No encoding or typography problems found.',
      previewReady: 'Preview ready: check the boundaries and flags, then save.',
      previewUnavailable: 'Preview unavailable: {reason}. Press again to save without it (the Host may need a restart for the preview endpoint).',
      saveWithoutPreview: 'Save without preview',
      previewCounts: '{paragraphs} paragraphs · {sentences} sentences · {characters} characters',
      previewSentences: '{count} sentence(s)',
      titleRequired: 'Enter a title.', sourceRequired: 'Paste the French source text.',
      sourceLimit: 'The source is limited to 20,000 characters.',
      saveConflict: 'Save conflict: {reason}. Refresh the list and retry.',
      limitReached: 'The current prototype is limited to 250 passages. Export a backup first.',
      idUsed: 'Passage id conflict', operationUsed: 'Save operation id conflict',
      requestFailed: 'The request failed. Check the connection and retry.',
      backupFailed: 'Could not export a backup.', restoreNote: 'Saved originals remain available after reloading the page.',
      backToLibrary: 'Passages', sourceRevision: 'Source revision {revision}',
      currentAnchor: 'Current anchor', wholePassage: 'Whole passage',
      sentencesHint: 'Click a sentence to make it the current anchor; drag-select a phrase to anchor it.',
      segmentationLoading: 'Segmenting the source…',
      benchTitle: 'Anchor workbench',
      readingPaneTitle: 'Text', readingEyebrow: 'TEXTE D’ÉTUDE',
      benchHint: 'Click a sentence or paragraph on the left; its translation and discussion appear here.',
      analysisSection: 'Sentence analysis', analysisNeedsSentence: 'Select a sentence to analyse; paragraphs and the whole passage are not analysed sentence by sentence.',
      analysisStage: 'Waiting for the model', analysisStageElapsed: '{stage} · {seconds}s elapsed',
      analysisCancelled: 'Stopped waiting for this analysis. If the run finishes anyway, reselect the sentence to read it.',
      analysisTimedOut: 'No reply after {seconds}s; stopped waiting. Press Analyse to retry.',
      analyseSentence: 'Analyse this sentence', reanalyseSentence: 'Re-analyse', analyzing: 'Analysing…',
      analyseThisSentence: 'Analyse this sentence', viewAnalysis: 'View analysis',
      paragraphLabel: 'Paragraph {index}', sentenceMark: 'Current · sentence {index}',
      analyseTop: 'Analyse', navToggle: 'Open route', navTitle: 'Text · route',
      navZoomOut: 'Zoom out', navZoomIn: 'Zoom in', navCollapse: 'Close route',
      nextPassage: 'Add next passage', startNextPassage: 'Read next passage', nextPassageHint: 'The paragraph number advances automatically. You can edit the title. Saving keeps the current passage open.',
      saveNextPassage: 'Save and keep reading', nextPassageSaved: 'Next passage saved. Start it when ready.', resumeReading: 'Back to current passage',
      navStageLabel: 'Zoomable navigation; minus and plus zoom, arrow keys pan',
      navHint: 'Two-finger swipe to pan · pinch to zoom', navFit: 'Fit',
      progressSentences: '{covered} / {total} sentences', paragraphAnchor: 'Paragraph anchor',
      audioGenerate: '▷ Speak', audioRegenerate: '↻ Regenerate',
      audioNotWired: 'Per-sentence audio is not connected yet', switchPassage: 'Switch passage',
      audioRegenerateShort: '↻ Regenerate', audioReserved: 'not wired',
      audioSentence: 'Speak sentence {index}', audioRegenerateSentence: 'Regenerate sentence {index} audio',
      audioNotWiredSentence: 'Sentence {index}: {action} is not connected yet',
      chapterLabel: 'Chapter {index}', routeCaption: 'PARCOURS',
      previousSentence: 'Previous sentence', nextSentence: 'Next sentence', locateNavigation: 'Locate ↙',
      locatedSentence: 'Located sentence {index}',
      syntaxLegendLabel: 'Syntax legend', syntaxLegendHead: 'Colour: function · underline: clause range',
      syntaxTranslationColourOn: 'Colour the translation', syntaxTranslationColourOff: 'Stop colouring the translation',
      synSubject: 'Subject', synVerb: 'Finite verb', synObject: 'Object / apposition', synPredicative: 'Predicative',
      synAdverbial: 'Adverbial / adverb', synInfinitive: 'Infinitive complement', synModifier: 'Noun modifier',
      synClause: 'Clause range', syntaxToggle: 'Syntax colour', lookupWord: 'Look up', audioUnavailable: 'not wired',
      addBranchShort: '＋ Discussion', notAnalysed: 'not analysed yet', statusDraft: 'draft', statusReviewed: 'reviewed',
      partStructure: 'Structure and notes', analysisTitle: 'Sentence analysis', sentenceTranslationLabel: 'Sentence translation', noStructureYet: 'No structure has been recorded for this sentence yet.',
      certainty_syntax: 'syntax', certainty_context: 'context', certainty_rhetoric: 'rhetoric', certainty_unverified: 'unverified',
      lexiconTab: 'Vocabulary', statusGenerated: 'generated', branchOpen: 'open', branchSettled: 'understood',
      confirmedConclusion: 'Confirmed conclusion', conclusionSource: 'From: ', backToSourceDiscussion: 'Back to the source discussion',
      forkedFrom: 'Split from “{title}”{cut}. Sibling branches are not part of this turn.',
      fixedAtMessage: 'fixed at message {index}', forkedAtMessage: 'Forked · fixed at message {index}',
      forkBranch: '⑂ Fork', distilConclusion: 'Distil a conclusion', markUnderstood: '✓ I understand this', markToCheck: '↺ Mark to check',
      you: 'You', modelAnswer: 'Answer', sourceText: 'the text', knowledgeChangesLabel: 'Knowledge base changes',
      backToAnalysis: '← Back to the analysis', backToEntryList: 'Entry list', grammarTab: 'Grammar', searchKnowledge: 'Search the knowledge base',
      searchPlaceholder: 'Search', masteryFilter: 'Filter by mastery', masteryAll: 'Any mastery',
      masteryLearning: 'Learning', masteryReviewing: 'Familiar', masteryKnown: 'Known', masteryUnknown: 'unset',
      scopeFilter: 'Filter by where it appears', scopeAll: 'Anywhere', scopeSentence: 'This sentence',
      noMatchingEntry: 'No matching entry', exampleCount: '{count} example(s)',
      knowledgePolicyNote: 'Grammar accumulates automatically after a turn; words are filed by lookup and discussion. Everything stays local.',
      knowledgeLoading: 'Loading…',
      contentUser: 'written by the reader', contentMixed: 'mixed sources',
      conjBaseCount: '{count} phonetic base(s)', conjModeLabel: 'How the conjugation is shown',
      conjModeOral: 'Spoken', conjModeBoth: 'Both', conjModeWritten: 'Written',
      conjBaseLabel: 'Base {index}, {persons}',
      partOfSpeechLabel: 'Part of speech', notRecorded: 'not recorded', notRated: 'not rated',
      formsLabel: 'Forms', registerFrequencyLabel: 'Register / frequency', contentLabel: 'Content source',
      entryHintsSummary: 'Validation notes',
      grammarStoredRule: 'Stored rule', grammarRuleEmpty: 'not written yet', grammarPitfalls: 'Limits and confusions',
      grammarPitfallCount: '{count} confusion(s) recorded',
      grammarNoBreakdown: 'This entry has no extended breakdown or contrast examples yet; nothing was borrowed from another grammar point.',
      conjugationNoData: 'No pronunciation data for this verb yet', entryIndexLabel: 'Word entry sections', sectionGapPrefix: '（待补',
      askCount: '{count} question(s)', contentAiUnverified: 'AI content · unverified',
      askPlaceholder: 'Ask…', contextNotCompiled: 'No context compiled yet; the button shows what would be sent first.',
      modelNotConnected: 'no model connected',
      modelFallback: 'The saved model {model} is no longer available; back to the default.',
      newBranch: 'New branch', newPassage: 'New passage', archivePassage: 'Archive', archiveDone: 'Archived.', passageList: 'Passage list',
      noPassageYet: 'No passage yet.', sourceTextLabel: 'French source',
      previewSummary: 'Will be split into {paragraphs} paragraph(s) and {sentences} sentence(s).',
      titleField: 'Title',
      branchFrom: 'From: ', branchFromSentence: 'Sentence {index}',
      branchTitleRequired: 'Enter a branch title', branchNamePlaceholder: 'Branch title', lookupRequired: 'Enter the word or phrase from the text',
      lookupPlaceholder: 'Word or phrase from the text', lookupSubmit: 'Look up',
      cancel: 'Cancel', create: 'Create', confirm: 'Confirm',
      conclusionField: 'Conclusion', conclusionRequired: 'Enter the conclusion',
      conclusionDialogDescription: 'Edit, then confirm: the conclusion is stored on its own and never rewrites the answer. Ctrl / ⌘ + Enter confirms.',
      conclusionSaved: 'Conclusion saved', dialogTooLong: 'At most {max} characters',
      entryStored: 'entry on file', entryNotStored: 'not collected',
      lookupMiss: 'not collected · {count} related forms (never merged automatically)',
      analyseParagraph: 'Analyse the {count} sentences this paragraph is missing (one model call each)',
      paragraphComplete: 'This paragraph is complete', paragraphNothingMissing: 'Nothing is missing in this paragraph.',
      paragraphDone: 'Paragraph done: {stored}/{asked} stored, {failed} refused by the gate.',
      paragraphFailed: '{anchorId} did not pass validation: {reason}',
      publishAnalysis: 'Publish analysis version',
      analysisRefused: 'This analysis did not pass validation and was not stored: {reason} {detail}',
      analysisDone: 'Analysis stored. Covered {covered}, missing {missing}, failed {failed}, stale {stale}.',
      publishedDone: 'Published analysis version r{revision}, covering {covered} sentences.',
      coverageLine: 'Covered {covered}/{total} · missing {missing} · failed {failed} · stale {stale}',
      partOriginal: 'Original and constituents', partTranslation: 'Translation', partBackbone: 'Backbone',
      partClauses: 'Clause hierarchy', partMorphology: 'Forms',
      partExplanations: 'Discourse and expression (labelled by certainty)',
      kind_syntax: 'syntax', kind_context: 'context', kind_rhetoric: 'rhetoric', kind_unverified: 'to verify',
      discussionSection: 'Discussion',
      backendLabel: 'Backend', modelLabel: 'Model', noModels: '(no model available)',
      unavailable: 'unavailable', singleFlightHint: 'This backend runs one task at a time.',
      startBranch: 'Open a discussion branch on this anchor', branchOpened: 'Branch opened.',
      noDiscussion: 'No discussion branch yet.',
      branchCount: '{count} branches',
      discussionTitle: 'Discussion',
      questionLabel: 'Question', questionPlaceholder: 'Ask about this passage, e.g. how far does the negation reach?',
      previewContext: 'Show this context', sendTurn: 'Send', asking: 'Generating…',
      contextTitle: 'This turn\'s context (the preview is what is sent)', contextSize: '~{characters} characters · {count} materials',
      contextChars: '{characters} characters',
      branchFirst: 'Open a discussion branch on this anchor first.',
      previewRefused: 'This context cannot be sent: {reason}',
      askFailed: 'The turn did not finish: {reason} {failure}',
      answerDone: 'Answered ({model}).',
      answerPartial: 'The answer ended at {finish} and may be incomplete.',
      historyCount: '{count} messages carried into this request',
      authorUser: 'Reader', authorModel: 'Answer', answerFailed: 'failed',
      statusUnderstood: 'Understood', statusUnresolved: 'Unresolved', statusDisputed: 'Disputed',
      generationUnavailable: 'Generation is unavailable: {reason}',
      sourceLabel: 'Source', sectionLabel: 'Section', sourceNone: '(none selected)',
      fetchSource: 'Fetch this source', sourceRefused: 'Nothing was requested: {reason}',
      mastery_learning: 'Learning', mastery_reviewing: 'Reviewing', mastery_known: 'Known',
      masteryDone: 'Mastery set to {mastery} ({kind}).',
      translationSection: 'Translation', translationEmpty: 'No translation yet', versions: '{count} version(s)',
      translationPlaceholder: 'Write the translation for this anchor here…',
      saveTranslation: 'Save translation', translationSaved: 'Translation saved as a new version.',
      branchSection: 'Discussion branches', noBranches: 'No branch under this anchor yet.',
      branchKind: 'Kind', branchTitle: 'Title', branchTitlePlaceholder: 'e.g. impersonal il faut',
      branchBody: 'Content', branchBodyPlaceholder: 'State your evidence; mark real doubt instead of inventing a classification.',
      addBranch: 'Add branch', branchAdded: 'Branch added.',
      kindConstituents: 'Constituents', kindGrammar: 'Grammar', kindVocabulary: 'Vocabulary',
      kindTranslation: 'Translation note', kindNote: 'Note',
      transBadge: 'trans {count}', branchBadge: 'branches {count}',
      selectionFound: 'Selected phrase', anchorSelection: 'Anchor this selection',
      discardSelection: 'Clear selection', selectionAnchored: 'Selection stored as anchor {anchorId}.',
      selectionUnavailable: 'Could not create the phrase anchor: {reason} (the Host may need a restart for this endpoint).',
      knowledgeTitle: 'Vocabulary and grammar',
      knowledgeHint: 'Entries accumulated while reading; ambiguous candidates wait for your decision.',
      tabLexicon: 'Vocabulary', tabGrammar: 'Grammar', tabConjugation: 'Conjugation',
      answerTruncated: '(truncated at the length limit; unfinished)', answerCancelled: '(cancelled)',
      extractionAdded: 'Filed {count} grammar point(s) from this answer',
      extractionNone: 'This answer proposed no reusable grammar point',
      extractionUnusable: 'The grammar block could not be read, so nothing was filed: {reason}',
      conjugationHint: 'Pronunciation data is fetched per verb: only the forms the source actually lists, and anything not retrieved is reported as missing. With no data, the card says so instead of conjugating from memory.',
      conjugationLemmaPlaceholder: 'Verb infinitive, e.g. venir',
      conjugationRead: 'Read stored data', conjugationFetching: 'Fetching…',
      conjugationFetch: 'Fetch from source',
      conjugationPrompt: 'Enter a verb to read or fetch.',
      
      conjugationPending: 'The last fetch did not finish ({status}): {reason}; {missing} forms missing',
      conjugationFor: 'Phonetic bases of {lemma}',
      conjugationSource: 'Source {source} · {status} · {missing} forms missing',
      conjugationMissing: 'Not covered by the data: {persons}',
      conjugationCellMissing: 'This cell is not covered by the fetched data',
      conjugationFetched: 'Fetch finished ({status}): {tenses} tenses, {bases} bases, {requests} requests, {missing} forms missing',
      conjugationRefused: 'Nothing was fetched: {reason}',
      streamEndedEarly: 'The streamed answer ended without a terminal frame. Retry, or send without streaming.',
      knowledgeCount: '{count} entr(y/ies)', lexiconMeta: '{forms} forms · {senses} senses',
      grammarMeta: 'asked {count} time(s) · {status}',
      noLexicon: 'The vocabulary library is empty: it fills as you look up exact Mots.',
      noGrammar: 'The grammar library is empty: grammar points accumulate as you ask.',
      pendingTitle: 'Awaiting review', pendingHelp: 'Near matches the matcher would not merge: you decide; empty wording only adds the example.',
      pendingOpen: 'open',
      attachTo: 'Attach to selected', createAsNew: 'Create as new entry', discardCandidate: 'Discard candidate',
      ruleRewriteHint: 'Optional: new wording rewrites the rule; leaving it empty only adds the example',
      decisionDone: 'Done: {outcome}',
      openCard: 'Open card', openCardEtymology: 'With etymology', closeCard: 'Close',
      cardTitle: '{mot} · card (rendered through its policy)', cardMissing: 'entry not found',
      knowledgeUnavailable: 'Could not read the knowledge library: {reason} (the Host may need a restart for this endpoint).',
      activationFailed: 'The panel could not mount the Remote contract.',
      activationFailedHint: 'The app is unaffected; this is only this plugin reporting its own failure. Check the console for the stack, then reload the page.',
    }

    /**
     * The prototype's stylesheet, transplanted whole.
     *
     * Generated by `.work/panel-preview/transplant-css.mjs`, which does exactly two
     * things: prefix every selector with the panel root `.fr-root` (so generic names
     * like `.top`, `.pane` and `.message` cannot leak into the DSH shell), and turn
     * `:root`/`html`/`body` into that same root. Class names, values and the
     * prototype's exact colours are untouched — 694 rules in, 694 rules out.
     *
     * Do not hand-edit: change the prototype, re-run the script, and re-check with
     * `.work/panel-preview/transplant-check.html`.
     */
    const PROTOTYPE_STYLES = `
/* Prototype palette: one token per colour the transplanted rules use, with the
   prototype's own light values. Dark values are the next step — see
   .work/panel-preview/tokenise-colours.mjs. */
.fr-root{--fr-c01:#f5f4f0;--fr-c02:#fffefa;--fr-c03:#253c38;--fr-c04:#81918b;--fr-c05:#e0e5dd;--fr-c06:#326952;--fr-c07:#eaf2e9;--fr-c08:#b77e43;--fr-c09:#7eaa88;--fr-c10:#eff5ed;--fr-c11:#fff;--fr-c12:#9b703f;--fr-c13:#f5ecd9;--fr-c14:#718277;--fr-c15:#f0f2e9;--fr-c16:#e7efe3;--fr-c17:#91ac7b;--fr-c18:#647568;--fr-c19:#f3f5ef;--fr-c20:#d2dace;--fr-c21:#d8e1d3;--fr-c22:#33492a06;--fr-c23:#32695210;--fr-c24:#e7eee1;--fr-c25:#829078;--fr-c26:#8b987f;--fr-c27:#ffffff80;--fr-c28:#b5cba8;--fr-c29:#65715e;--fr-c30:#f5f7f0;--fr-c31:#8b9784;--fr-c32:#f4f5ef;--fr-c33:#4c78a1;--fr-c34:#b06557;--fr-c35:#f0f4eb;--fr-c36:#fafbf7;--fr-c37:#829079;--fr-c38:#7e8d76;--fr-c39:#f1f5ec;--fr-c40:#0002;--fr-c41:#21372c66;--fr-c42:#16271c33;--fr-c43:#edf3e8;--fr-c44:#8c9988;--fr-c45:#edf0e8;--fr-c46:#7d8977;--fr-c47:#20302012;--fr-c48:#f3f4ef;--fr-c49:#e8ece3;--fr-c50:#85907e;--fr-c51:#334637;--fr-c52:#e4e8df;--fr-c53:#b9ceb0;--fr-c54:#829077;--fr-c55:#819079;--fr-c56:#bbcdb2;--fr-c57:#8b9884;--fr-c58:#5f7756;--fr-c59:#e6eadd;--fr-c60:#f7f8f2;--fr-c61:#839177;--fr-c62:#e9ecdf;--fr-c63:#87a577;--fr-c64:#85a56b;--fr-c65:#8f9b85;--fr-c66:#8b987e;--fr-c67:#8f9d84;--fr-c68:#93a087;--fr-c69:#8c9b82;--fr-c70:#f7f8f2fa;--fr-c71:#2c40240a;--fr-c72:#dfe6d6;--fr-c73:#657b59;--fr-c74:#9ca991;--fr-c75:#f5f8ef;--fr-c76:#edf3e7;--fr-c77:#8aab73;--fr-c78:#a0ad96;--fr-c79:#98a78d;--fr-c80:#99a68e;--fr-c81:#92a184;--fr-c82:#a2af97;--fr-c83:#263a3024;--fr-c84:#dce3d3;--fr-c85:#2a3e2420;--fr-c86:#c3cfb8;--fr-c87:#edf0e7;--fr-c88:#849078;--fr-c89:#7c8d72;--fr-c90:#829177;--fr-c91:#849178;--fr-c92:#7c8c73;--fr-c93:#99a48e;--fr-c94:#7e8e73;--fr-c95:#99a38e;--fr-c96:#7f8e74;--fr-c97:#a79470;--fr-c98:#758968;--fr-c99:#8a987f;--fr-c100:#7d8e71;--fr-c101:#5b7450;--fr-c102:#9baa8f;--fr-c103:#40553b;--fr-c104:#3e5937;--fr-c105:#8ba076;--fr-c106:#cbd8bf;--fr-c107:#90aa7c;--fr-c108:#91a181;--fr-c109:#435c38;--fr-c110:#557c4b;--fr-c111:#a67545;--fr-c112:#d3b68d;--fr-c113:#5f7b98;--fr-c114:#879779;--fr-c115:#8a9a7e;--fr-c116:#d7e0ce;--fr-c117:#e8ece1;--fr-c118:#eef4e8;--fr-c119:#7a9764;--fr-c120:#b8cbaa;--fr-c121:#4d6942;--fr-c122:#8e9e80;--fr-c123:#b5cda4;--fr-c124:#8a9b7c;--fr-c125:#6a8559;--fr-c126:#b3c7a2;--fr-c127:#7d906f;--fr-c128:#a0aa94;--fr-c129:#99a58c;--fr-c130:#bdd0ad;--fr-c131:#5f8050;--fr-c132:#7f9072;--fr-c133:#93a086;--fr-c134:#607755;--fr-c135:#47643e;--fr-c136:#8d9279;--fr-c137:#c7d4bd;--fr-c138:#7c8a73;--fr-c139:#8a987e;--fr-c140:#849378;--fr-c141:#386cb0;--fr-c142:#b74643;--fr-c143:#387443;--fr-c144:#ab691a;--fr-c145:#747a7b;--fr-c146:#81559d;--fr-c147:#896447;--fr-c148:#889b78;--fr-c149:#567146;--fr-c150:#a9c295;--fr-c151:#7b926a;--fr-c152:#4e7943;--fr-c153:#778969;--fr-c154:#92a286;--fr-c155:#e7edde;--fr-c156:#7f9273;--fr-c157:#a1ac95;--fr-c158:#80936f;--fr-c159:#517f65;--fr-c160:#af7d48;--fr-c161:#777ab0;--fr-c162:#7f9075;--fr-c163:#a0ab97;--fr-c164:#91a085;--fr-c165:#edf2e7;--fr-c166:#4b6942;--fr-c167:#95a48a;--fr-c168:#87977a;--fr-c169:#dde6d3;--fr-c170:#9aaa8f;--fr-c171:#e7eddf;--fr-c172:#f4f7ef;--fr-c173:#f2f6ec;--fr-c174:#8a997d;--fr-c175:#3f5637;--fr-c176:#72945b;--fr-c177:#b4bfa9;--fr-c178:#5c7d4a;--fr-c179:#f6f8f2;--fr-c180:#556d49;--fr-c181:#94a587;--fr-c182:#adbca1;--fr-c183:#4e5f48;--fr-c184:#c5d3b9;--fr-c185:#95a489;--fr-c186:#a2ae97;--fr-c187:#91a281;--fr-c188:#4d6541;--fr-c189:#99a88d;--fr-c190:#548246;--fr-c191:#acc59c;--fr-c192:#9baa8e;--fr-c193:#8b9b7d;--fr-c194:#94a58a;--fr-c195:#a9b39f;--fr-c196:#819574;--fr-c197:#436938;--fr-c198:#edf3e6;--fr-c199:#8fa07f;--fr-c200:#faf2df;--fr-c201:#86663a;--fr-c202:#eee0c3;--fr-c203:#8a927c;--fr-c204:#9a5048}
/* The same palette at night. Mapped by category with the hue preserved — see the
   rules in .work/panel-preview/tokenise-colours.mjs; no value is a blanket inversion. */
[data-theme='dark'] .fr-root{--fr-c01:#212121;--fr-c02:#1b1b1b;--fr-c03:#e5eceb;--fr-c04:#afb8b4;--fr-c05:#3f3f3f;--fr-c06:#a2cdbb;--fr-c07:#242424;--fr-c08:#d4b89b;--fr-c09:#abc4b1;--fr-c10:#222222;--fr-c11:#1a1a1a;--fr-c12:#d1b99e;--fr-c13:#2e2a22;--fr-c14:#b0b9b3;--fr-c15:#242424;--fr-c16:#272727;--fr-c17:#b6c5aa;--fr-c18:#dbdedc;--fr-c19:#212121;--fr-c20:#464646;--fr-c21:#434343;--fr-c22:#b1c8a706;--fr-c23:#a2cdbb10;--fr-c24:#282828;--fr-c25:#b7beb2;--fr-c26:#b7beb1;--fr-c27:#1a1a1a80;--fr-c28:#4f6541;--fr-c29:#dddfdc;--fr-c30:#202020;--fr-c31:#b5bbb1;--fr-c32:#212121;--fr-c33:#a2b8cd;--fr-c34:#cda9a2;--fr-c35:#232323;--fr-c36:#1d1d1d;--fr-c37:#b6bdb2;--fr-c38:#b6bdb2;--fr-c39:#222222;--fr-c40:#NaNNaNNaN;--fr-c41:#e6ede966;--fr-c42:#e9efeb33;--fr-c43:#242424;--fr-c44:#b2b9af;--fr-c45:#252525;--fr-c46:#b4bab1;--fr-c47:#e8ede812;--fr-c48:#222222;--fr-c49:#282828;--fr-c50:#b4bab0;--fr-c51:#e4e8e5;--fr-c52:#3e3e3e;--fr-c53:#4a6040;--fr-c54:#b7beb1;--fr-c55:#b6bdb2;--fr-c56:#4b5f42;--fr-c57:#b6bdb2;--fr-c58:#b3c1ae;--fr-c59:#3e3e3e;--fr-c60:#202020;--fr-c61:#b7beb1;--fr-c62:#292929;--fr-c63:#b4c4ab;--fr-c64:#b6c6a9;--fr-c65:#b7beb2;--fr-c66:#b8beb1;--fr-c67:#b7beb1;--fr-c68:#b7bfb1;--fr-c69:#b6beb1;--fr-c70:#202020fa;--fr-c71:#b0c9a70a;--fr-c72:#434e34;--fr-c73:#b5c1ae;--fr-c74:#b7bfb0;--fr-c75:#202020;--fr-c76:#242424;--fr-c77:#b5c7a8;--fr-c78:#b7bfb0;--fr-c79:#b6bfb0;--fr-c80:#b7bfb0;--fr-c81:#b7c0af;--fr-c82:#b7c0b0;--fr-c83:#e6ebe924;--fr-c84:#444f36;--fr-c85:#afc8a720;--fr-c86:#4e5b41;--fr-c87:#252525;--fr-c88:#b8beb2;--fr-c89:#b6beb1;--fr-c90:#b7beb1;--fr-c91:#b7beb1;--fr-c92:#b6beb2;--fr-c93:#b8beb1;--fr-c94:#b6beb1;--fr-c95:#b8beb1;--fr-c96:#b7beb1;--fr-c97:#c6bca9;--fr-c98:#b6c0af;--fr-c99:#b7beb1;--fr-c100:#b6bfb1;--fr-c101:#b3c3ac;--fr-c102:#b7c0af;--fr-c103:#b1c3ad;--fr-c104:#afc6a9;--fr-c105:#b8c3ad;--fr-c106:#4a5a3b;--fr-c107:#b6c5ab;--fr-c108:#b8c0af;--fr-c109:#b2c6a9;--fr-c110:#afc7a9;--fr-c111:#d1b79f;--fr-c112:#d2bc9d;--fr-c113:#aab7c6;--fr-c114:#b7bfb0;--fr-c115:#b7bfb0;--fr-c116:#445237;--fr-c117:#282828;--fr-c118:#242424;--fr-c119:#b6c4ab;--fr-c120:#506442;--fr-c121:#b2c5aa;--fr-c122:#b7c0af;--fr-c123:#50683f;--fr-c124:#b7c0af;--fr-c125:#b5c4ac;--fr-c126:#546844;--fr-c127:#b6bfb0;--fr-c128:#b8bfb1;--fr-c129:#b8bfb0;--fr-c130:#4f633e;--fr-c131:#b2c6aa;--fr-c132:#b7bfb0;--fr-c133:#b8bfb0;--fr-c134:#b4c2ad;--fr-c135:#b0c6a9;--fr-c136:#bbbeb1;--fr-c137:#4a593e;--fr-c138:#b6bdb2;--fr-c139:#b7beb1;--fr-c140:#b7beb1;--fr-c141:#98b3d7;--fr-c142:#d49d9b;--fr-c143:#a2cdaa;--fr-c144:#e4bc8b;--fr-c145:#aaaaaa;--fr-c146:#bca6ca;--fr-c147:#cbb5a4;--fr-c148:#b7c1af;--fr-c149:#b4c6a9;--fr-c150:#b6c8a7;--fr-c151:#b6c1ae;--fr-c152:#adc9a6;--fr-c153:#b7c0b0;--fr-c154:#b6c0b0;--fr-c155:#292929;--fr-c156:#b6bfb0;--fr-c157:#b8bfb0;--fr-c158:#b7c0af;--fr-c159:#aac5b6;--fr-c160:#d1b89e;--fr-c161:#a8a9c8;--fr-c162:#b6beb1;--fr-c163:#b7beb1;--fr-c164:#b7bfb0;--fr-c165:#252525;--fr-c166:#b0c5aa;--fr-c167:#b6bfb0;--fr-c168:#b7bfb0;--fr-c169:#435132;--fr-c170:#b6c0af;--fr-c171:#292929;--fr-c172:#212121;--fr-c173:#222222;--fr-c174:#b7bfb0;--fr-c175:#b1c5aa;--fr-c176:#b5c6a9;--fr-c177:#56614b;--fr-c178:#b3c7a8;--fr-c179:#202020;--fr-c180:#b4c4ac;--fr-c181:#b6c0af;--fr-c182:#b6c2ad;--fr-c183:#e0e4df;--fr-c184:#4c5c3e;--fr-c185:#b7bfb0;--fr-c186:#b7bfb0;--fr-c187:#b7c1ae;--fr-c188:#b3c5aa;--fr-c189:#b7c0af;--fr-c190:#aecaa5;--fr-c191:#b4c7a8;--fr-c192:#b7c0af;--fr-c193:#b7c0b0;--fr-c194:#b6c0b0;--fr-c195:#b7beb0;--fr-c196:#b6c0af;--fr-c197:#adcaa5;--fr-c198:#252525;--fr-c199:#b7c1af;--fr-c200:#2b271e;--fr-c201:#d0bba0;--fr-c202:#644f24;--fr-c203:#b9bdb2;--fr-c204:#cea6a2}


.fr-root{--bg:var(--fr-c01);--paper:var(--fr-c02);--ink:var(--fr-c03);--muted:var(--fr-c04);--line:var(--fr-c05);--green:var(--fr-c06);--pale:var(--fr-c07);--orange:var(--fr-c08)}.fr-root *{box-sizing:border-box}.fr-root{margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}.fr-root button,.fr-root input,.fr-root textarea{font:inherit}.fr-root button{cursor:pointer;border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:8px;padding:9px 13px;transition:.15s}.fr-root button:hover{border-color:var(--fr-c09);background:var(--fr-c10)}.fr-root button.primary{background:var(--green);color:white;border-color:var(--green)}.fr-root button.small{font-size:12px;padding:6px 9px}.fr-root button.quiet{background:transparent;border-color:transparent}.fr-root .top{height:80px;padding:0 26px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);gap:14px}.fr-root .brand{display:flex;align-items:center;gap:13px}.fr-root .logo{background:var(--green);color:var(--fr-c11);width:37px;height:42px;border-radius:12px;display:grid;place-items:center;font-family:Georgia;font-size:25px}.fr-root .eyebrow{font-size:10px;letter-spacing:2px;color:var(--muted);margin-bottom:5px}.fr-root .title{font-size:18px;font-weight:650}.fr-root .topActions{display:flex;align-items:center;gap:10px}.fr-root .demo{font-size:11px;color:var(--fr-c12);background:var(--fr-c13);padding:6px 9px;border-radius:5px}.fr-root .sub{height:43px;display:flex;align-items:center;justify-content:space-between;padding:0 26px;font-size:12px;color:var(--fr-c14);border-bottom:1px solid var(--line)}.fr-root .workspace{display:grid;grid-template-columns:minmax(290px,32fr) minmax(350px,37fr) minmax(310px,31fr);height:calc(100vh - 123px)}.fr-root .pane{min-width:0;display:flex;flex-direction:column;border-right:1px solid var(--line)}.fr-root .pane:last-child{border:0;background:var(--paper)}.fr-root .paneHead{height:66px;flex-shrink:0;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;gap:8px}.fr-root .paneHead strong{font-size:13px}.fr-root .count{font-size:11px;color:var(--muted);margin-left:8px}.fr-root .reader{overflow:auto;padding:12px 28px 35px;background:var(--paper);flex:1}.fr-root .chapter{font-family:Georgia,serif;font-size:27px;margin:16px 0 10px}.fr-root .meta{font-size:11px;color:var(--muted);margin-bottom:32px}.fr-root .paraLabel{font-size:11px;color:var(--muted);display:flex;justify-content:space-between;margin:26px 0 12px}.fr-root .french{font:20px/1.95 Georgia,"Times New Roman",serif;margin:0}.fr-root .sentence{border-radius:4px;padding:3px 0;cursor:pointer;outline:none}.fr-root .sentence:hover{background:var(--fr-c15)}.fr-root .sentence.active{background:var(--fr-c16);box-shadow:0 2px 0 var(--fr-c17)}.fr-root .sentence:focus-visible{outline:2px solid var(--green)}.fr-root .inlineActions{display:flex;gap:6px;flex-wrap:wrap;margin:18px 0}.fr-root .hint{font-size:12px;line-height:1.8;color:var(--muted)}.fr-root .translation{font-size:14px;line-height:1.9;color:var(--fr-c18);padding:16px 0;border-top:1px solid var(--line);margin-top:22px}.fr-root .graphPane{background:var(--fr-c19)}.fr-root .graphHead{border-bottom:1px solid var(--line)}.fr-root .graphViewport{flex:1;overflow:auto;background-image:radial-gradient(var(--fr-c20) 1px,transparent 1px);background-size:18px 18px;position:relative}.fr-root .graph{min-height:570px;position:relative}.fr-root .graph svg{position:absolute;left:0;top:0;pointer-events:none}.fr-root .node{position:absolute;text-align:left;width:242px;background:var(--paper);border:1px solid var(--fr-c21);box-shadow:0 3px 9px var(--fr-c22);border-radius:11px;padding:12px 14px;min-height:73px}.fr-root .node.selected{border:2px solid var(--green);box-shadow:0 0 0 4px var(--fr-c23);padding:11px 13px}.fr-root .node.root{background:var(--fr-c24)}.fr-root .nodeKind{font-size:10px;color:var(--fr-c25);display:flex;justify-content:space-between;margin-bottom:6px}.fr-root .nodeTitle{font-size:13px;font-weight:600;line-height:1.5}.fr-root .nodeStatus{font-size:10px;color:var(--fr-c26);margin-top:5px}.fr-root .plus{border-style:dashed;color:var(--green);background:var(--fr-c27);min-height:42px;text-align:center}.fr-root .legend{padding:13px 20px;font-size:11px;color:var(--muted);display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--line)}.fr-root .crumb{font-size:11px;color:var(--muted);padding:0 22px 15px;border-bottom:1px solid var(--line);line-height:1.7}.fr-root .detailScroll{padding:24px;overflow:auto;flex:1}.fr-root .detailTitle{font-size:23px;line-height:1.4;margin:0 0 12px;letter-spacing:-.5px}.fr-root .tag{font-size:10px;color:var(--green);padding:4px 7px;background:var(--pale);border-radius:4px;display:inline-block}.fr-root .quote{font:15px/1.8 Georgia,serif;border-left:2px solid var(--fr-c28);padding:9px 13px;color:var(--fr-c29);background:var(--fr-c30);margin:22px 0}.fr-root .sectionLabel{font-size:11px;font-weight:650;color:var(--fr-c31);letter-spacing:1px;margin:24px 0 9px}.fr-root .answer{font-size:14px;line-height:1.9}.fr-root .backbone{font:18px/1.6 Georgia,serif;padding:14px;background:var(--fr-c32);border-radius:9px}.fr-root .blue{color:var(--fr-c33)}.fr-root .red{color:var(--fr-c34)}.fr-root .message{border-top:1px solid var(--line);padding-top:17px;margin-top:19px}.fr-root .message.user{background:var(--fr-c35);padding:12px 14px;border:0;border-radius:9px}.fr-root .messageLabel{font-size:10px;color:var(--muted);margin-bottom:7px}.fr-root .answerActions{display:flex;gap:5px;margin-top:16px;flex-wrap:wrap}.fr-root .composer{padding:16px 20px 20px;border-top:1px solid var(--line);background:var(--paper)}.fr-root .composer textarea{width:100%;resize:vertical;min-height:75px;border:1px solid var(--line);border-radius:9px;padding:12px;background:var(--fr-c36);color:var(--ink);font-size:13px;outline:none}.fr-root .composer textarea:focus{border-color:var(--green)}.fr-root .composerFoot{display:flex;justify-content:space-between;align-items:center;margin-top:9px;gap:6px}.fr-root .composeTarget{font-size:11px;color:var(--green);margin-bottom:9px}.fr-root .empty{padding:30px 0}.fr-root .empty h2{font-size:23px}.fr-root .empty p{font-size:14px;color:var(--fr-c37);line-height:1.9}.fr-root .context{font-size:11px;color:var(--fr-c38);margin-bottom:10px}.fr-root .context summary{cursor:pointer}.fr-root .context div{line-height:1.8;padding:10px;background:var(--fr-c39);border-radius:6px;margin-top:7px}.fr-root .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--fr-c03);color:white;padding:13px 22px;border-radius:10px;font-size:13px;z-index:10;box-shadow:0 5px 25px var(--fr-c40)}.fr-root .hidden{display:none!important}.fr-root .modalBackdrop{position:fixed;inset:0;background:var(--fr-c41);display:grid;place-items:center;z-index:20;backdrop-filter:blur(3px)}.fr-root .modal{width:min(440px,90vw);padding:28px;border-radius:16px;background:var(--paper);box-shadow:0 20px 90px var(--fr-c42)}.fr-root .modal h2{font-size:22px;margin:0 0 12px}.fr-root .modal input{width:100%;padding:12px;border:1px solid var(--line);border-radius:8px;margin:12px 0 20px}.fr-root .modalFoot{display:flex;justify-content:flex-end;gap:8px}.fr-root .selectionBar{padding:10px;background:var(--fr-c43);border-radius:8px;margin:14px 0;font-size:12px;line-height:1.7}.fr-root .selectionBar button{margin-top:8px}.fr-root .mobileTabs{display:none}@container (min-width:1500px) {.fr-root .reader{padding:12px 45px}.fr-root .detailScroll{padding:30px}.fr-root .french{font-size:23px}}@container (max-width:1080px) {.fr-root .workspace{grid-template-columns:minmax(270px,1fr) minmax(340px,1fr)}.fr-root .graphPane{display:none}.fr-root .workspace.showGraph .readerPane{display:none}.fr-root .workspace.showGraph .graphPane{display:flex}.fr-root .mobileTabs{display:inline-block}.fr-root .top{padding:0 16px}.fr-root .topActions .demo{display:none}.fr-root .title{font-size:15px}}@container (max-width:650px) {.fr-root .top{height:73px}.fr-root .sub{height:50px;padding:0 14px;line-height:1.6}.fr-root .workspace{height:auto;display:flex;flex-direction:column}.fr-root .pane{min-height:450px;max-height:75vh;border-bottom:1px solid var(--line)}.fr-root .graphPane{display:flex}.fr-root .workspace.showGraph .readerPane{display:flex}.fr-root .mobileTabs{display:none}.fr-root .topActions{gap:4px}.fr-root .topActions button{font-size:11px;padding:8px}.fr-root .topActions .model{display:none}.fr-root .reader{padding:10px 24px}.fr-root .detailPane{min-height:630px}.fr-root .sub>span:last-child{display:none}}

/* v2: semantic zoom; one working surface at a time. */
.fr-root{height:100dvh;overflow:hidden}.fr-root .top{height:67px;background:var(--paper)}.fr-root .logo{width:29px;height:34px;font-size:22px;border-radius:8px}.fr-root .brand .eyebrow{display:none}.fr-root .title{font-size:14px;font-weight:600}.fr-root .topActions .model{display:none}.fr-root .demo{background:transparent;color:var(--fr-c44);font-size:10px}.fr-root .sub{height:52px;padding:0 max(24px,calc((100cqw - 1100px)/2));gap:10px;background:var(--paper)}.fr-root .viewModes{display:flex;gap:3px;background:var(--fr-c45);padding:3px;border-radius:9px}.fr-root .viewModes button{border:0;background:transparent;padding:7px 13px;font-size:12px;color:var(--fr-c46)}.fr-root .viewModes button[aria-pressed="true"]{background:var(--paper);color:var(--ink);box-shadow:0 1px 4px var(--fr-c47)}.fr-root .workspace{display:block!important;position:relative;height:calc(100dvh - 119px);overflow:hidden;background:var(--fr-c48)}.fr-root .workspace>.pane{display:none!important;position:absolute;inset:0;border:0;max-height:none;min-height:0;background:transparent}.fr-root .workspace[data-view="focus"]>.detailPane,.fr-root .workspace[data-view="source"]>.readerPane,.fr-root .workspace[data-view="map"]>.graphPane{display:flex!important;animation:fr-appear .2s ease-out}@keyframes fr-appear{from{opacity:.3;transform:scale(.985)}to{opacity:1;transform:scale(1)}}@media(prefers-reduced-motion:reduce){.fr-root .workspace>.pane{animation:fr-none!important}}
.fr-root .detailPane .paneHead,.fr-root .detailPane .crumb,.fr-root .detailPane .detailScroll,.fr-root .detailPane .composer,.fr-root .detailPane .branchStrip{width:min(100%,860px);margin-left:auto;margin-right:auto;background:var(--paper)}.fr-root .detailPane .paneHead{height:57px;padding:14px 38px;border-left:1px solid var(--fr-c49);border-right:1px solid var(--fr-c49)}.fr-root .detailPane .crumb{padding:0 38px 14px;color:var(--fr-c50);font-size:11px}.fr-root .detailScroll{padding:30px 54px 55px;border-left:1px solid var(--fr-c49);border-right:1px solid var(--fr-c49)}.fr-root .detailTitle{font-size:22px;font-weight:550;margin-bottom:10px}.fr-root .detailScroll .quote{font-size:calc(24px * var(--reading-scale,1));line-height:1.85;background:none;border:0;padding:0;margin:20px 0 30px;color:var(--fr-c51)}.fr-root .detailScroll .answer{font-size:calc(16px * var(--reading-scale,1));line-height:1.95}.fr-root .detailScroll .sectionLabel{font-size:11px;margin-top:27px}.fr-root .detailScroll .backbone{font-size:calc(20px * var(--reading-scale,1));padding:18px 22px}.fr-root .detailPane .composer{padding:14px 38px 20px}.fr-root .detailPane .composer textarea{min-height:68px}.fr-root .detailPane .composeTarget{font-size:11px}.fr-root .composerFoot .hint{font-size:10px}.fr-root .branchStrip{display:flex;gap:7px;overflow:auto;padding:11px 38px;border-bottom:1px solid var(--line);flex-shrink:0}.fr-root .branchStrip:empty{display:none}.fr-root .branchStrip button{font-size:11px;padding:6px 9px;white-space:nowrap;background:transparent;border-color:var(--fr-c52)}.fr-root .branchStrip button.active{background:var(--pale);border-color:var(--fr-c53)}.fr-root .sentenceControls{display:flex;align-items:center;gap:9px;font-size:11px;color:var(--fr-c54)}.fr-root .sentenceControls button{padding:4px 9px}.fr-root button:disabled{opacity:.35;cursor:default}.fr-root .focusTools{display:flex;gap:3px;align-items:center}.fr-root .focusTools button{font-size:11px}.fr-root .workspace[data-view="source"] .readerPane{align-items:center}.fr-root .readerPane .paneHead{width:min(860px,100%);padding:18px 32px;background:var(--paper)}.fr-root .reader{flex:1;width:min(860px,100%);padding:35px 64px;background:var(--paper)}.fr-root .reader .chapter{font-size:29px}.fr-root .reader .french{font-size:24px;line-height:2}.fr-root .reader .meta{margin-bottom:25px}.fr-root .reader .hint{display:none}.fr-root .reader .inlineActions{margin-top:25px}.fr-root .graphPane .graphHead{height:58px;background:var(--paper);padding:12px max(24px,calc((100cqw - 1000px)/2));flex-shrink:0}.fr-root .graphViewport{width:100%;padding:20px 24px 80px}.fr-root .graph{margin:0 auto;width:max-content;transform-origin:top center}.fr-root .legend{background:var(--paper);justify-content:center}.fr-root .node{width:270px}.fr-root .node.root{background:var(--fr-c24)}.fr-root .empty{padding-top:8px}.fr-root .empty .quote{margin-top:14px}.fr-root .empty .answerActions{margin-top:30px}.fr-root .modal .eyebrow{display:none}.fr-root .modal h2{font-size:20px}.fr-root .modal .hint:empty{display:none}.fr-root .top #start{font-size:12px;padding:8px 13px}.fr-root .mobileTabs{display:none!important}.fr-root .translation{line-height:2.1}.fr-root .mapTools{display:flex;gap:6px;align-items:center}.fr-root .mapTools span{font-size:11px;min-width:35px;text-align:center;color:var(--fr-c55)}
@container (max-width:650px) {.fr-root .top{height:58px;padding:0 14px}.fr-root .top .demo{display:none}.fr-root .sub{height:54px;padding:0 12px}.fr-root .sub>span:last-child{display:block}.fr-root .workspace{height:calc(100dvh - 112px)}.fr-root .sub .progressWrap{display:none}.fr-root .detailPane .paneHead{padding:12px 20px}.fr-root .detailPane .crumb{padding:0 20px 12px}.fr-root .detailScroll{padding:22px 24px 40px}.fr-root .detailPane .composer{padding:12px 20px}.fr-root .branchStrip{padding:10px 20px}.fr-root .detailScroll .quote{font-size:calc(21px * var(--reading-scale,1))}.fr-root .reader{padding:22px 25px}.fr-root .reader .french{font-size:21px}.fr-root .readerPane .paneHead{padding:16px 22px}.fr-root .graphPane .graphHead{padding:12px 18px}.fr-root .graphViewport{padding:18px 10px 60px}.fr-root .demo{display:none}.fr-root .title{font-size:13px}}

/* v3: a zoomable text/route plane beside a stable reading surface. */
.fr-root{background:var(--paper);container-type:inline-size;container-name:fr}.fr-root .top,.fr-root .sub{background:var(--paper)}.fr-root .sub{padding:0 26px}.fr-root .workspace{background:var(--paper)}.fr-root .workspace>.readerPane,.fr-root .workspace>.graphPane{display:none!important}.fr-root .workspace>.detailPane{display:flex!important;left:auto!important;right:30px!important;width:min(780px,calc(100cqw - 88px));animation:fr-none!important;border:0}.fr-root .detailPane .paneHead,.fr-root .detailPane .crumb,.fr-root .detailPane .detailScroll,.fr-root .detailPane .composer,.fr-root .detailPane .branchStrip{width:100%;border-left:0;border-right:0;background:transparent}.fr-root .detailScroll{padding:28px 44px 50px}.fr-root .detailScroll .backbone{background:none;border-radius:0;border-left:2px solid var(--fr-c56);padding:4px 0 4px 18px}.fr-root .message.user{background:none;border-radius:0;border-left:2px solid var(--fr-c56);padding:5px 0 5px 16px}.fr-root .branchStrip button{border-radius:0;border:0;border-bottom:1px solid transparent}.fr-root .branchStrip button.active{background:none;border-bottom-color:var(--green)}.fr-root .tag{background:none;padding:0;color:var(--fr-c57)}.fr-root .focusTools button{border-radius:0}.fr-root .navToggle{background:none;border:0;padding:6px 0;font-size:12px;color:var(--fr-c58)}.fr-root .navigation{position:absolute;top:0;bottom:0;left:0;right:834px;border-right:1px solid var(--fr-c59);background:var(--fr-c60);display:flex;flex-direction:column;z-index:2;transition:opacity .15s}.fr-root .navigation.closed{display:none}.fr-root .navHead{height:56px;display:flex;align-items:center;justify-content:space-between;padding:12px 17px;font-size:11px;color:var(--fr-c61);gap:5px;border-bottom:1px solid var(--fr-c62)}.fr-root .navHead button{border:0;background:none;padding:5px 7px;border-radius:0;font-size:12px}.fr-root .navHead .controls{display:flex;align-items:center;gap:1px}.fr-root .navStage{position:relative;overflow:hidden;flex:1;cursor:grab;touch-action:none;outline:none}.fr-root .navStage:active{cursor:grabbing}.fr-root .navStage:focus-visible{box-shadow:inset 0 0 0 1px var(--fr-c63)}.fr-root .navWorld{position:absolute;left:0;top:0;width:1700px;height:1800px;transform-origin:0 0;will-change:transform}.fr-root .navWorld svg{position:absolute;left:0;top:0;pointer-events:none}.fr-root .navText{position:absolute;border:0;border-radius:0;background:none!important;box-shadow:none!important;text-align:left;padding:0;line-height:1.7;cursor:pointer;white-space:normal}.fr-root .navText:hover{color:var(--green)}.fr-root .navText.active{color:var(--green)}.fr-root .navText.active .routeTitle,.fr-root .navText.active .sourceText{text-decoration:underline;text-decoration-color:var(--fr-c64);text-underline-offset:6px;text-decoration-thickness:1px}.fr-root .sourceText{font-family:Georgia,serif;font-size:23px;font-weight:400}.fr-root .navNumber{font:10px/2 sans-serif;color:var(--fr-c65);letter-spacing:1px;margin-bottom:7px}.fr-root .routeTitle{font-size:16px;font-weight:400}.fr-root .routeMeta{font-size:10px;color:var(--fr-c66);margin-top:3px}.fr-root .navCaption{position:absolute;font-size:11px;color:var(--fr-c67);letter-spacing:2px}.fr-root .navFoot{height:35px;display:flex;align-items:center;justify-content:space-between;padding:0 17px;border-top:1px solid var(--fr-c62);font-size:10px;color:var(--fr-c68)}.fr-root .navFoot button{border:0;background:none;padding:4px;font-size:10px}.fr-root .selectionTools{margin-top:15px}.fr-root .navRail{position:absolute;top:20px;left:14px;writing-mode:vertical-rl;font-size:11px;letter-spacing:2px;background:none;border:0;color:var(--fr-c69);padding:10px;z-index:1}.fr-root .detailPane .quote{font-size:24px!important}.fr-root .detailPane .answer{font-size:16px!important}.fr-root .detailPane .backbone{font-size:20px!important}.fr-root .detailPane .composer{background:var(--paper)}
@container (max-width:1190px) {.fr-root .navigation{right:auto;width:min(540px,calc(100cqw - 55px));background:var(--fr-c70);box-shadow:12px 0 24px var(--fr-c71)}.fr-root .workspace>.detailPane{right:20px!important;width:min(780px,calc(100cqw - 75px))}}
@container (max-width:650px) {.fr-root .workspace>.detailPane{right:0!important;width:calc(100cqw - 34px)}.fr-root .detailScroll{padding:20px 20px 40px}.fr-root .detailPane .paneHead,.fr-root .detailPane .crumb,.fr-root .detailPane .branchStrip{padding-left:20px;padding-right:20px}.fr-root .navRail{left:0;padding:9px}.fr-root .detailPane .quote{font-size:21px!important}.fr-root .navigation{width:calc(100cqw - 35px)}.fr-root .sub{padding:0 14px}}

/* v4: continuous named paragraphs, independent camera gestures. */
.fr-root .navStage{overscroll-behavior:none}.fr-root .paragraphCard{position:absolute;width:420px;border:1px solid var(--fr-c72);border-radius:9px;background:var(--fr-c02);overflow:hidden}.fr-root .paragraphHeading{height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;border-bottom:1px solid var(--fr-c45);gap:12px}.fr-root .paragraphHeading button,.fr-root .chapterHeading button{border:0;background:none;text-align:left;padding:0;color:var(--fr-c73);border-radius:0}.fr-root .paragraphHeading button{font-size:14px;max-width:310px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fr-root .paragraphHeading .renameIcon{font-size:12px;color:var(--fr-c74);flex-shrink:0}.fr-root .paragraphSentence{width:100%;display:flex;gap:13px;padding:18px 21px;border:0;border-bottom:1px solid var(--fr-c45);border-radius:0;background:transparent;text-align:left;align-items:flex-start}.fr-root .paragraphSentence:last-child{border-bottom:0}.fr-root .paragraphSentence:hover{background:var(--fr-c75)}.fr-root .paragraphSentence.active{background:var(--fr-c76);box-shadow:inset 3px 0 var(--fr-c77)}.fr-root .paragraphSentence .lineNumber{font:10px/2.7 sans-serif;color:var(--fr-c78);flex-shrink:0}.fr-root .paragraphSentence .sourceText{font-size:22px;line-height:1.75}.fr-root .chapterHeading{position:absolute;display:flex;align-items:center;gap:12px;width:420px;height:54px}.fr-root .chapterHeading .chapterNumber{font-size:11px;color:var(--fr-c79);letter-spacing:2px}.fr-root .chapterHeading button{font-size:19px;font-family:Georgia,serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px}.fr-root .chapterHeading .chapterEdit{font:12px sans-serif;color:var(--fr-c80)}.fr-root .navStage.panning,.fr-root .navStage.panning *{cursor:grabbing!important;user-select:none}.fr-root .navSentenceTrail{font-size:11px;color:var(--fr-c81)}.fr-root .paragraphLinkLabel{font-size:9px;fill:var(--fr-c82);letter-spacing:1px}

/* v5: the reading column never becomes a squeezed third column. */
.fr-root{display:flex;flex-direction:column;height:100dvh;min-width:280px}.fr-root .top{flex:0 0 62px;height:auto}.fr-root .sub{flex:0 0 46px;height:auto}.fr-root .workspace{flex:1;min-height:0;height:auto!important}.fr-root .paneHead,.fr-root .crumb,.fr-root .branchStrip,.fr-root .composer{flex-shrink:0}.fr-root .detailScroll{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.fr-root .detailPane .crumb{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fr-root .detailPane .composer textarea{max-height:min(150px,24dvh)}.fr-root .branchStrip{scrollbar-width:thin;overscroll-behavior-x:contain}.fr-root .navigation{min-height:0}.fr-root .navStage{min-height:0}.fr-root .navHead,.fr-root .navFoot{flex-shrink:0}.fr-root .navHead .controls button{min-width:34px;min-height:34px}.fr-root .navBackdrop{display:none;position:absolute;inset:0;background:var(--fr-c83);border:0;border-radius:0;z-index:8;cursor:default}.fr-root .navBackdrop:hover{background:var(--fr-c83);border:0}.fr-root .sheetHandle{display:none}.fr-root .topActions{flex-shrink:0}.fr-root .brand{min-width:0}.fr-root .title{white-space:nowrap}.fr-root .composerFoot{flex-wrap:wrap}.fr-root .modal{max-height:calc(100dvh - 32px);overflow:auto}.fr-root .modalBackdrop{padding:16px}.fr-root .navHead strong{font-size:11px;font-weight:400}.fr-root .navHead .controls{flex-shrink:0}.fr-root .navFoot{padding-bottom:env(safe-area-inset-bottom,0px);height:calc(35px + env(safe-area-inset-bottom,0px))}
@container (max-width:1190px), (max-aspect-ratio:1/1) {
 .fr-root .workspace>.detailPane{right:max(0px,calc((100cqw - 780px)/2))!important;width:min(780px,100cqw);left:auto!important}.fr-root .navRail{display:none}.fr-root .detailScroll{padding:24px clamp(20px,5vw,46px) 40px}.fr-root .detailPane .paneHead{padding:12px clamp(20px,5vw,38px)}.fr-root .detailPane .crumb{padding:0 clamp(20px,5vw,38px) 12px}.fr-root .detailPane .branchStrip{padding:10px clamp(20px,5vw,38px)}.fr-root .detailPane .composer{padding:12px clamp(16px,4vw,38px) max(16px,env(safe-area-inset-bottom))}.fr-root .navigation{position:absolute;top:max(38px,12%);bottom:0;left:50%;right:auto;width:min(760px,100%);transform:translateX(-50%);background:var(--fr-c60);border:1px solid var(--fr-c84);border-bottom:0;border-radius:14px 14px 0 0;box-shadow:0 -8px 38px var(--fr-c85);z-index:10;overflow:hidden}.fr-root .sheetHandle{display:block;width:34px;height:3px;border-radius:3px;background:var(--fr-c86);margin:9px auto 0;flex-shrink:0}.fr-root .navHead{height:49px;padding:6px 14px}.fr-root .navFoot{font-size:10px}.fr-root .workspace[data-navigation="open"]>.navBackdrop{display:block}.fr-root .navStage{touch-action:none}.fr-root .top #start{min-width:52px}.fr-root .navToggle{min-height:36px}
}
@container (max-width:480px) {.fr-root .top{flex-basis:54px;padding:0 15px}.fr-root .sub{flex-basis:44px;padding:0 15px}.fr-root .top .demo{display:none}.fr-root .detailPane .paneHead{height:48px}.fr-root .detailPane .quote{font-size:21px!important;line-height:1.8}.fr-root .detailPane .answer{font-size:15px!important}.fr-root .detailPane .backbone{font-size:18px!important}.fr-root .detailTitle{font-size:20px}.fr-root .composer textarea{font-size:16px}.fr-root .detailPane .composer textarea{min-height:58px}.fr-root .navHead .controls button{min-width:38px;min-height:38px}.fr-root .detailScroll{padding-top:20px}.fr-root .sentenceControls button{min-width:36px;min-height:32px}.fr-root .navHead{height:51px}}
@media(max-height:560px){.fr-root .top{flex-basis:45px}.fr-root .sub{flex-basis:38px}.fr-root .detailPane .paneHead{height:40px;padding-top:6px;padding-bottom:6px}.fr-root .detailPane .branchStrip{padding-top:6px;padding-bottom:6px}.fr-root .detailPane .composer{padding-top:8px;padding-bottom:8px}.fr-root .detailPane .composer textarea{min-height:42px;max-height:85px}.fr-root .context{margin-bottom:6px}.fr-root .detailScroll{padding-top:16px}.fr-root .navigation{top:0}.fr-root .sheetHandle{display:none}}
@media(prefers-reduced-motion:reduce){.fr-root *{scroll-behavior:auto!important}.fr-root .navigation{transition:none}}

/* Knowledge uses the same reading surface, not another permanent column. */
.fr-root .knowledgeTop{font-size:12px;background:none;border:0;padding:8px 10px}.fr-root .readingActions{display:flex;align-items:center;gap:8px;padding:9px 38px;border-bottom:1px solid var(--fr-c87);flex-shrink:0;min-height:42px}.fr-root .readingActions button{font-size:11px;padding:5px 8px;background:none;border:0}.fr-root .selectedWord{font:15px Georgia,serif;color:var(--green);max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fr-root .kbBar{display:flex;align-items:center;gap:12px;margin-bottom:24px;flex-wrap:wrap}.fr-root .kbBar button,.fr-root .kbTabs button{background:none;border:0;border-bottom:1px solid transparent;border-radius:0;padding:8px 0;font-size:13px}.fr-root .kbTabs{display:flex;gap:24px}.fr-root .kbTabs button.active{border-bottom-color:var(--green);color:var(--green)}.fr-root .kbSearch{display:flex;gap:8px;margin:22px 0 16px;flex-wrap:wrap}.fr-root .kbSearch input{flex:1;min-width:140px}.fr-root .kbInput,.fr-root .kbSearch input,.fr-root .kbSearch select,.fr-root .kbField textarea,.fr-root .kbField input,.fr-root .kbField select{border:1px solid var(--line);border-radius:6px;padding:9px 11px;background:var(--paper);color:var(--ink);font:13px inherit;max-width:100%}.fr-root .kbSearch select{max-width:130px}.fr-root .kbRows{border-top:1px solid var(--line)}.fr-root .kbRow{display:grid;grid-template-columns:minmax(0,1fr) 90px 55px;align-items:center;gap:12px;width:100%;padding:17px 0;border:0;border-bottom:1px solid var(--line);border-radius:0;background:none!important;text-align:left}.fr-root .kbRow .name{font-size:16px}.fr-root .kbRow .subline{font-size:11px;color:var(--muted);margin-top:5px}.fr-root .kbStatus{font-size:11px;color:var(--fr-c88);text-align:right}.fr-root .kbIntro{font-size:12px;line-height:1.8;color:var(--muted);margin:8px 0 22px}.fr-root .kbWord{font:34px/1.3 Georgia,serif;margin:0 0 8px}.fr-root .kbField{display:block;margin:18px 0;color:var(--fr-c89);font-size:11px}.fr-root .kbField span{display:block;margin-bottom:7px}.fr-root .kbField textarea{width:100%;min-height:86px;resize:vertical;line-height:1.8}.fr-root .kbMeta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0;font-size:12px;color:var(--fr-c90)}.fr-root .kbMeta select{font-size:12px;padding:5px 8px;border:1px solid var(--line);background:transparent;border-radius:5px}.fr-root .kbExample{border-top:1px solid var(--line);padding:17px 0}.fr-root .kbExample .fr{font:17px/1.8 Georgia,serif;margin:9px 0}.fr-root .kbExample .zh{font-size:12px;color:var(--fr-c91);line-height:1.8}.fr-root .kbExample .small{margin-top:9px}.fr-root .kbSection{margin:24px 0;border-top:1px solid var(--line);padding-top:14px;font-size:14px;line-height:1.9}.fr-root .kbSection summary{font-size:12px;color:var(--fr-c92);cursor:pointer}.fr-root .kbSection p{margin:10px 0}.fr-root .kbLabel{font-size:10px;color:var(--fr-c93);letter-spacing:1px}.fr-root .kbModal{max-width:520px;width:90vw}.fr-root .kbModal input,.fr-root .kbModal textarea{margin:6px 0 12px}.fr-root .grammarMatches{max-height:160px;overflow:auto;margin:8px 0 12px;border-top:1px solid var(--line)}.fr-root .grammarMatch{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);border-radius:0;padding:10px 0;font-size:12px}.fr-root .grammarMatch.active{color:var(--green);font-weight:600}.fr-root .grammarSource{font:14px/1.7 Georgia,serif;color:var(--fr-c94);max-height:88px;overflow:auto}.fr-root .kbEmpty{font-size:13px;color:var(--fr-c95);padding:28px 0}.fr-root .relatedEntry{padding:12px 0;border-bottom:1px solid var(--line);font-size:12px;color:var(--fr-c96)}.fr-root .kbDangerless{font-size:11px;color:var(--fr-c97)}.fr-root .kbReturn{font-size:12px!important;color:var(--fr-c98)!important}.fr-root .readingPaneKnowledge .branchStrip,.fr-root .readingPaneKnowledge .readingActions,.fr-root .readingPaneKnowledge .sentenceControls,.fr-root .readingPaneKnowledge .focusTools{display:none!important}.fr-root .readingPaneKnowledge .paneHead{height:18px}.fr-root .kbModal .modalFoot{margin-top:18px}.fr-root .knowledgeSourceNote{margin:7px 0;color:var(--fr-c99);font-size:11px}@container (max-width:650px) {.fr-root .readingActions{padding:8px 20px;gap:4px}.fr-root .kbRow{grid-template-columns:minmax(0,1fr) 70px 45px;gap:6px}.fr-root .kbWord{font-size:29px}.fr-root .kbSearch{gap:6px}.fr-root .kbSearch input,.fr-root .kbField textarea,.fr-root .kbModal input,.fr-root .kbModal textarea{font-size:16px}.fr-root .knowledgeTop{padding:8px 6px;font-size:11px}.fr-root .kbSearch select{font-size:12px;max-width:100px}.fr-root .kbBar{gap:8px}.fr-root .readingActions .selectedWord{max-width:38%}}

/* Detailed language entries: readable sections, not a wall of cards. */
.fr-root .entryIndex{display:flex;flex-wrap:wrap;gap:6px 17px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:11px 0;margin:22px 0}.fr-root .entryIndex button{border:0;background:none;padding:3px 0;font-size:11px;color:var(--fr-c100)}.fr-root .entrySection{margin:29px 0;scroll-margin-top:20px}.fr-root .entryHeading{font-size:13px;font-weight:600;color:var(--fr-c101);margin:0 0 15px}.fr-root .entryHeading .num{font-size:10px;color:var(--fr-c102);margin-right:9px;font-weight:400}.fr-root .entryBody{font-size:14px;line-height:1.95;color:var(--fr-c103)}.fr-root .entryBody p{margin:8px 0}.fr-root .entrySenses{padding-left:22px;margin:0}.fr-root .entrySenses li{padding:0 0 17px 5px}.fr-root .entrySenses strong{font-weight:550;color:var(--fr-c104)}.fr-root .frExample{font:17px/1.85 Georgia,serif;margin:7px 0 2px!important}.fr-root .zhExample{font-size:12px;color:var(--fr-c99);line-height:1.8;margin:0!important}.fr-root .senseTag{font-size:10px;color:var(--fr-c105);font-weight:400;margin-left:8px}.fr-root .morphSteps{border-left:1px solid var(--fr-c106);margin:15px 0 20px 5px;padding-left:23px}.fr-root .morphStep{padding:3px 0 18px;position:relative}.fr-root .morphStep:before{content:'';position:absolute;width:5px;height:5px;border-radius:50%;background:var(--fr-c107);left:-26px;top:11px}.fr-root .morphStep:last-child{padding-bottom:0}.fr-root .stepLabel{font-size:10px;color:var(--fr-c108);letter-spacing:.5px;margin-bottom:6px}.fr-root .morphFormula{font:21px/1.65 Georgia,serif;color:var(--fr-c109)}.fr-root .morphStem{color:var(--fr-c110)}.fr-root .morphEnding{color:var(--fr-c111);border-bottom:1px solid var(--fr-c112)}.fr-root .morphAux{color:var(--fr-c113)}.fr-root .morphNote{font-size:12px;line-height:1.85;color:var(--fr-c114);margin-top:8px}.fr-root .morphTableWrap{overflow-x:auto;max-width:100%;margin-top:11px}.fr-root .morphTable{border-collapse:collapse;width:100%;font-size:13px;text-align:left}.fr-root .morphTable th{font-size:10px;color:var(--fr-c115);font-weight:400;padding:8px 9px;border-bottom:1px solid var(--fr-c116)}.fr-root .morphTable td{padding:10px 9px;border-bottom:1px solid var(--fr-c117);line-height:1.55}.fr-root .morphTable .form{font:17px Georgia,serif}.fr-root .morphTable tr.inputForm{background:var(--fr-c118)}.fr-root .inputMarker{font:9px sans-serif;color:var(--fr-c119);margin-left:5px;white-space:nowrap}.fr-root .structureParts{display:flex;flex-wrap:wrap;gap:12px 15px;margin:15px 0}.fr-root .structurePart{display:flex;flex-direction:column;border-bottom:1px solid var(--fr-c120);padding:6px 0 9px}.fr-root .structurePart b{font:18px Georgia,serif;font-weight:400;color:var(--fr-c121)}.fr-root .structurePart small{font-size:10px;color:var(--fr-c122);margin-top:8px;max-width:170px;line-height:1.6}.fr-root .entryRule{font:21px/1.8 Georgia,serif;border-left:2px solid var(--fr-c123);padding-left:18px;margin:16px 0 22px}.fr-root .entryList{padding-left:20px;margin:9px 0}.fr-root .entryList li{margin:7px 0}.fr-root .contrastPair{display:grid;grid-template-columns:1fr 1fr;gap:24px;border-top:1px solid var(--line);padding:17px 0}.fr-root .contrastName{font-size:11px;color:var(--fr-c124);margin-bottom:9px}.fr-root .contrastPair p{margin:5px 0}.fr-root .timeline{display:flex;align-items:center;gap:12px;margin:17px 0;font-size:12px;color:var(--fr-c125);flex-wrap:wrap}.fr-root .timeline .line{flex:1;min-width:25px;height:1px;background:var(--fr-c126);position:relative}.fr-root .timeline .line:after{content:'›';position:absolute;right:-1px;top:-11px;font-size:20px}.fr-root .entryFold{border-top:1px solid var(--line);margin:20px 0;padding-top:13px}.fr-root .entryFold summary{font-size:12px;color:var(--fr-c127);cursor:pointer}.fr-root .entryFold .entryBody{margin:12px 0;font-size:13px}.fr-root .entrySource{font-size:10px;color:var(--fr-c128);border-top:1px solid var(--line);padding-top:15px;margin-top:25px}.fr-root .missingSection{font-size:12px;color:var(--fr-c129);line-height:1.8}.fr-root .entryCrossLink{background:none;border:0;border-bottom:1px solid var(--fr-c130);border-radius:0;padding:0;color:var(--fr-c131);font:inherit;cursor:pointer}.fr-root .detailScroll .entrySection .quote{font-size:20px!important}.fr-root .entryContext{padding:12px 0;border-top:1px solid var(--line);margin-top:20px}.fr-root .entryContext .kbLabel{margin-bottom:7px}.fr-root .smallExplain{font-size:12px;color:var(--fr-c132);line-height:1.9}.fr-root .entryMetaGrid{display:grid;grid-template-columns:75px 1fr;gap:8px 14px;font-size:12px;line-height:1.8;margin:18px 0}.fr-root .entryMetaGrid dt{color:var(--fr-c133)}.fr-root .entryMetaGrid dd{margin:0;color:var(--fr-c134)}@container (max-width:500px) {.fr-root .contrastPair{grid-template-columns:1fr;gap:15px}.fr-root .morphSteps{padding-left:17px}.fr-root .morphStep:before{left:-20px}.fr-root .morphTable th,.fr-root .morphTable td{padding:8px 5px}.fr-root .morphTable .form{font-size:15px}.fr-root .morphFormula,.fr-root .entryRule{font-size:19px}.fr-root .structureParts{gap:8px 12px}.fr-root .structurePart b{font-size:17px}.fr-root .entryBody{font-size:14px}.fr-root .frExample{font-size:16px}.fr-root .entryIndex{gap:5px 14px}.fr-root .entryMetaGrid{grid-template-columns:60px 1fr;gap:7px 10px}}

/* Local output policies and opt-in syntax signals. */
.fr-root .conjugationTree{font:13px/1.9 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:14px 0;padding:15px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);color:var(--fr-c135);tab-size:2}.fr-root .policyNote{font-size:11px;line-height:1.85;color:var(--fr-c136);margin:9px 0}.fr-root .syntaxLegend{border-left:2px solid var(--fr-c137);padding:10px 13px;margin:8px 0 23px;font:11px/1.9 sans-serif;display:flex;flex-wrap:wrap;gap:3px 14px;color:var(--fr-c138)}.fr-root .syntaxLegend .legendHead{flex-basis:100%;color:var(--fr-c139);display:flex;justify-content:space-between}.fr-root .syntaxLegend button{border:0;background:none;font-size:10px;color:var(--fr-c140);padding:0}.fr-root .syn-subject{color:var(--fr-c141);font-weight:700}.fr-root .syn-verb{color:var(--fr-c142);font-weight:700}.fr-root .syn-object{color:var(--fr-c143)}.fr-root .syn-predicative{color:var(--fr-c144)}.fr-root .syn-adverbial{color:var(--fr-c145)}.fr-root .syn-infinitive{color:var(--fr-c146)}.fr-root .syn-modifier{color:var(--fr-c147)}.fr-root .syn-clause{text-decoration-line:underline;text-decoration-thickness:1px;text-underline-offset:.2em}.fr-root .syntaxActive{color:var(--green)!important;border-bottom:1px solid var(--green)!important}.fr-root .syntaxPlain{font-style:normal}.fr-root .grammarFieldGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.fr-root .grammarFieldGrid .kbField{margin:4px 0}.fr-root .grammarFieldGrid select{width:100%;min-height:36px}.fr-root .grammarFieldGrid select[multiple]{height:95px}.fr-root .fieldProjection{font-size:12px;line-height:1.8;display:grid;grid-template-columns:minmax(90px,30%) 1fr;gap:9px 14px}.fr-root .fieldProjection dt{color:var(--fr-c148)}.fr-root .fieldProjection dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--fr-c149)}.fr-root .entryBody.preserveLines{white-space:pre-line}.fr-root .writeReceipt{border-left:2px solid var(--fr-c150);margin:16px 0;padding:7px 12px;font-size:11px;line-height:1.8;color:var(--fr-c151)}.fr-root .writeReceipt button{font-size:11px;border:0;background:none;padding:0;color:var(--fr-c152)}.fr-root .readingActions{flex-wrap:wrap}.fr-root .clauseDemo{margin:13px 0;font-style:normal;font-family:Georgia,serif;line-height:2.1}.fr-root .entrySenses em{font-style:italic}.fr-root .entrySection .lexemeExtra{font-size:12px;color:var(--fr-c153);margin:12px 0}.fr-root .knowledgeChangesLabel{font-size:10px;color:var(--fr-c154);margin-bottom:4px}@container (max-width:500px) {.fr-root .conjugationTree{font-size:11px;line-height:1.9}.fr-root .fieldProjection{grid-template-columns:85px 1fr;gap:8px}.fr-root .grammarFieldGrid{grid-template-columns:1fr}.fr-root .syntaxLegend{font-size:10px;gap:3px 10px}.fr-root .readingActions button{font-size:10px;padding:4px 5px}}

/* Per-sentence speech controls; no audio provider is connected yet. */
.fr-root .paragraphSentenceRow{border-bottom:1px solid var(--fr-c155)}.fr-root .paragraphSentenceRow:last-child{border-bottom:0}.fr-root .paragraphSentenceRow .paragraphSentence{border-bottom:0}.fr-root .sentenceAudioMini{height:32px;padding:0 20px 5px 42px;display:flex;gap:12px;align-items:center}.fr-root .sentenceAudioMini button{padding:3px 0;border:0;border-radius:0;background:none;font-size:11px;color:var(--fr-c156)}.fr-root .sentenceAudioMini span,.fr-root .audioUnavailable{font:9px/1.5 sans-serif;color:var(--fr-c157)}.fr-root .readingActions .audioGroup{display:flex;gap:4px;align-items:center;margin-left:auto}.fr-root .readingActions .audioGroup button{white-space:nowrap}.fr-root .audioUnavailable{font-size:10px}.fr-root .baseCountLabel{font-size:11px;color:var(--fr-c158);margin:8px 0}@container (max-width:500px) {.fr-root .readingActions .audioGroup{margin-left:0}.fr-root .readingActions .audioUnavailable{display:none}.fr-root .sentenceAudioMini button{font-size:12px}}

/* Conjugation is an interactive visual mapping, not a code block. */
.fr-root .conjView{--base-0:var(--fr-c159);--base-1:var(--fr-c160);--base-2:var(--fr-c161);margin:22px 0 34px}.fr-root .conjTop{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:27px}.fr-root .conjTense{font-size:11px;letter-spacing:1.7px;color:var(--fr-c162)}.fr-root .conjCount{font-size:10px;color:var(--fr-c163);margin-top:5px}.fr-root .conjMode{display:flex;gap:4px;flex-shrink:0}.fr-root .conjMode button{border:0;border-radius:5px;background:none;padding:5px 9px;font-size:11px;color:var(--fr-c164)}.fr-root .conjMode button[aria-pressed="true"]{background:var(--fr-c165);color:var(--fr-c166)}.fr-root .conjBaseRail{display:grid;grid-template-columns:repeat(var(--base-count),minmax(0,1fr));gap:12px}.fr-root .conjBase{background:none!important;border:0;border-radius:0;text-align:center;padding:8px 0 14px;min-width:0;position:relative;transition:opacity .15s}.fr-root .conjBase:after{content:'';display:block;width:28px;height:2px;background:var(--base-color);margin:14px auto 0;transition:width .15s}.fr-root .conjBase[aria-pressed="true"]:after{width:55%}.fr-root .conjBaseNumber{display:block;font-size:9px;letter-spacing:1.5px;color:var(--base-color);margin-bottom:11px}.fr-root .conjBaseSound{display:block;font:32px/1.15 Georgia,'Times New Roman',serif;color:var(--base-color);font-weight:400}.fr-root .conjBasePeople{display:block;font-size:10px;line-height:1.8;color:var(--fr-c167);margin-top:11px}.fr-root .conjBase.isMuted{opacity:.35}.fr-root .conjFlow{display:block;width:100%;height:auto;max-height:91px;margin:0 0 22px;overflow:visible}.fr-root .conjFlow text{font:12px -apple-system,BlinkMacSystemFont,sans-serif;fill:var(--fr-c168)}.fr-root .conjFlow path{fill:none;stroke-width:1.3}.fr-root .conjColumnLabels,.fr-root .conjRowMain{display:grid;grid-template-columns:100px minmax(0,1fr) minmax(0,1fr) 46px;align-items:center;gap:12px}.fr-root .conjColumnLabels{padding:8px 12px 10px;border-bottom:1px solid var(--fr-c169);color:var(--fr-c170);font-size:9px;letter-spacing:.5px}.fr-root .conjRow{border-bottom:1px solid var(--fr-c171);transition:opacity .15s}.fr-root .conjRow.isMuted{opacity:.38}.fr-root .conjRowMain{width:100%;padding:16px 12px;border:0;border-radius:0;background:transparent!important;text-align:left;min-height:62px}.fr-root .conjRowMain:hover{background:var(--fr-c172)!important}.fr-root .conjRowMain[aria-expanded="true"]{background:var(--fr-c173)!important}.fr-root .conjPerson{font-size:12px;color:var(--fr-c174);display:flex;gap:9px;align-items:center;line-height:1.5}.fr-root .conjDot{width:5px;height:5px;border-radius:50%;background:var(--base-color);flex-shrink:0}.fr-root .conjIpa{font:22px/1.4 Georgia,serif;color:var(--base-color);white-space:nowrap}.fr-root .conjSpelling{font:21px/1.4 Georgia,serif;color:var(--fr-c175);white-space:nowrap}.fr-root .conjInput{font-size:9px;line-height:1.5;color:var(--fr-c176);text-align:right;white-space:nowrap}.fr-root .conjOpenIcon{font-size:15px;font-weight:300;color:var(--fr-c177);text-align:right}.fr-root .conjRow.current .conjPerson{color:var(--fr-c178)}.fr-root .conjRow.current .conjSpelling{font-weight:600}.fr-root .conjRowDetail{padding:8px 15px 21px 120px;background:var(--fr-c179);animation:fr-appear .15s ease-out}.fr-root .conjEquation{display:flex;flex-wrap:wrap;align-items:baseline;gap:9px;margin:9px 0;font:18px/1.6 Georgia,serif;color:var(--fr-c180)}.fr-root .conjEquationLabel{font:10px/1.6 sans-serif;width:28px;flex-shrink:0;color:var(--fr-c181)}.fr-root .conjOperator{font:12px sans-serif;color:var(--fr-c182)}.fr-root .conjSegment{color:var(--base-color)}.fr-root .conjSuffix{color:var(--fr-c183);border-bottom:1px solid var(--fr-c184);padding-bottom:1px}.fr-root .conjRowNote{font-size:10px;color:var(--fr-c185);line-height:1.8;margin-top:11px}.fr-root .conjHintLine{font-size:10px;color:var(--fr-c186);margin:11px 0 0;min-height:16px}.fr-root .conjView[data-mode="oral"] .conjColumnLabels,.fr-root .conjView[data-mode="oral"] .conjRowMain,.fr-root .conjView[data-mode="written"] .conjColumnLabels,.fr-root .conjView[data-mode="written"] .conjRowMain{grid-template-columns:100px minmax(0,1fr) 46px}.fr-root .conjView[data-mode="oral"] .writtenColumn,.fr-root .conjView[data-mode="written"] .oralColumn{display:none}.fr-root .conjCompound{margin:33px 0 15px;border-top:1px solid var(--fr-c72);padding-top:24px}.fr-root .conjCompoundHeading{font-size:11px;color:var(--fr-c187);display:flex;justify-content:space-between;gap:10px}.fr-root .conjCompoundPhrase{display:flex;flex-wrap:wrap;gap:12px 20px;margin:25px 0}.fr-root .conjCompoundPart{display:flex;flex-direction:column;gap:9px}.fr-root .conjCompoundPart b{font:26px/1.4 Georgia,serif;color:var(--fr-c188);font-weight:400}.fr-root .conjCompoundPart small{font-size:10px;color:var(--fr-c189)}.fr-root .conjCompoundPart.input b{color:var(--fr-c190);text-decoration:underline;text-decoration-color:var(--fr-c191);text-underline-offset:7px;text-decoration-thickness:1px}.fr-root .conjView .entryFold{margin-top:23px}.fr-root .conjView .entryFold summary{font-size:11px;color:var(--fr-c192)}.fr-root .conjView .entryFold p{font-size:12px;line-height:1.9;color:var(--fr-c193)}.fr-root .conjSingle .conjBase{text-align:left;padding-left:12px}.fr-root .conjSingle .conjBase:after{margin-left:0}.fr-root .conjSingle .conjBase[aria-pressed="true"]:after{width:60px}.fr-root .conjSingle .conjBasePeople{display:inline-block;margin-left:20px}.fr-root .conjSingle .conjBaseSound{display:inline-block}.fr-root .conjRowMain:focus-visible,.fr-root .conjBase:focus-visible,.fr-root .conjMode button:focus-visible{outline:2px solid var(--fr-c63);outline-offset:3px}.fr-root .conjFlow .baseLine.isMuted{opacity:.18}@container (max-width:560px) {.fr-root .conjTop{margin-bottom:18px}.fr-root .conjBaseRail{gap:7px}.fr-root .conjBaseSound{font-size:27px}.fr-root .conjBasePeople{font-size:9px}.fr-root .conjColumnLabels,.fr-root .conjRowMain{grid-template-columns:65px minmax(0,1fr) minmax(0,1fr) 29px;gap:7px}.fr-root .conjPerson{font-size:11px;gap:6px}.fr-root .conjIpa{font-size:19px}.fr-root .conjSpelling{font-size:19px}.fr-root .conjRowMain{padding:14px 5px}.fr-root .conjColumnLabels{padding-left:5px;padding-right:5px}.fr-root .conjRowDetail{padding:5px 10px 17px 15px}.fr-root .conjInput{font-size:8px}.fr-root .conjMode button{padding:5px 7px;font-size:10px}.fr-root .conjSingle .conjBasePeople{display:block;margin-left:0}.fr-root .conjView[data-mode="oral"] .conjColumnLabels,.fr-root .conjView[data-mode="oral"] .conjRowMain,.fr-root .conjView[data-mode="written"] .conjColumnLabels,.fr-root .conjView[data-mode="written"] .conjRowMain{grid-template-columns:65px minmax(0,1fr) 29px}.fr-root .conjCompoundPart b{font-size:23px}}@container (max-width:370px) {.fr-root .conjPerson{font-size:10px}.fr-root .conjIpa,.fr-root .conjSpelling{font-size:16px}.fr-root .conjColumnLabels,.fr-root .conjRowMain{grid-template-columns:54px minmax(0,1fr) minmax(0,1fr) 24px;gap:5px}.fr-root .conjBaseSound{font-size:23px}}

/* A single compact application bar; content owns the vertical space. */
.fr-root .top.compactTop{height:46px;min-height:46px;max-height:46px;padding:0 20px;flex:0 0 46px;gap:12px}.fr-root .topLeft{display:flex;align-items:center;gap:22px;min-width:0}.fr-root .compactTop .brand{gap:8px;flex-shrink:0}.fr-root .compactTop .logo{width:24px;height:27px;min-width:24px;display:grid;place-items:center;border-radius:5px;font-size:21px;line-height:1}.fr-root .compactTop .title{font-size:12px;line-height:1.3}.fr-root .compactTop .topActions{gap:12px;flex-shrink:0}.fr-root .compactTop .progressWrap{font-size:10px;color:var(--fr-c194)}.fr-root .compactTop button{min-height:30px;padding:5px 8px;font-size:11px}.fr-root .compactTop #start{padding:5px 12px;min-width:44px}.fr-root .compactTop .compactReset{font-size:16px;width:30px;padding:3px}.fr-root .compactTop .navToggle{font-size:11px;padding:5px 0}.fr-root .navHead{height:40px;min-height:40px;padding:9px 16px}.fr-root .detailPane>.paneHead{min-height:38px;height:38px;padding:5px 25px}.fr-root .detailPane>.crumb{padding:8px 26px;min-height:30px;font-size:10px}.fr-root .detailPane>.branchStrip{padding:5px 26px;min-height:0}.fr-root .readingActions{padding:5px 26px;min-height:34px;gap:6px}.fr-root .readingActions button{padding:4px 6px}.fr-root .detailScroll{padding:24px 30px 34px}.fr-root .detailTitle{font-size:23px;margin-bottom:13px}.fr-root .quote{font-size:20px;line-height:1.8;margin:18px 0 23px}.fr-root .backbone{font-size:18px;line-height:1.7}.fr-root .paragraphSentence .sourceText{font-size:20px;line-height:1.75}.fr-root .kbWord{font-size:27px;margin-bottom:6px}.fr-root .kbIntro{margin:6px 0 16px}.fr-root .entrySection{margin-top:23px}.fr-root .frExample,.fr-root .kbExample .fr{font-size:16px;line-height:1.8}.fr-root .morphFormula{font-size:17px}.fr-root .conjView{margin:16px 0 25px}.fr-root .conjTop{margin-bottom:17px}.fr-root .conjBase{padding:6px 0 10px}.fr-root .conjBaseNumber{margin-bottom:8px}.fr-root .conjBaseSound{font-size:26px}.fr-root .conjBasePeople{margin-top:8px}.fr-root .conjBase:after{margin-top:11px}.fr-root .conjFlow{max-height:74px;margin-bottom:13px}.fr-root .conjColumnLabels{grid-template-columns:84px minmax(0,1fr) minmax(0,1fr) 34px;padding-right:46px}.fr-root .conjRowSummary{display:grid;grid-template-columns:minmax(0,1fr) 32px;align-items:center;gap:2px;padding-right:6px}.fr-root .conjRowMain{grid-template-columns:84px minmax(0,1fr) minmax(0,1fr) 34px;min-height:52px;padding:12px 10px;gap:10px;min-width:0}.fr-root .conjIpa,.fr-root .conjSpelling{font-size:18px}.fr-root .conjPerson{font-size:11px}.fr-root .conjRowDetail{padding:5px 14px 16px 104px}.fr-root .conjEquation{font-size:16px;gap:8px;margin:7px 0}.fr-root .conjCompound{margin-top:25px;padding-top:19px}.fr-root .conjCompoundPhrase{margin:18px 0;gap:12px 18px}.fr-root .conjCompoundPart b{font-size:22px}.fr-root .conjCompoundHeading{align-items:center}.fr-root .conjCompoundPart small{display:flex;align-items:center;gap:5px}.fr-root .conjAudioState{font-size:9px;color:var(--fr-c195);white-space:nowrap}.fr-root .conjSpeak{width:30px;height:32px;padding:7px!important;border:0!important;background:transparent!important;color:var(--fr-c196);border-radius:4px;display:inline-grid;place-items:center;flex-shrink:0}.fr-root .conjSpeak svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}.fr-root .conjSpeak:hover,.fr-root .conjSpeak:focus-visible{color:var(--fr-c197);background:var(--fr-c198)!important;outline-offset:2px}.fr-root .conjRegenerate{border:0;background:none!important;padding:6px 9px 3px 0;font-size:10px;color:var(--fr-c199);margin-top:4px}.fr-root .conjView[data-mode="oral"] .conjColumnLabels,.fr-root .conjView[data-mode="oral"] .conjRowMain,.fr-root .conjView[data-mode="written"] .conjColumnLabels,.fr-root .conjView[data-mode="written"] .conjRowMain{grid-template-columns:84px minmax(0,1fr) 34px}@container (max-width:560px) {.fr-root .top.compactTop{padding:0 12px;height:44px;min-height:44px;max-height:44px;flex-basis:44px;gap:10px}.fr-root .topLeft{gap:14px}.fr-root .compactTop .topActions{gap:5px}.fr-root .compactTop .progressWrap{display:none}.fr-root .detailScroll{padding:20px 20px 28px}.fr-root .detailPane>.paneHead{padding:4px 17px}.fr-root .detailPane>.crumb,.fr-root .detailPane>.branchStrip{padding-left:20px;padding-right:20px}.fr-root .readingActions{padding-left:17px;padding-right:17px}.fr-root .quote{font-size:18px;line-height:1.8}.fr-root .backbone{font-size:17px}.fr-root .kbWord{font-size:25px}.fr-root .conjBaseSound{font-size:23px}.fr-root .conjBasePeople{font-size:9px}.fr-root .conjColumnLabels{grid-template-columns:56px minmax(0,1fr) minmax(0,1fr) 24px;gap:6px;padding:7px 38px 8px 4px}.fr-root .conjRowMain{grid-template-columns:56px minmax(0,1fr) minmax(0,1fr) 24px;gap:6px;padding:10px 4px;min-height:50px}.fr-root .conjRowSummary{grid-template-columns:minmax(0,1fr) 30px;gap:0;padding-right:0}.fr-root .conjPerson{font-size:10px;gap:5px}.fr-root .conjIpa,.fr-root .conjSpelling{font-size:17px}.fr-root .conjRowDetail{padding:5px 10px 14px 14px}.fr-root .conjCompoundPart b{font-size:20px}.fr-root .conjView[data-mode="oral"] .conjColumnLabels,.fr-root .conjView[data-mode="oral"] .conjRowMain,.fr-root .conjView[data-mode="written"] .conjColumnLabels,.fr-root .conjView[data-mode="written"] .conjRowMain{grid-template-columns:56px minmax(0,1fr) 24px}.fr-root .conjCount{max-width:175px;line-height:1.6}.fr-root .conjAudioState{display:block}}@container (max-width:380px) {.fr-root .compactTop .brand .title{display:none}.fr-root .topLeft{gap:12px}.fr-root .detailScroll{padding-left:16px;padding-right:16px}.fr-root .conjIpa,.fr-root .conjSpelling{font-size:15px}.fr-root .conjColumnLabels,.fr-root .conjRowMain{grid-template-columns:49px minmax(0,1fr) minmax(0,1fr) 21px;gap:5px}.fr-root .conjBaseSound{font-size:21px}}

/* Override earlier responsive reading sizes as well as the desktop defaults. */
.fr-root .detailPane .detailScroll .quote{font-size:20px!important}.fr-root .detailPane .detailScroll .backbone{font-size:18px!important}.fr-root .navHead{padding:3px 16px}@container (max-width:560px) {.fr-root .detailPane .detailScroll .quote{font-size:18px!important}.fr-root .detailPane .detailScroll .backbone{font-size:17px!important}.fr-root .navHead{padding:0 12px}}

/* Real hidden sections must not retain flex minima from the reading toolbar. */
.fr-root .detailPane.readingPaneKnowledge>.paneHead,.fr-root .detailPane.readingPaneKnowledge>.branchStrip,.fr-root .detailPane.readingPaneKnowledge>.readingActions{display:none!important;visibility:hidden;height:0!important;min-height:0!important;max-height:0!important;flex:0 0 0!important;padding:0!important;margin:0!important;border:0!important}
.fr-root .storageStatus{flex:0 0 auto;padding:5px 20px;font-size:11px;line-height:1.55;background:var(--fr-c200);color:var(--fr-c201);border-bottom:1px solid var(--fr-c202)}.fr-root .receiptStorage{font-size:10px;color:var(--fr-c203);margin-top:4px}.fr-root .actionDialog textarea{min-height:130px;max-height:38dvh}.fr-root .actionDialog .danger{background:var(--fr-c204)!important;border-color:var(--fr-c204)!important;color:white}.fr-root .actionDialog .kbField{margin:14px 0}.fr-root .actionDialog .hint{line-height:1.8}.fr-root .actionDialog .modalFoot{flex-shrink:0}
@container (max-width:560px) {.fr-root .storageStatus{padding:4px 12px;font-size:10px}.fr-root .actionDialog textarea{min-height:100px}}
@media(max-height:500px){
 .fr-root .top.compactTop{height:40px;min-height:40px;max-height:40px;flex-basis:40px}
 .fr-root .workspace[data-view="focus"]>.detailPane{display:block!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-gutter:stable}
 .fr-root .detailPane>.paneHead{height:28px;min-height:28px;padding:0 20px}.fr-root .detailPane>.crumb{min-height:22px;padding:3px 20px;line-height:1.6}.fr-root .detailPane>.branchStrip{padding:3px 20px;max-height:34px;overflow-x:auto;flex-wrap:nowrap}.fr-root .detailPane>.readingActions{min-height:28px;padding:3px 20px}
 .fr-root .detailPane>.detailScroll{flex:none;height:auto!important;max-height:none!important;overflow:visible!important;min-height:0;scrollbar-gutter:auto;padding:12px 24px 18px}
 .fr-root .detailPane>.composer{position:static!important;flex:none;height:auto!important;max-height:none!important;overflow:visible!important;padding:8px 20px max(10px,env(safe-area-inset-bottom));margin:0}
 .fr-root .detailPane .composer textarea{height:52px;min-height:48px;max-height:84px;font-size:14px;padding:7px 9px}.fr-root .detailPane .composeTarget{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px;margin-bottom:3px}.fr-root .detailPane .context{margin:3px 0}.fr-root .detailPane .context summary{font-size:10px}.fr-root .detailPane .composerFoot{margin-top:4px;min-height:28px}.fr-root .detailPane .composerFoot button{min-height:28px;padding:5px 10px;font-size:11px}.fr-root .detailPane .detailTitle{font-size:20px;margin-bottom:12px}.fr-root .detailPane .quote{margin-top:12px;margin-bottom:16px}
 .fr-root .actionDialog{max-height:calc(100dvh - 24px);padding:18px}.fr-root .actionDialog textarea{min-height:64px;max-height:28dvh}.fr-root .actionDialog h2{margin-top:0;margin-bottom:10px}.fr-root .actionDialog .kbField{margin:10px 0}.fr-root .storageStatus{padding-top:3px;padding-bottom:3px}
}

/* ---------------------------------------------------------------------------
   Panel adaptation — the only rules not taken from the prototype.

   Each one exists because the prototype assumed it *was* the document: it measured
   itself in viewport units and positioned panes with viewport-derived insets. The panel is a
   box inside the DSH shell, so those are re-expressed against the panel box instead.
   Nothing here changes how anything looks at the prototype's own size.
   --------------------------------------------------------------------------- */
.fr-root{position:relative;height:100%;overflow:hidden}
/* 46px is .top.compactTop's height, so the workspace gets exactly what is left. */
.fr-root .workspace{height:calc(100% - 46px)}
/* The prototype parks the navigation 834px from the right edge; keep that, but never let
   a narrow panel squeeze the navigation out of existence. */
.fr-root .navigation{right:min(834px,calc(100% - 380px))}
.fr-root .workspace[data-view="focus"]>.detailPane{width:min(780px,calc(100% - 88px))}
`

    const styles = `
      .fr-page{box-sizing:border-box;min-height:100%;height:100%;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:14px/1.55 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .fr-shell{max-width:1240px;margin:0 auto;padding:clamp(16px,2.5vw,32px);display:flex;flex-direction:column;gap:18px}
      .fr-top{display:flex;align-items:center;justify-content:space-between;gap:16px}
      .fr-brand{display:flex;align-items:center;gap:12px;min-width:0}
      .fr-brandIcon{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-brand-primary);flex:0 0 auto}
      .fr-brandName{font-size:16px;font-weight:700;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .fr-brandSub{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:2px}
      .fr-topActions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
      .fr-tabs{display:flex;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l1)}
      .fr-tab{appearance:none;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;font-weight:600;padding:9px 14px;cursor:pointer;margin-bottom:-1px}
      .fr-tab:hover{color:var(--dsw-alias-label-primary)}
      .fr-tabActive{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary)}
      .fr-libGrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,400px);gap:18px;align-items:start}
      .fr-card{border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
      .fr-cardHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px 13px;border-bottom:1px solid var(--dsw-alias-border-l1)}
      .fr-cardTitle{font-size:14px;font-weight:650;margin:0}
      .fr-cardNote{font-size:12px;color:var(--dsw-alias-label-secondary);margin:4px 0 0;max-width:560px}
      .fr-cardBody{padding:14px 18px 18px;display:flex;flex-direction:column;gap:12px}
      .fr-list{display:flex;flex-direction:column;max-height:560px;overflow:auto}
      .fr-row{width:100%;text-align:left;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);padding:13px 18px;background:transparent;color:inherit;cursor:pointer;display:flex;flex-direction:column;gap:4px;font:inherit}
      .fr-row:last-child{border-bottom:0}
      .fr-row:hover{background:var(--dsw-alias-bg-layer-2)}
      .fr-rowTitle{font-size:13px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .fr-rowExcerpt{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:Georgia,"Times New Roman",serif}
      .fr-rowMeta{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:var(--dsw-alias-label-secondary)}
      /* Streaming is a real capability the prototype only simulated, so this one element
         is an allowed addition; it uses live tokens like the rest of the hand-written CSS. */
      .streamText{margin:8px 0 0;padding:8px 10px;max-height:180px;overflow:auto;white-space:pre-wrap;
        font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid var(--dsw-alias-border-l1);
        border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
      .fr-empty{padding:36px 22px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}
      .fr-pager{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 16px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}
      .fr-form{display:flex;flex-direction:column;gap:12px}
      .fr-field{display:flex;flex-direction:column;gap:6px}
      .fr-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
      .fr-input,.fr-textarea,.fr-select{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;padding:9px 11px;outline:none;transition:border-color .16s,box-shadow .16s}
      .fr-input:focus,.fr-textarea:focus,.fr-select:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 15%,transparent)}
      .fr-textarea{min-height:180px;resize:vertical;line-height:1.65}
      .fr-textareaFr{font-family:Georgia,"Times New Roman",serif;font-size:15px}
      .fr-help{font-size:11px;color:var(--dsw-alias-label-secondary);margin:0}
      .fr-formFoot{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      .fr-button{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:9px;padding:7px 11px;font-family:inherit;font-size:12px;font-weight:600;line-height:1.25;cursor:pointer;transition:border-color .12s,background .12s;display:inline-flex;align-items:center;justify-content:center;gap:6px}
      .fr-button:hover:not(:disabled){border-color:var(--dsw-alias-border-l2)}
      .fr-button:disabled{opacity:.5;cursor:not-allowed}
      .fr-buttonPrimary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
      .fr-buttonQuiet{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}
      .fr-buttonQuiet:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
      .fr-status{font-size:12px;margin:0;color:var(--dsw-alias-state-success-primary)}
      .fr-error{font-size:12px;margin:0;color:var(--dsw-alias-state-error-primary)}
      .fr-previewBox{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-2);padding:11px 13px;display:flex;flex-direction:column;gap:8px}
      .fr-previewMeta{font-size:11px;color:var(--dsw-alias-label-secondary)}
      .fr-flagList{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}
      /* ---- reading frame: the accepted prototype's language, fr- prefixed and
         token-only so it survives both themes ---- */
        padding:0 clamp(12px,2vw,24px);border-bottom:1px solid var(--dsw-alias-border-l1);
        background:var(--dsw-alias-bg-base)}
      /* The reading page owns its height so each column scrolls on its own; the library
         page keeps the plain scrolling .fr-page. */
        padding:0 clamp(12px,2vw,24px);border-bottom:1px solid var(--dsw-alias-border-l1);
        font-size:11px;color:var(--dsw-alias-label-secondary)}
      .fr-paraLabel{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 8px;
        font-size:11px;color:var(--dsw-alias-label-secondary)}
      .fr-paraId{appearance:none;border:0;background:none;padding:0;font:inherit;font-size:11px;
        color:inherit;cursor:pointer;letter-spacing:.04em}
      .fr-paraId:hover{color:var(--dsw-alias-label-primary)}
      .fr-sentenceMark{font-size:11px}
      /* A paragraph is a column of text with a rule, not a card. */
      .fr-para{border:0;border-left:2px solid var(--dsw-alias-border-l2);border-radius:0;background:none;
        padding:2px 0 2px 14px;margin:26px 0 0;display:flex;flex-direction:column;gap:8px}
      .fr-paraActive{border-left-color:var(--dsw-alias-brand-primary)}
      .fr-paraActive{border-color:var(--dsw-alias-brand-primary)}
      .fr-paraText{font:20px/2 Georgia,"Times New Roman",serif;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
      .fr-paraText ::selection{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent)}
      .fr-sentence{appearance:none;background:transparent;border:0;border-bottom:1px dashed var(--dsw-alias-border-l2);padding:1px 2px;margin:0;font:inherit;color:inherit;cursor:pointer;border-radius:5px;user-select:text}
      .fr-sentence:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .fr-sentence:hover{background:var(--dsw-alias-bg-layer-2)}
      .fr-sentenceDone{border-bottom:1px solid var(--dsw-alias-brand-primary)}
      .fr-sentenceActive{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}
      .fr-bench{display:flex;flex-direction:column;gap:12px}
      .fr-anchorTag{font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-brand-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px}
      .fr-benchSection{display:flex;flex-direction:column;gap:8px}
      .fr-benchLabel{font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--dsw-alias-label-secondary);text-transform:uppercase}
      .fr-anchorRow{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .fr-anchorRowActions{justify-content:flex-start;gap:8px}
      .fr-draft{min-height:60px;max-height:200px;font-size:13px;line-height:1.7}
      .fr-streamText{margin:8px 0 0;padding:8px 10px;max-height:180px;overflow:auto;white-space:pre-wrap;
        font:inherit;font-size:13px;line-height:1.75;color:var(--dsw-alias-label-secondary);
        background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:6px}
      .fr-latestTrans{font-size:13px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;border-left:2px solid var(--dsw-alias-brand-primary);padding:2px 0 2px 10px}
      /* One hue per constituent role, and every one of them carries a light and a
         dark value: a single hard-coded colour would break one of the two themes.
         The live alias tokens do not offer eight distinct hues, so these are
         plugin tokens declared for both themes. */
      :root{
        --fr-role-subject:#2f6fdb; --fr-role-verb:#c0392b; --fr-role-object:#1f8b4c;
        --fr-role-attribute:#c77700; --fr-role-adverbial:#7a7a7a; --fr-role-infinitive:#7d3cc0;
        --fr-role-modifier:#8a5a2b; --fr-role-other:var(--dsw-alias-label-primary);
      }
      [data-theme='dark']{
        --fr-role-subject:#7aa7ff; --fr-role-verb:#ff8a7a; --fr-role-object:#5fd39a;
        --fr-role-attribute:#ffc061; --fr-role-adverbial:#b0b0b0; --fr-role-infinitive:#c79bff;
        --fr-role-modifier:#d7a878; --fr-role-other:var(--dsw-alias-label-primary);
      }
      .fr-analysis{display:flex;flex-direction:column;gap:10px;margin-top:8px}
      .fr-analysisPart{display:flex;flex-direction:column;gap:4px}
      .fr-constituent{font-weight:650}
      .fr-roleList{display:flex;flex-direction:column;gap:3px;margin:4px 0 0;padding:0;list-style:none}
      .fr-roleRow{display:flex;align-items:center;gap:6px;font-size:11px}
      .fr-roleDot{width:8px;height:8px;border-radius:2px;flex:0 0 auto}
      .fr-kind{font-size:10px;padding:2px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1)}
      .fr-kind-syntax{color:var(--dsw-alias-label-primary)}
      .fr-kind-context{color:var(--dsw-alias-state-idle-primary)}
      .fr-kind-rhetoric{color:var(--dsw-alias-state-warn-primary)}
      .fr-kind-unverified{color:var(--dsw-alias-label-secondary);border-style:dashed}
      .fr-sourceRow{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:8px}
      .fr-modelRow{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin:0 0 8px}
      .fr-message{border-left:2px solid var(--dsw-alias-border-l2);padding:5px 0 5px 10px;margin:0 0 6px;display:flex;flex-direction:column;gap:3px}
      .fr-messageUser{border-left-color:var(--dsw-alias-brand-primary)}
      .fr-contextCard{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;margin-top:8px}
      .fr-branchList{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
      .fr-branch{border-left:2px solid var(--dsw-alias-border-l1);padding:5px 0 5px 10px;display:flex;flex-direction:column;gap:3px}
      .fr-branchHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .fr-branchKind{font-size:10px;padding:2px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
      .fr-branchTitle{font-size:12px;font-weight:650}
      .fr-branchBody{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
      .fr-composer{display:flex;flex-direction:column;gap:9px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:12px}
      .fr-selectionBar{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-brand-primary);border-radius:12px;padding:11px 13px;background:var(--dsw-alias-bg-layer-2)}
      .fr-selectionExcerpt{font:13px/1.7 Georgia,"Times New Roman",serif;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
      .fr-knowledge{display:flex;flex-direction:column;gap:14px}
      .fr-entryList{display:flex;flex-direction:column;margin:0;padding:0;list-style:none;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
      .fr-entry{padding:13px 16px;display:flex;flex-direction:column;gap:5px;border-bottom:1px solid var(--dsw-alias-border-l1)}
      .fr-entry:last-child{border-bottom:0}
      .fr-entryHead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .fr-entryName{font-size:13px;font-weight:650}
      .fr-nestedCard{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px;display:flex;flex-direction:column;gap:8px}
      .fr-cardBody{margin:0;white-space:pre-wrap;font:12px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;overflow:auto;max-height:420px}
      .fr-decision{display:flex;flex-direction:column;gap:8px;margin-top:6px;padding-top:8px;border-top:1px dashed var(--dsw-alias-border-l1)}
      @container (max-width:960px) {.fr-libGrid,.fr-workspace{grid-template-columns:minmax(0,1fr)}}
      @media(max-height:500px){.fr-readingPage{display:block;overflow:auto}}
      @container (max-width:560px) {.fr-shell{padding:14px}.fr-brandSub{display:none}.fr-para{padding:12px 14px}.fr-paraText{font-size:15px}}
      /* ---- front door: the start page is a page, not a modal ----
         The reader lands on a centred column: what a close reading is, the new-passage
         composer already open, and the saved passages below it with their excerpts. */
      .fr-root .frontDoor{flex:1;min-height:0;overflow:auto;background:var(--paper)}
      .fr-root .frontDoorInner{max-width:700px;margin:0 auto;padding:56px 40px 72px}
      .fr-root .frontDoorInner .eyebrow{margin-bottom:12px}
      .fr-root .frontDoorTitle{font-size:26px;font-weight:600;letter-spacing:-.4px;margin:0 0 10px}
      .fr-root .frontDoorHint{font-size:12px;line-height:1.9;color:var(--muted);margin:0 0 30px}
      .fr-root .frontCompose{border:1px solid var(--fr-c72);border-radius:12px;background:var(--fr-c02);padding:20px 24px 4px;margin:0 0 44px}
      .fr-root .frontCompose .kbField{margin:0 0 14px}
      .fr-root .frontCompose textarea{min-height:150px}
      .fr-root .frontCompose .modalFoot{margin:0 0 16px;justify-content:flex-start}
      .fr-root .frontListHead{display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:11px;margin-bottom:2px}
      .fr-root .frontListTitle{font-size:13px;font-weight:600}
      .fr-root .frontListCount{font-size:11px;color:var(--muted)}
      .fr-root .frontFoot{display:flex;gap:20px;margin-top:30px}
      .fr-root .frontFoot button{font-size:11px}
      @container (max-width:560px) {.fr-root .frontDoorInner{padding:30px 20px 48px}.fr-root .frontCompose{padding:16px 16px 2px}}
      /* ---- a run the reader can see: stage, elapsed time, and one way out ---- */
      .fr-root .runStatus{display:flex;align-items:center;gap:12px;font-size:11px;color:var(--muted);margin:10px 0 4px}
      .fr-root .runStatus button{border:0;background:none;padding:2px 4px;font-size:11px;color:var(--green)}
      .fr-root .runStatus button:hover{text-decoration:underline}
      /* Explicit route actions and passage continuation. */
      .fr-root .compactTop .navToggle{padding:5px 10px;border:1px solid var(--green);border-radius:6px;color:var(--green);white-space:nowrap;font-weight:600}
      .fr-root .compactTop .navToggle[aria-expanded='true']{background:var(--green);color:var(--paper)}
      .fr-root .navHead{height:auto;min-height:48px;flex-wrap:wrap;gap:8px;padding:9px 12px}
      .fr-root .navHead .controls{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
      .fr-root .navHead .controls button{min-width:44px;min-height:32px;width:auto;height:auto;border:1px solid var(--line);border-radius:5px;padding:5px 8px;font-size:11px;white-space:nowrap;background:var(--paper)}
      .fr-root #navScale{min-width:40px;text-align:center;font-size:11px;font-variant-numeric:tabular-nums}
      .fr-root .continuationBar{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:8px 25px;border-bottom:1px solid var(--line);background:var(--paper)}
      .fr-root .currentPassageTitle{font-size:11px;color:var(--muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .fr-root .continuationBar button{flex-shrink:0;white-space:nowrap;min-height:32px}
      .fr-root .modal.switcher{max-height:calc(100% - 24px);overflow:auto}
      .fr-root .modal.switcher textarea{max-height:200px;min-height:90px}
      @container (max-width:560px){.fr-root .compactTop .topLeft{gap:8px}.fr-root .compactTop .navToggle{font-size:10px;padding:5px 7px}.fr-root .continuationBar{padding:7px 17px}.fr-root .navHead>strong{font-size:11px}}
      /* The model the run will use — visible and changeable, not implicit. */
      .fr-root .readingActions select.modelSelect{font-size:11px;max-width:200px;min-width:0;padding:3px 6px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink)}

      /* Book-first entrance and contextual reading tools. */
      .fr-root.bookLayout .bookDirectory{position:absolute;left:0;top:46px;bottom:0;width:270px;z-index:4;display:flex;flex-direction:column;border-right:1px solid var(--line);background:var(--paper)}
      .fr-root.bookLayout .bookDirectory.hiddenDirectory{display:none}
      .fr-root .directoryHead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:18px 14px;border-bottom:1px solid var(--line);font-size:13px}
      .fr-root .directoryTree{flex:1;min-height:0;overflow:auto;padding:15px 10px}
      .fr-root .shelfBook{margin-bottom:18px}.fr-root .shelfBook>summary{font-weight:650;font-size:13px;padding:8px 5px;cursor:pointer;overflow-wrap:anywhere}
      .fr-root .shelfChapter{margin:3px 0 8px 12px;border-left:1px solid var(--line);padding-left:10px}
      .fr-root .shelfChapter>summary{font-size:12px;color:var(--muted);padding:8px 2px;cursor:pointer;overflow-wrap:anywhere}
      .fr-root .shelfRow{display:flex;align-items:center;min-width:0;border-radius:6px;margin:4px 0}.fr-root .shelfRow.current{background:var(--pale);box-shadow:inset 3px 0 var(--green)}
      .fr-root .shelfPassage{display:flex;gap:8px;text-align:left;flex:1;min-width:0;padding:9px 6px;border:0;background:transparent;font-size:12px}
      .fr-root .shelfNumber{font-size:10px;font-variant-numeric:tabular-nums;color:var(--muted);padding-top:2px}
      .fr-root .shelfPassageText{display:flex;flex-direction:column;gap:4px;min-width:0}.fr-root .shelfPassageText>span{overflow-wrap:anywhere;line-height:1.5}.fr-root .shelfPassageText small{display:block;font:11px/1.5 Georgia,serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted)}
      .fr-root .shelfOrganize{flex-shrink:0;padding:7px 4px;border:0;background:transparent;min-width:28px}.fr-root .chapterAdd{font-size:11px;padding:7px 5px;border:0;background:transparent;color:var(--green);text-align:left}
      .fr-root .directoryFoot{border-top:1px solid var(--line);padding:12px 14px;display:flex;gap:7px;flex-wrap:wrap}.fr-root .directoryFoot small{width:100%;font-size:10px;color:var(--muted)}
      .fr-root.bookLayout[data-directory='open'] .shelfWelcome{margin-left:270px}.fr-root .shelfWelcome .frontDoorInner{padding-top:90px;max-width:760px}.fr-root .shelfWelcomeActions{display:flex;gap:12px;flex-wrap:wrap;margin:30px 0}
      .fr-root.bookLayout .workspace[data-view='focus']>.detailPane{position:relative;left:auto!important;right:auto!important;width:min(900px,calc(100% - 48px));margin:0 auto;height:100%;min-height:0;border-right:0;background:var(--paper)}
      .fr-root.bookLayout[data-directory='open'] .workspace{margin-left:270px;width:calc(100% - 270px)}
      .fr-root.bookLayout .workspace .navigation{top:0;bottom:0;left:0;right:auto;transform:none;width:min(700px,100%);z-index:10;border-radius:0;box-shadow:8px 0 25px var(--fr-c71)}
      .fr-root.bookLayout .navigation .sheetHandle{display:none}
      .fr-root.bookLayout .navigation .navHead{height:auto;min-height:56px;flex-wrap:wrap;gap:8px;padding:10px 14px}
      .fr-root.bookLayout .navigation .controls{flex-wrap:wrap;gap:4px;max-width:100%;flex-shrink:1}
      .fr-root.bookLayout .modalBackdrop{position:absolute;inset:0;min-height:0}
      .fr-root.bookLayout .modal{width:min(560px,100%);max-height:100%;min-height:0;overflow:auto}
      .fr-root.bookLayout .modal.switcher{width:min(840px,100%)}
      .fr-root.bookLayout .continuationBar{min-height:82px;padding:18px 28px;gap:10px}.fr-root .passageHeading{min-width:0;flex:1}.fr-root .bookBreadcrumb{font-size:11px;color:var(--muted);margin-bottom:8px;overflow-wrap:anywhere}.fr-root.bookLayout .currentPassageTitle{font-size:17px;color:var(--ink);display:block;white-space:normal;line-height:1.5}
      .fr-root.bookLayout .crumb{padding:9px 28px;font-size:11px;border-bottom:1px solid var(--line)}
      .fr-root .readingSource{padding-bottom:14px;border-bottom:1px solid var(--line)}.fr-root .sourceSectionHead{display:flex;align-items:baseline;gap:12px;justify-content:space-between;color:var(--muted);font-size:11px;flex-wrap:wrap}.fr-root .sourceSectionHead strong{font-size:12px;color:var(--ink)}
      .fr-root .sourceParagraph.quote{font:20px/1.9 Georgia,serif;margin:20px 0 0}.fr-root .readingSentence{border-radius:3px;cursor:pointer}.fr-root .readingSentence:hover{background:var(--pale)}.fr-root .readingSentence.selected{background:var(--pale);box-shadow:0 2px 0 var(--green)}.fr-root .readingSentence:focus-visible{outline:2px solid var(--green);outline-offset:3px}
      .fr-root .sentenceWorkspace{padding:12px 0 18px;border-bottom:1px solid var(--line);margin-bottom:24px}.fr-root .sentenceWorkspace .paneHead{padding:0;height:auto;min-height:36px}.fr-root .sentenceWorkspace .readingActions{padding:10px 0;min-height:0;border:0;gap:8px;flex-wrap:wrap}.fr-root .sentenceWorkspace .branchStrip{padding:2px 0;min-height:0;border:0}
      .fr-root .sentenceWorkspace .readingActions button{min-height:32px}.fr-root .sentenceWorkspace .readingActions select{margin-left:auto;min-height:32px}.fr-root .locationFields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 90px;gap:12px}.fr-root .locationFields .kbField{min-width:0}.fr-root .locationFields input{width:100%;min-width:0}.fr-root .locationFields datalist{display:none}
      @container (max-width:959px){.fr-root.bookLayout[data-directory='open'] .workspace{margin-left:0;width:100%}.fr-root.bookLayout[data-directory='open'] .shelfWelcome{margin-left:0}.fr-root.bookLayout .bookDirectory{width:min(310px,calc(100% - 30px));box-shadow:12px 0 25px var(--fr-c71);z-index:10}.fr-root.bookLayout .workspace[data-view='focus']>.detailPane{width:100%}.fr-root.bookLayout .compactTop{height:auto;min-height:62px;max-height:none;flex-wrap:wrap;padding:8px 12px;gap:8px}.fr-root.bookLayout .compactTop .topLeft{flex-wrap:wrap;gap:6px}.fr-root.bookLayout .workspace{height:calc(100% - 62px)}.fr-root.bookLayout .continuationBar{padding:15px 20px;flex-wrap:wrap}.fr-root.bookLayout .continuationBar .quiet{padding-left:0}.fr-root.bookLayout .bookDirectory{top:62px}}
      @container (max-width:560px){.fr-root.bookLayout .continuationBar .passageHeading{flex-basis:100%}.fr-root .shelfWelcome .frontDoorInner{padding:50px 22px}.fr-root.bookLayout .detailScroll{padding:20px}.fr-root .sourceParagraph.quote{font-size:18px}.fr-root .locationFields{grid-template-columns:minmax(0,1fr) 80px}.fr-root .locationFields .kbField:first-child{grid-column:1/-1}.fr-root .sentenceWorkspace .readingActions select{margin-left:0;max-width:100%}.fr-root.bookLayout .compactTop .title{display:none}.fr-root.bookLayout .compactTop button{padding:5px 6px;font-size:10px}.fr-root.bookLayout .compactTop .topActions{gap:4px}.fr-root.bookLayout .continuationBar .currentPassageTitle{font-size:16px}}
      .fr-root .readingSource>summary.sourceSectionHead{display:list-item;cursor:pointer;padding:4px 0;font-size:11px}.fr-root .readingSource>summary span{margin-left:15px}.fr-root .sentenceWorkspace .readingActions button.primary{background:var(--green);color:var(--paper);border:1px solid var(--green);padding:5px 12px}.fr-root .sentenceWorkspace .readingActions button.primary:disabled{opacity:.45}
    `

    function format(t, key, values = {}) {
      return String(t(key)).replace(/\{(\w+)\}/gu, (_, name) => String(values[name] ?? ''))
    }

    const SHELF_KEY = 'french-close-reading/bookshelf-v1'
    function readShelf() {
      try {
        const value = JSON.parse(localStorage.getItem(SHELF_KEY) ?? 'null')
        if (!value || !Array.isArray(value.books) || !value.placements || typeof value.placements !== 'object') return { books: [], placements: {} }
        return {
          books: value.books.filter((book) => typeof book.name === 'string' && Array.isArray(book.chapters))
            .map((book) => ({ name: book.name, chapters: book.chapters.filter((chapter) => typeof chapter === 'string') })),
          placements: Object.fromEntries(Object.entries(value.placements).filter(([, loc]) => loc && typeof loc.book === 'string' && typeof loc.chapter === 'string' && Number.isSafeInteger(loc.number) && loc.number > 0)),
        }
      } catch { return { books: [], placements: {} } }
    }
    function addShelfChapter(shelf, bookName, chapterName) {
      const existing = shelf.books.find((book) => book.name === bookName)
      const chapter = chapterName || '未分章'
      const books = existing
        ? shelf.books.map((book) => book !== existing ? book : { ...book, chapters: [...new Set([...book.chapters, chapter])] })
        : [...shelf.books, { name: bookName, chapters: [chapter] }]
      return { ...shelf, books }
    }

    const CONTINUATION_KEY = 'french-close-reading/continuations'

    function readContinuationLinks() {
      try {
        const stored = JSON.parse(localStorage.getItem(CONTINUATION_KEY) ?? 'null')
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
        return Object.fromEntries(Object.entries(stored).filter(([parent, next]) =>
          parent !== '__proto__' && parent !== 'constructor' && next && typeof next.id === 'string' && typeof next.title === 'string'))
      } catch { return {} }
    }

    function nextPassageTitle(currentTitle, savedTitles = [], nextNumber = null) {
      const current = currentTitle.trim() || '未命名段落'
      const match = /^(.*?)\s*(?:·\s*)?段落\s*(\d+)$/u.exec(current)
      const base = (match ? match[1] : current).trim()
      const width = Math.max(2, match ? match[2].length : 2)
      let number = nextNumber ?? (match ? Number(match[2]) + 1 : 2)
      const used = new Set(savedTitles)
      const candidate = () => {
        const suffix = ` · 段落 ${String(number).padStart(width, '0')}`
        return `${base.slice(0, 120 - suffix.length)}${suffix}`
      }
      while (used.has(candidate())) number += 1
      return candidate()
    }

    function unwrap(result, t) {
      if (result && result.ok === true) return result.value
      throw new Error(result?.error?.message ?? t('requestFailed'))
    }

    function createUuid() {
      if (typeof globalThis.crypto?.randomUUID !== 'function') throw new Error('Secure UUID generation is unavailable')
      return globalThis.crypto.randomUUID()
    }

    async function sourceFingerprint(title, sourceText) {
      if (typeof globalThis.crypto?.subtle?.digest !== 'function') throw new Error('Secure retry recovery is unavailable')
      const bytes = new TextEncoder().encode(JSON.stringify([title.trim(), sourceText]))
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
      return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
    }

    function readPendingAttempt() {
      try {
        const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null')
        if (value && /^[0-9a-f-]{36}$/iu.test(value.id)
          && /^[0-9a-f-]{36}$/iu.test(value.operationId)
          && /^[0-9a-f]{64}$/iu.test(value.fingerprint)) return value
      } catch { /* Storage may be unavailable; in-memory retries still work. */ }
      return null
    }

    function persistPendingAttempt(value) {
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({
          fingerprint: value.fingerprint,
          id: value.id,
          operationId: value.operationId,
        }))
      } catch { /* Do not block a save. */ }
    }

    function clearPendingAttempt() {
      try { sessionStorage.removeItem(PENDING_KEY) } catch { /* The durable Host record remains authoritative. */ }
    }

    // The reader's model choice outlives the panel: reopening the panel (or the
    // app) must not silently put them back on the first model in the list. When
    // the saved model no longer exists, the fallback is announced, never silent.
    const MODEL_KEY = 'french-close-reading/model'

    function readModelPreference() {
      try { return localStorage.getItem(MODEL_KEY) } catch {
        try { return sessionStorage.getItem(MODEL_KEY) } catch { return null }
      }
    }

    function persistModelPreference(value) {
      try { localStorage.setItem(MODEL_KEY, value) } catch {
        try { sessionStorage.setItem(MODEL_KEY, value) } catch { /* Choice stays for this session only. */ }
      }
    }

    function downloadJson(value, fileName) {
      const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json;charset=utf-8' })
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = fileName
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(href), 1000)
    }

    function ReaderIcon({ size = 20, active = false }) {
      return h('span', {
        style: { display: 'inline-flex', color: active ? 'var(--dsw-alias-brand-primary)' : 'currentColor' },
        'aria-hidden': true,
      }, h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none' },
        h('path', { d: 'M3.5 5.2c3.35-1.25 6.18-.72 8.5 1.14v13c-2.32-1.86-5.15-2.39-8.5-1.14V5.2Z', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' }),
        h('path', { d: 'M20.5 5.2c-3.35-1.25-6.18-.72-8.5 1.14v13c2.32-1.86 5.15-2.39 8.5-1.14V5.2Z', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' }),
        h('path', { d: 'M6.5 8.5h2.8m-2.8 3h2.8m5.4-3h2.8m-2.8 3h2.8', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
      ))
    }

    /**
     * The accumulated knowledge: vocabulary cards and grammar entries, with the
     * pending candidates the automatic path refused to merge. Rendered as the
     * knowledge tab of the library.
     */
    /**
     * The prototype's knowledge library (`renderLibraryList`): its bar, its two tabs with
     * counts, the search row with the two filters, and one row per entry.
     *
     * Opening an entry keeps the panel's existing card renderer for now — the card's own
     * restyle is the rest of this milestone — but the list itself is the prototype's.
     */
    function KnowledgeLibrary({ t, listLexicon, listGrammar, onReturn, onOpenEntry }) {
      const [tab, setTab] = useState('vocab')
      const [lexicon, setLexicon] = useState(null)
      const [grammar, setGrammar] = useState(null)
      const [query, setQuery] = useState('')
      const [mastery, setMastery] = useState('all')
      const [scope, setScope] = useState('all')
      const [error, setError] = useState('')

      useEffect(() => {
        let cancelled = false
        Promise.all([
          listLexicon({ scope: 'all' }).then((result) => unwrap(result, t)).catch((cause) => {
            if (!cancelled) setError(String(cause?.message ?? cause))
            return null
          }),
          listGrammar({ scope: 'all' }).then((result) => unwrap(result, t)).catch(() => null),
        ]).then(([words, rules]) => {
          if (cancelled) return
          setLexicon(words)
          setGrammar(rules)
        })
        return () => { cancelled = true }
      }, [listLexicon, listGrammar, t])

      const entries = tab === 'vocab'
        ? (lexicon?.entries ?? []).map((entry) => ({
          id: entry.entryId,
          name: entry.mot,
          subline: entry.lemma ?? '',
          examples: (entry.occurrences ?? []).length,
          mastery: entry.mastery ?? '',
        }))
        : (grammar?.entries ?? []).map((entry) => ({
          id: entry.entryId,
          name: entry.title,
          subline: entry.module ?? entry.french ?? '',
          examples: (entry.examples ?? []).length,
          mastery: entry.mastery ?? '',
        }))
      const filtered = entries.filter((entry) => {
        if (mastery !== 'all' && entry.mastery !== mastery) return false
        if (query.trim() !== '' && !`${entry.name} ${entry.subline}`.toLowerCase().includes(query.trim().toLowerCase())) return false
        return true
      })

      return h('div', null,
        h('div', { className: 'kbBar' },
          h('button', { className: 'kbReturn', type: 'button', onClick: onReturn }, t('backToAnalysis')),
        ),
        h('h2', { className: 'detailTitle' }, t('tabKnowledge')),
        h('div', { className: 'kbTabs' },
          h('button', {
            className: tab === 'vocab' ? 'active' : '', type: 'button',
            onClick: () => { setTab('vocab'); setQuery('') },
          }, `${t('lexiconTab')} ${(lexicon?.entries ?? []).length}`),
          h('button', {
            className: tab === 'grammar' ? 'active' : '', type: 'button',
            onClick: () => { setTab('grammar'); setQuery('') },
          }, `${t('grammarTab')} ${(grammar?.entries ?? []).length}`),
        ),
        h('div', { className: 'kbSearch' },
          h('input', {
            id: 'kbSearch', 'aria-label': t('searchKnowledge'), value: query,
            placeholder: t('searchPlaceholder'),
            onChange: (event) => setQuery(event.target.value),
          }),
          h('select', {
            'aria-label': t('masteryFilter'), value: mastery,
            onChange: (event) => setMastery(event.target.value),
          }, [['all', t('masteryAll')], ['learning', t('masteryLearning')],
            ['reviewing', t('masteryReviewing')], ['known', t('masteryKnown')]]
            .map(([value, label]) => h('option', { key: value, value }, label))),
          h('select', {
            'aria-label': t('scopeFilter'), value: scope,
            onChange: (event) => setScope(event.target.value),
          },
            h('option', { value: 'all' }, t('scopeAll')),
            h('option', { value: 'sentence' }, t('scopeSentence'))),
        ),
        h('div', { id: 'kbRows', className: 'kbRows' },
          filtered.length === 0
            ? h('div', { className: 'kbEmpty' }, t('noMatchingEntry'))
            : filtered.map((entry) => h('button', {
              key: entry.id, className: 'kbRow', type: 'button',
              onClick: () => onOpenEntry(entry.id, tab),
            },
              h('div', null,
                h('div', { className: 'name' }, entry.name),
                h('div', { className: 'subline' }, entry.subline)),
              h('span', { className: 'kbStatus' }, format(t, 'exampleCount', { count: entry.examples })),
              h('span', { className: 'kbStatus' }, entry.mastery === '' ? t('masteryUnknown') : entry.mastery)))),
        error === '' ? null : h('p', { className: 'error', role: 'alert' }, t('knowledgeUnavailable')),
        h('p', { className: 'policyNote' }, t('knowledgePolicyNote')),
      )
    }

    /**
     * `renderKnowledgeEntry()`: the entry's own header above the card.
     *
     * The prototype shows a mastery select, the source, the question count and the
     * level/module line. Only some of that exists in this Host's model — `mastery`,
     * `askCount`, `level` and `module` live on **grammar** entries, and the lexicon view has
     * no mastery field at all — so the header renders what is real per tab instead of
     * inventing the missing half.
     */
    /**
     * The card's sections, rebuilt from the Host's own rendering.
     *
     * `renderCard()` emits one line per section — `§1 词条总览`, then the body, and
     * `（待补：该章节为空）` for a required section that is empty. The panel therefore splits
     * on **the Host's headings** (not on a guess), shows each as an `entrySection` with the
     * prototype's `sectionHeading`, keeps the Host's gap line as a `missingSection`, and
     * builds the `entryIndex` navigation from the section list the Host returns — so the
     * order stays the output policy's, never the panel's.
     */
    /**
     * `conjugationViewBody()` builds its head first: which tense, how many phonetic bases the
     * source yielded, how the reader wants it shown, and the honest audio state.
     *
     * Written as one small function returning one element: a five-kilobyte nested `h()` tree
     * is what broke the first attempt, so each piece is kept shallow and parse-checked.
     */
    /**
     * One person's row. The mode decides what is shown — the pronunciation, the spelling, or
     * both — and opening it repeats the same information in full beside the base it belongs
     * to. A form the Host could not attribute to a base says so rather than guessing.
     */
    function conjRow(t, form, mode, open, base, onToggle) {
      const person = CONJ_PERSONS[Number(String(form.person).slice(0, 1)) - 1] ?? String(form.person)
      const muted = base !== null && form.baseIndex !== base
      const head = h('button', { type: 'button', className: 'conjRowHead', onClick: onToggle },
        h('span', { className: 'conjPerson' }, person),
        mode === 'written' ? null : h('span', { className: 'conjIpa' }, `/${form.ipa}/`),
        mode === 'oral' ? null : h('span', { className: 'conjWritten' }, form.written))
      const detail = h('div', { className: 'conjDetail' },
        mode === 'oral' ? null : h('span', null, `${t('conjModeWritten')} ${form.written}`),
        mode === 'written' ? null : h('span', null, `${t('conjModeOral')} /${form.ipa}/`),
        form.baseIndex === null
          ? h('span', { className: 'conjGap' }, t('conjCellMissing'))
          : null)
      return h('div', {
        key: form.person,
        className: `conjRow${open ? ' isOpen' : ''}${muted ? ' isMuted' : ''}`,
      }, head, open ? detail : null)
    }

    /** `conjBaseRail`: one button per pronounced base, muted when another base is chosen. */
    /** The prototype's own person names, in its own order. */
    const CONJ_PERSONS = ['je', 'tu', 'il / elle', 'nous', 'vous', 'ils / elles']

    /**
     * The Host names a tense by code (`ind:pre`); the prototype's head shows its French name.
     * Naming a code is not inventing content — an unknown code falls back to the code itself.
     */
    const CONJ_TENSE_NAMES = {
      'ind:pre': 'PRÉSENT', 'ind:imp': 'IMPARFAIT', 'ind:fut': 'FUTUR', 'ind:ps': 'PASSÉ SIMPLE',
      'cnd:pre': 'CONDITIONNEL', 'sub:pre': 'SUBJONCTIF', 'imp:pre': 'IMPÉRATIF',
    }

    function conjugationTenseName(tense) {
      if (tense === null) return '—'
      const code = `${String(tense.mood)}:${String(tense.tense)}`
      return CONJ_TENSE_NAMES[code] ?? code.toUpperCase()
    }

    function conjBaseRail(t, bases, groups, base, onBase) {
      const buttons = bases.map((entry, index) => h('button', {
        key: `base-${String(index)}`,
        type: 'button',
        className: `conjBase${base !== null && base !== index ? ' isMuted' : ''}`,
        'aria-pressed': base === index ? 'true' : 'false',
        'aria-label': format(t, 'conjBaseLabel', { index: index + 1, persons: groups[index] }),
        onClick: () => onBase(base === index ? null : index),
      },
        h('span', { className: 'conjBaseNumber' }, `BASE ${String(index + 1).padStart(2, '0')}`),
        h('span', { className: 'conjBaseSound' }, `/${entry.ipa}/`),
        h('span', { className: 'conjBasePeople' }, groups[index])))
      return h('div', {
        className: `conjBaseRail${bases.length === 1 ? ' conjSingle' : ''}`,
        style: { '--base-count': String(Math.max(1, bases.length)) },
      }, buttons)
    }

    function conjTop(t, tense, baseCount, mode, onMode) {
      const modes = [['oral', t('conjModeOral')], ['both', t('conjModeBoth')], ['written', t('conjModeWritten')]]
      return h('div', { className: 'conjTop' },
        h('div', null,
          h('div', { className: 'conjTense' }, conjugationTenseName(tense)),
          h('div', { className: 'conjCount' },
            tense === null ? t('conjugationNoData') : tense.label,
            tense === null ? null : ` · ${format(t, 'conjBaseCount', { count: baseCount })}`,
            h('span', { className: 'conjAudioState' }, ` · ${t('audioUnavailable')}`)),
        ),
        h('div', { className: 'conjMode', role: 'group', 'aria-label': t('conjModeLabel') },
          modes.map(([key, label]) => h('button', {
            key, type: 'button', 'aria-pressed': mode === key ? 'true' : 'false',
            onClick: () => onMode(key),
          }, label))),
      )
    }

    /**
     * The conjugated view of one verb, per the prototype: a head, a base rail, then the rows.
     * The dataset comes from `readConjugation`; **only the reader's own press fetches**.
     */
    function ConjugationView({ t, lemma, readConjugation, fetchConjugation }) {
      const [state, setState] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [mode, setMode] = useState('both')
      const [base, setBase] = useState(null)
      const [row, setRow] = useState(null)

      useEffect(() => {
        let cancelled = false
        readConjugation({ lemma })
          .then((result) => { if (!cancelled) setState(unwrap(result, t)) })
          .catch((cause) => { if (!cancelled) setError(String(cause?.message ?? cause)) })
        return () => { cancelled = true }
      }, [lemma, readConjugation, t])

      async function fetchNow() {
        setBusy(true)
        setError('')
        try {
          await fetchConjugation({ lemma })
          setState(unwrap(await readConjugation({ lemma }), t))
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setBusy(false)
        }
      }

      const ready = state !== null && state.state === 'ready'
      const tense = ready ? (state.dataset?.tenses ?? [])[0] ?? null : null
      const baseCount = tense === null ? 0 : (tense.bases ?? []).length
      const bases = tense === null ? [] : (tense.bases ?? [])
      const groups = bases.map((entry) => entry.persons
        .map((person) => CONJ_PERSONS[Number(String(person).slice(0, 1)) - 1] ?? String(person))
        .join(' · '))
      return h('div', { className: 'conjugationView' },
        conjTop(t, tense, baseCount, mode, setMode),
        bases.length === 0 ? null : conjBaseRail(t, bases, groups, base, setBase),
        // `pending`: a previous fetch that never finished. The Host distinguishes it from
        // "no data", and so must the view — saying "no data" would hide a half-done fetch.
        state !== null && state.state === 'pending'
          ? h('p', { className: 'conjPending' }, format(t, 'conjugationPending', {
            status: state.status ?? '?',
            reason: state.reason ?? '',
            missing: state.missing ?? 0,
          }))
          : null,
        h('div', { className: 'conjRows' }, (tense === null ? [] : (tense.forms ?? []))
          .map((form) => conjRow(t, form, mode, row === form.person, base,
            () => setRow(row === form.person ? null : form.person)))),
        // What the source did not cover, per person: the prototype keeps these gaps visible.
        (tense?.missingPersons ?? []).length === 0
          ? null
          : h('ul', { className: 'conjMissing' }, (tense?.missingPersons ?? []).map((person) => h('li', {
            key: `missing-${String(person)}`,
            className: 'fr-help',
          }, `${CONJ_PERSONS[Number(String(person).slice(0, 1)) - 1] ?? String(person)} · ${t('conjugationCellMissing')}`))),
        error === '' ? null : h('p', { className: 'error', role: 'alert' }, error),
        // The three shapes the Host can return are named here, not inferred: `no-data`,
        // `pending` (above) and a ready dataset.
        state !== null && state.state === 'no-data'
          ? h('p', { className: 'conjReason' }, state.reason ?? t('conjugationNoData'))
          : null,
        ready ? null : h('div', { className: 'conjEmpty' },
          h('p', { className: 'hint' }, state !== null && state.reason !== undefined
            ? state.reason
            : t('conjugationHint')),
          h('button', {
            className: 'primary small', type: 'button', disabled: busy, onClick: fetchNow,
          }, busy ? t('conjugationFetching') : t('conjugationFetch'))),
      )
    }

    /**
     * `entryMetaGrid`: the entry's own fields, in the prototype's `dl` — and with the
     * prototype's own honesty about what is not recorded.
     *
     * This Host's `LexiconView` has no IPA and no register/frequency field, and the prototype
     * renders exactly `未记录` / `未评级` when it has nothing — so those two rows say the same
     * thing here rather than being dropped or invented.
     */
    /**
     * `renderGrammarDetail()`: a rule's stored content, its pitfalls, and — when there is no
     * extended breakdown — the prototype's own sentence saying so.
     *
     * The prototype fills `timeline` / `contrastPair` only for a hard-coded lesson shipped for
     * one demo entry; this Host stores `keyPoints` and a pitfall *count*, so the honest port is
     * the two real sections plus that line, not a fabricated lesson.
     */
    function GrammarDetail({ t, entry }) {
      return h('div', null,
        h('div', { className: 'sectionLabel' }, t('grammarStoredRule')),
        h('div', { className: 'entryBody preserveLines' },
          entry.keyPoints === undefined || entry.keyPoints === ''
            ? t('grammarRuleEmpty')
            : entry.keyPoints),
        h('section', { className: 'entrySection' },
          h('h3', { className: 'entryHeading' },
            h('span', { className: 'num' }, '01'), t('grammarPitfalls')),
          h('div', { className: 'entryBody' },
            (entry.pitfalls ?? 0) === 0
              ? t('notRecorded')
              : format(t, 'grammarPitfallCount', { count: entry.pitfalls ?? 0 }))),
        h('p', { className: 'missingSection' }, t('grammarNoBreakdown')),
      )
    }

    function entryMetaGrid(t, entry) {
      const row = (label, value) => [
        h('dt', { key: `dt-${label}` }, label),
        h('dd', { key: `dd-${label}` }, value),
      ]
      const rows = [
        ...row('Mot', entry.mot),
        ...row('Lemme', entry.lemma ?? '—'),
        ...row(t('partOfSpeechLabel'), entry.partOfSpeech),
        ...row('IPA', t('notRecorded')),
        ...row(t('registerFrequencyLabel'), `${t('notRecorded')} · ${t('notRated')}`),
        ...row(t('formsLabel'), String((entry.forms ?? []).length)),
        ...row(t('contentLabel'), entry.provenance === 'ai' ? t('contentAiUnverified')
          : entry.provenance === 'user' ? t('contentUser') : t('contentMixed')),
      ]
      return h('dl', { className: 'entryMetaGrid' }, rows)
    }

    function LexiconCard({ t, value, extraForSection, entry }) {
      const sections = value.sections ?? []
      const byNumber = new Map(sections.map((section, index) => [section.number, { ...section, index }]))
      const parsed = []
      for (const line of String(value.rendered ?? '').split('\n')) {
        const head = /^(§\S+)\s+(.*)$/u.exec(line.trim())
        const known = head === null ? undefined : byNumber.get(head[1])
        if (known !== undefined && !parsed.some((entry) => entry.number === known.number)) {
          parsed.push({ number: known.number, title: head[2] || known.title, body: [] })
          continue
        }
        if (parsed.length === 0) continue
        parsed[parsed.length - 1].body.push(line)
      }
      // Anything the Host rendered but did not announce still has to be reachable.
      const joined = parsed.map((section) => section.body.join('\n')).join('\n')
      if (joined.trim() === '') parsed.push({ number: '', title: '', body: String(value.rendered ?? '').split('\n') })

      const sectionId = (section) => `entry-section-${section.number.replace(/[^\w-]/gu, '')}`
      const jump = (id) => {
        if (typeof document === 'undefined') return
        const target = document.getElementById(id)
        if (target === null) return
        const reduce = typeof window !== 'undefined'
          && typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        target.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      }

      return h('div', null,
        h('nav', { className: 'entryIndex', 'aria-label': t('entryIndexLabel') },
          parsed.map((section) => h('button', {
            key: sectionId(section), type: 'button', onClick: () => jump(sectionId(section)),
          }, `${section.number} ${section.title}`.trim()))),
        parsed.map((section, position) => h('section', {
          key: `section-${sectionId(section)}`, className: 'entrySection', id: sectionId(section),
        },
          section.title === '' ? null : h('h3', { className: 'entryHeading' },
            h('span', { className: 'num' }, section.number), section.title),
          // `renderWordDetail` puts the field grid at the top of the first section.
          position === 0 && entry !== null && entry !== undefined && entry.mot !== undefined
            ? entryMetaGrid(t, entry)
            : null,
          section.body.map((line, index) => (line.trim() === '' ? null : h('p', {
            key: `line-${String(index)}`,
            className: line.trim().startsWith(t('sectionGapPrefix')) ? 'missingSection' : 'entryBody',
          }, line))),
          // The prototype puts the conjugated view *inside* the word entry; which section
          // that is comes from the Host's own list, so the seam asks rather than assumes.
          typeof extraForSection === 'function'
            ? extraForSection(section)
            : null,
        )),
      )
    }

    /** A verb's lemma, or null: only verbs conjugate, and only if we know the word. */
    function conjugationLemmaOf(lemma) {
      return typeof lemma === 'string' && lemma.trim() !== '' ? lemma.trim() : null
    }

    function KnowledgeEntry({ t, entryId, tab, listLexicon, listGrammar, setGrammarMastery, children }) {
      const [entry, setEntry] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)

      useEffect(() => {
        let cancelled = false
        const load = tab === 'grammar'
          ? listGrammar({ scope: 'all' }).then((result) => unwrap(result, t))
            .then((value) => (value.entries ?? []).find((item) => item.entryId === entryId) ?? null)
          : listLexicon({ scope: 'all' }).then((result) => unwrap(result, t))
            .then((value) => (value.entries ?? []).find((item) => item.entryId === entryId) ?? null)
        load.then((found) => { if (!cancelled) setEntry(found) })
          .catch((cause) => { if (!cancelled) setError(String(cause?.message ?? cause)) })
        return () => { cancelled = true }
      }, [entryId, tab, listLexicon, listGrammar, t])

      async function setMastery(next) {
        if (entry === null) return
        setBusy(true)
        try {
          await setGrammarMastery({ entryId: entry.entryId, mastery: next })
          setEntry({ ...entry, mastery: next })
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setBusy(false)
        }
      }

      const isWord = tab !== 'grammar'
      return h('div', null,
        h('h2', { className: isWord ? 'kbWord' : 'detailTitle' },
          entry === null ? t('knowledgeLoading') : (isWord ? entry.mot : entry.topic)),
        h('div', { className: 'kbIntro' },
          entry === null ? '' : (isWord ? [entry.lemma, entry.partOfSpeech].filter(Boolean).join(' · ') : (entry.module ?? ''))),
        h('div', { className: 'kbMeta' },
          isWord || entry === null ? null : h('select', {
            'aria-label': t('masteryFilter'), value: entry.mastery, disabled: busy,
            onChange: (event) => setMastery(event.target.value),
          }, [['learning', t('masteryLearning')], ['reviewing', t('masteryReviewing')],
            ['known', t('masteryKnown')]]
            .map(([value, label]) => h('option', { key: value, value }, label))),
          // `askCount` / `level` are grammar fields; the lexicon view has neither.
          isWord || entry === null ? null : h('span', null, format(t, 'askCount', { count: entry.askCount })),
          isWord || entry === null ? null : h('span', null, `${entry.level ?? t('masteryUnknown')} · ${entry.module ?? t('masteryUnknown')}`),
          isWord || entry === null ? null : h('span', null, entry.contentStatus === 'ai-unverified'
            ? t('contentAiUnverified')
            : entry.contentStatus)),
        error === '' ? null : h('p', { className: 'error', role: 'alert' }, error),
        // The entry is only known here, so the card is rendered through a function that
        // receives it — passing a captured value from the parent would be a stale read.
        typeof children === 'function' ? children(entry) : children,
      )
    }

    function KnowledgeSection({ t, listLexicon, listGrammar, renderLexicon, resolveGrammarCandidate, entry, extraForSection, tab = 'lexicon',
      listLexiconSources, fetchLexiconSource, setGrammarMastery, readConjugation, fetchConjugation }) {
      // `tab` arrives from the entry (词汇 / 语法): the library list owns that choice now.
      const [lexicon, setLexicon] = useState(null)
      const [grammar, setGrammar] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [status, setStatus] = useState('')
      const [card, setCard] = useState(null)
      const [drafts, setDrafts] = useState({})
      const [sources, setSources] = useState([])
      const [sourcePick, setSourcePick] = useState('')
      const [sourceSection, setSourceSection] = useState('')
      const [sourceState, setSourceState] = useState(null)
      const [conjugationLemma, setConjugationLemma] = useState('')
      const [conjugation, setConjugation] = useState(null)
      const [conjugationBusy, setConjugationBusy] = useState(false)

      const load = async (which) => {
        setBusy(true)
        setError('')
        try {
          if (which === 'lexicon') setLexicon(unwrap(await listLexicon({ scope: 'all' }), t))
          else if (which === 'grammar') setGrammar(unwrap(await listGrammar({ scope: 'all' }), t))
        } catch (cause) {
          setError(format(t, 'knowledgeUnavailable', { reason: String(cause?.message ?? cause) }))
        } finally {
          setBusy(false)
        }
      }

      /**
       * Read the stored pronunciation data for one verb.
       *
       * Reading never fetches: the three states the Host reports (`dataset`,
       * `pending`, `no-data`) are shown as themselves, because a card that showed an
       * empty paradigm for "not fetched yet" would be claiming the verb has no forms.
       */
      const loadConjugation = async (lemma) => {
        const wanted = lemma.trim()
        if (wanted === '') { setConjugation(null); return }
        setConjugationBusy(true)
        setError('')
        try {
          setConjugation(unwrap(await readConjugation({ lemma: wanted }), t))
        } catch (cause) {
          setError(format(t, 'knowledgeUnavailable', { reason: String(cause?.message ?? cause) }))
        } finally {
          setConjugationBusy(false)
        }
      }

      /**
       * Fetch one verb's paradigm — the reader's own act.
       *
       * Nothing fetches on its own: the button is the only trigger, and the outcome
       * (complete, partial, rate-limited, no table) is reported before the stored
       * record is read back.
       */
      const runConjugationFetch = async () => {
        const wanted = conjugationLemma.trim()
        if (wanted === '') return
        setConjugationBusy(true)
        setError('')
        setStatus('')
        try {
          const value = unwrap(await fetchConjugation({ lemma: wanted }), t)
          if (value.fetched !== true) {
            setError(format(t, 'conjugationRefused', { reason: String(value.reason ?? '') }))
            return
          }
          setStatus(format(t, 'conjugationFetched', {
            status: String(value.status ?? ''),
            tenses: value.tenses ?? 0,
            bases: value.bases ?? 0,
            requests: value.requests ?? 0,
            missing: value.missingForms ?? 0,
          }))
          await loadConjugation(wanted)
        } catch (cause) {
          setError(format(t, 'knowledgeUnavailable', { reason: String(cause?.message ?? cause) }))
        } finally {
          setConjugationBusy(false)
        }
      }

      useEffect(() => { load(tab) }, [tab])

      // The declared sources are a property of the Host, not of one entry.
      useEffect(() => {
        let cancelled = false
        listLexiconSources({ scope: 'all' })
          .then((result) => { if (!cancelled) setSources(unwrap(result, t).sources ?? []) })
          .catch(() => { if (!cancelled) setSources([]) })
        return () => { cancelled = true }
      }, [listLexiconSources, t])

      /**
       * Fetch one declared source for the open card.
       *
       * The verdict is what the reader sees: a page that loaded without a usable
       * body is reported as a failure with its reason, and the attempt is stored
       * on the entry either way.
       */
      const fetchSource = async (entry) => {
        if (sourcePick === '' || sourceSection === '') return
        setBusy(true)
        setError('')
        setSourceState(null)
        try {
          const value = unwrap(await fetchLexiconSource({
            entryId: entry.entryId, source: sourcePick, section: sourceSection, mot: entry.mot,
          }), t)
          if (value.fetched !== true) {
            setSourceState({ ok: false, text: format(t, 'sourceRefused', { reason: value.reason ?? '' }) })
          } else {
            setSourceState({
              ok: value.ok === true,
              text: `${value.outcome ?? ''} · ${value.note ?? ''}`,
            })
          }
          // Re-render the card: the stored source record is part of its evidence.
          const refreshed = unwrap(await renderLexicon({ entryId: entry.entryId, wantsEtymology: true }), t)
          setCard({ mot: entry.mot, entryId: entry.entryId, value: refreshed })
        } catch (cause) {
          setError(format(t, 'knowledgeUnavailable', { reason: String(cause?.message ?? cause) }))
        } finally {
          setBusy(false)
        }
      }

      /** The reader's own mastery decision. Nothing automatic writes this field. */
      const moveMastery = async (entry, mastery) => {
        setBusy(true)
        setError('')
        setStatus('')
        try {
          const value = unwrap(await setGrammarMastery({
            entryId: entry.entryId, mastery, expectedRevision: null, operationId: createUuid(),
          }), t)
          if (value.kind === 'conflict') setError(format(t, 'saveConflict', { reason: value.reason }))
          else setStatus(format(t, 'masteryDone', { mastery, kind: value.kind }))
          await load('grammar')
        } catch (cause) {
          setError(format(t, 'knowledgeUnavailable', { reason: String(cause?.message ?? cause) }))
        } finally {
          setBusy(false)
        }
      }

      const draftOf = (pendingId) => drafts[pendingId] ?? { target: '', rule: '' }
      const setDraft = (pendingId, patch) =>
        setDrafts((current) => ({ ...current, [pendingId]: { ...draftOf(pendingId), ...patch } }))

      const openCard = async (entry, wantsEtymology) => {
        setBusy(true)
        setError('')
        try {
          const value = unwrap(await renderLexicon({ entryId: entry.entryId, wantsEtymology }), t)
          setCard({ mot: entry.mot, entryId: entry.entryId, value })
        } catch (cause) {
          setError(format(t, 'knowledgeUnavailable', { reason: String(cause?.message ?? cause) }))
        } finally {
          setBusy(false)
        }
      }

      const decide = async (item, decision, entryId, rule) => {
        setBusy(true)
        setError('')
        setStatus('')
        try {
          const value = unwrap(await resolveGrammarCandidate({
            pendingId: item.pendingId,
            decision,
            entryId: entryId ?? null,
            // Naming new wording is the only path that rewrites a rule.
            keyPoints: rule === undefined || rule.trim() === '' ? null : rule,
            operationId: createUuid(),
          }), t)
          if (value.kind === 'conflict') setError(format(t, 'saveConflict', { reason: value.reason }))
          else setStatus(format(t, 'decisionDone', { outcome: value.kind }))
          await load('grammar')
        } catch (cause) {
          setError(format(t, 'knowledgeUnavailable', { reason: String(cause?.message ?? cause) }))
        } finally {
          setBusy(false)
        }
      }

      /**
       * The conjugation tab: one verb's phonetic bases, or the reason there are none.
       *
       * The reader picks the verb and presses the button; nothing here fetches by
       * itself, and the three states are rendered as themselves. A base is shown with
       * the persons that share it, because that — how many stems a tense is pronounced
       * with, and who shares each — is the reading the card exists to support.
       */
      // The persons a French paradigm has, so a gap can be shown where its row would be.
      const personLabels = {
        '1s': 'je', '2s': 'tu', '3s': 'il / elle', '1p': 'nous', '2p': 'vous', '3p': 'ils / elles',
      }

      const entries = tab === 'lexicon' ? (lexicon?.entries ?? []) : (grammar?.entries ?? [])
      const pending = tab === 'lexicon' ? [] : (grammar?.pending ?? [])

      return h('div', { className: 'fr-knowledge' },
        error === '' ? null : h('p', { className: 'fr-error', role: 'alert' }, error),
        status === '' ? null : h('p', { className: 'fr-status', role: 'status' }, status),
        tab === 'conjugation' ? null : (entries.length === 0 && !busy
          ? h('div', { className: 'fr-empty' }, tab === 'lexicon' ? t('noLexicon') : t('noGrammar'))
          : h('ul', { className: 'fr-entryList' }, entries.map((entry) => h('li', {
            key: entry.entryId, className: 'fr-entry',
          },
            h('div', { className: 'fr-entryHead' },
              h('span', { className: 'fr-entryName' }, tab === 'lexicon' ? entry.mot : entry.topic),
              h('span', { className: 'fr-branchKind' },
                tab === 'lexicon' ? entry.partOfSpeech : entry.mastery),
              h('span', { className: 'fr-help' }, tab === 'lexicon'
                ? format(t, 'lexiconMeta', { forms: entry.forms.length, senses: entry.senses.length })
                : format(t, 'grammarMeta', { count: entry.askCount, status: entry.contentStatus })),
              tab === 'grammar' ? h('span', { className: 'fr-anchorRowActions', style: { marginLeft: 'auto', display: 'flex', gap: '6px' } },
                ['learning', 'reviewing', 'known'].map((mastery) => h('button', {
                  key: mastery, className: 'fr-button fr-buttonQuiet', type: 'button',
                  disabled: busy || entry.mastery === mastery,
                  onClick: () => moveMastery(entry, mastery),
                }, t(`mastery_${mastery}`))),
              ) : null,
              tab === 'lexicon' ? h('span', { className: 'fr-anchorRowActions', style: { marginLeft: 'auto', display: 'flex', gap: '6px' } },
                h('button', {
                  className: 'fr-button fr-buttonQuiet', type: 'button', disabled: busy,
                  onClick: () => openCard(entry, false),
                }, t('openCard')),
                h('button', {
                  className: 'fr-button fr-buttonQuiet', type: 'button', disabled: busy,
                  onClick: () => openCard(entry, true),
                }, t('openCardEtymology')),
              ) : null,
            ),
            h('p', { className: 'fr-branchBody' }, tab === 'lexicon'
              ? (entry.senses[0]?.definition ?? '')
              : entry.keyPoints),
          )))),
        card === null ? null : h('div', { className: 'fr-nestedCard' },
          h('div', { className: 'fr-anchorRow' },
            h('span', { className: 'fr-label' }, format(t, 'cardTitle', { mot: card.mot })),
            h('span', { className: 'fr-help' }, card.value.kind === 'card'
              ? card.value.sections.map((section) => section.number).join(' ')
              : t('cardMissing')),
            h('button', {
              className: 'fr-button fr-buttonQuiet', type: 'button', onClick: () => setCard(null),
            }, t('closeCard')),
          ),
          card.value.kind !== 'card'
            ? null
            : h(LexiconCard, { t, value: card.value, extraForSection, entry }),
          card.value.kind !== 'card' || card.value.errors.length === 0 ? null
            : h('ul', { className: 'entryErrors' }, card.value.errors.map((message) => h('li', {
              key: message, className: 'fr-error',
            }, message))),
          card.value.kind !== 'card' || card.value.hints.length === 0 ? null
            : h('details', { className: 'entryFold' },
              h('summary', null, t('entryHintsSummary')),
              h('ul', { className: 'policyNote' }, card.value.hints.map((message) => h('li', {
                key: message, className: 'fr-help',
              }, message)))),
          // Sources are requested deliberately, one section at a time, and only
          // from the sources the Host declares.
          card.value.kind !== 'card' || sources.length === 0 ? null : h('div', { className: 'fr-sourceRow' },
            h('label', { className: 'fr-field' },
              h('span', { className: 'fr-label' }, t('sourceLabel')),
              h('select', {
                className: 'fr-select', value: sourcePick, disabled: busy,
                onChange: (event) => { setSourcePick(event.target.value); setSourceSection(''); setSourceState(null) },
              }, [h('option', { key: '', value: '' }, t('sourceNone'))].concat(
                sources.map((item) => h('option', { key: item.source, value: item.source }, item.source)),
              )),
            ),
            h('label', { className: 'fr-field' },
              h('span', { className: 'fr-label' }, t('sectionLabel')),
              h('select', {
                className: 'fr-select', value: sourceSection, disabled: busy || sourcePick === '',
                onChange: (event) => setSourceSection(event.target.value),
              }, [h('option', { key: '', value: '' }, t('sourceNone'))].concat(
                (sources.find((item) => item.source === sourcePick)?.sections ?? [])
                  .map((section) => h('option', { key: section, value: section }, section)),
              )),
            ),
            h('button', {
              className: 'fr-button', type: 'button',
              disabled: busy || sourcePick === '' || sourceSection === '',
              onClick: () => fetchSource(card),
            }, t('fetchSource')),
          ),
          sourceState === null ? null : h('p', {
            className: sourceState.ok ? 'fr-status' : 'fr-error',
            role: sourceState.ok ? 'status' : 'alert',
          }, sourceState.text),
        ),
        pending.length === 0 ? null : h('div', { className: 'fr-knowledge' },
          h('div', { className: 'fr-anchorRow' },
            h('span', { className: 'fr-label' }, t('pendingTitle')),
            h('span', { className: 'fr-help' }, t('pendingHelp')),
          ),
          h('ul', { className: 'fr-entryList' }, pending.map((item) => {
            const draft = draftOf(item.pendingId)
            const target = draft.target === '' ? (item.candidates[0]?.entryId ?? '') : draft.target
            return h('li', { key: item.pendingId, className: 'fr-entry' },
              h('div', { className: 'fr-entryHead' },
                h('span', { className: 'fr-entryName' }, item.topic),
                h('span', { className: 'fr-branchKind' },
                  item.resolution === null ? t('pendingOpen') : item.resolution),
              ),
              h('p', { className: 'fr-branchBody' }, item.body),
              h('p', { className: 'fr-help' }, item.candidates.map((candidate) => candidate.topic).join(' / ')),
              item.resolution !== null ? null : h('div', { className: 'fr-decision' },
                h('div', { className: 'fr-anchorRow fr-anchorRowActions' },
                  h('select', {
                    className: 'fr-select', style: { width: 'auto' }, value: target, disabled: busy,
                    onChange: (event) => setDraft(item.pendingId, { target: event.target.value }),
                  }, item.candidates.map((candidate) => h('option', {
                    key: candidate.entryId, value: candidate.entryId,
                  }, candidate.topic))),
                  h('button', {
                    className: 'fr-button', type: 'button', disabled: busy || target === '',
                    onClick: () => decide(item, 'attach', target, draft.rule),
                  }, t('attachTo')),
                ),
                h('input', {
                  className: 'fr-input', type: 'text', value: draft.rule, disabled: busy,
                  placeholder: t('ruleRewriteHint'),
                  onChange: (event) => setDraft(item.pendingId, { rule: event.target.value }),
                }),
                h('div', { className: 'fr-anchorRow fr-anchorRowActions' },
                  h('button', {
                    className: 'fr-button fr-buttonQuiet', type: 'button', disabled: busy,
                    onClick: () => decide(item, 'create', null, ''),
                  }, t('createAsNew')),
                  h('button', {
                    className: 'fr-button fr-buttonQuiet', type: 'button', disabled: busy,
                    onClick: () => decide(item, 'discard', null, ''),
                  }, t('discardCandidate')),
                ),
              ),
            )
          })),
        ),
      )
    }

    function PassagePage({t, listPassages, getPassage, createPassage, exportPassages, exportLibrary, previewImport, listLexicon, listGrammar, renderLexicon, resolveGrammarCandidate, listLexiconSources, fetchLexiconSource, setGrammarMastery, readConjugation, fetchConjugation, readSentenceAnalysis, readAnalysisCoverage, analyseSentence, analyseParagraph, publishAnalysis, createSelection, getSegmentation, listAnalysis, saveTranslation, addBranch, listBackends, listBackendModels, previewAsk, ask, streamAsk, listDiscussion, createBranch, setBranchState, onClose, lookupMot, recordConclusion, archivePassage}) {
      const [items, setItems] = useState([])
      const [offset, setOffset] = useState(0)
      const [total, setTotal] = useState(0)
      const [hasMore, setHasMore] = useState(false)
      const [loadingList, setLoadingList] = useState(true)
      const [loadingPassage, setLoadingPassage] = useState(false)
      const [busy, setBusy] = useState(false)
      const [exporting, setExporting] = useState(false)
      const [libraryTab, setLibraryTab] = useState('passages')
      const [selectedId, setSelectedId] = useState('')
      const [activePassage, setActivePassage] = useState(null)
      const [title, setTitle] = useState('')
      const [sourceText, setSourceText] = useState('')
      const [status, setStatus] = useState('')
      const [error, setError] = useState('')
      const [preview, setPreview] = useState(null)
      const pendingAttempt = useRef(null)
      const submitLock = useRef(false)

      const refreshList = useCallback(async (nextOffset = 0) => {
        setLoadingList(true)
        setError('')
        try {
          const all = []
          let nextPage = 0, value
          do {
            value = unwrap(await listPassages({ offset: nextPage, limit: PAGE_SIZE }), t)
            all.push(...(value.items ?? []))
            nextPage += (value.items ?? []).length
          } while (value.hasMore && (value.items ?? []).length)
          setItems(all)
          setOffset(0)
          setTotal(value.total ?? all.length)
          setHasMore(false)
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setLoadingList(false)
        }
      }, [listPassages, t])

      const openPassage = useCallback(async (id) => {
        const request = ++passageRequest.current
        setSelectedId(id)
        setLoadingPassage(true)
        setError('')
        try {
          const value = unwrap(await getPassage({ id }), t)
          if (request !== passageRequest.current) return
          displayedPassage.current = value.passage?.id ?? null
          setActivePassage(value.passage ?? null)
        } catch (cause) {
          if (request !== passageRequest.current) return
          displayedPassage.current = null
          setActivePassage(null)
          setError(String(cause?.message ?? cause))
        } finally {
          if (request === passageRequest.current) setLoadingPassage(false)
        }
      }, [getPassage, t])

      useEffect(() => { refreshList(0) }, [refreshList])

      /**
       * `readingScroller()`: which element scrolls the reading surface, and the prototype's
       * hand-over — the offset follows the reader into the new container and the old one is
       * reset, so nothing jumps and nothing is scrolled twice.
       */
      useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
        const query = window.matchMedia('(max-height: 500px)')
        setShortReading(query.matches)
        const onChange = () => {
          const from = (query.matches ? detailScrollRef.current : readingPaneRef.current)
          const to = (query.matches ? readingPaneRef.current : detailScrollRef.current)
          const offset = from?.scrollTop ?? 0
          setShortReading(query.matches)
          requestAnimationFrame(() => {
            if (to !== null && to !== undefined) to.scrollTop = offset
            if (from !== null && from !== undefined) from.scrollTop = 0
          })
        }
        query.addEventListener('change', onChange)
        return () => query.removeEventListener('change', onChange)
      }, [])

      // `gesture*` has no React synthetic event, so the stage binds it directly; the same
      // effect keeps the world centred when the stage is resized.
      useEffect(() => {
        const stage = navStage.current
        if (stage === null || stage === undefined) return undefined
        const start = (event) => onGestureStart({ ...event, currentTarget: stage, preventDefault: () => event.preventDefault() })
        const change = (event) => onGestureChange({ ...event, currentTarget: stage, preventDefault: () => event.preventDefault() })
        const end = (event) => onGestureEnd({ ...event, currentTarget: stage, preventDefault: () => event.preventDefault() })
        stage.addEventListener('gesturestart', start)
        stage.addEventListener('gesturechange', change)
        stage.addEventListener('gestureend', end)
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => syncStageSize())
        observer?.observe(stage)
        return () => {
          stage.removeEventListener('gesturestart', start)
          stage.removeEventListener('gesturechange', change)
          stage.removeEventListener('gestureend', end)
          observer?.disconnect()
        }
      }, [])

      async function submit(event) {
        event.preventDefault()
        if (submitLock.current) return
        setError('')
        setStatus('')
        if (draftLocation.book.trim() && (!Number.isSafeInteger(draftLocation.number) || draftLocation.number < 1 || Object.values(shelf.placements).some((loc) => loc.book === draftLocation.book.trim() && loc.chapter === (draftLocation.chapter.trim() || t('noChapter')) && loc.number === draftLocation.number))) { setError(t('locationConflict')); return }
        if (!title.trim()) { setError(t('titleRequired')); return }
        if (!sourceText.trim()) { setError(t('sourceRequired')); return }
        if (sourceText.length > 20000) { setError(t('sourceLimit')); return }

        // First press previews what would be stored; the confirming press
        // reuses that preview, so the text the reader saw is the text saved.
        if (preview === null || preview.unavailable || preview.sourceText !== sourceText || preview.title !== title.trim()) {
          submitLock.current = true
          setBusy(true)
          setError('')
          try {
            const value = unwrap(await previewImport({ title: title.trim(), sourceText }), t)
            setPreview({ ...value, sourceText, title: title.trim() })
            setStatus(t('previewReady'))
          } catch (cause) {
            // The preview is the confirmation step, so it never fails open: the
            // reader is told what happened and decides on the next press.
            setPreview({ unavailable: true, reason: String(cause?.message ?? cause), sourceText, title: title.trim() })
            setError(format(t, 'previewUnavailable', { reason: String(cause?.message ?? cause) }))
          } finally {
            submitLock.current = false
            setBusy(false)
          }
          return
        }

        submitLock.current = true
        setBusy(true)
        try {
          const fingerprint = await sourceFingerprint(title, sourceText)
          let attempt = pendingAttempt.current ?? readPendingAttempt()
          if (!attempt || attempt.fingerprint !== fingerprint) {
            attempt = {
              fingerprint,
              id: createUuid(),
              operationId: createUuid(),
            }
            persistPendingAttempt(attempt)
          }
          pendingAttempt.current = attempt

          const value = unwrap(await createPassage({
            id: attempt.id,
            operationId: attempt.operationId,
            title: title.trim(),
            sourceText,
          }), t)
          if (value.kind === 'conflict') {
            const reason = value.reason === 'limit-reached' ? t('limitReached')
              : value.reason === 'id-used' ? t('idUsed') : t('operationUsed')
            setError(value.reason === 'limit-reached' ? reason : format(t, 'saveConflict', { reason }))
            pendingAttempt.current = null
            clearPendingAttempt()
            return
          }
          if (draftLocation.book.trim()) {
            const loc = { book: draftLocation.book.trim(), chapter: draftLocation.chapter.trim() || t('noChapter'), number: draftLocation.number }
            setShelf((current) => ({ ...addShelfChapter(current, loc.book, loc.chapter), placements: { ...current.placements, [value.passage.id]: loc } }))
          }
          pendingAttempt.current = null
          clearPendingAttempt()
          setTitle('')
          setSourceText('')
          setPreview(null)
          setStatus(t(value.kind === 'already-saved' ? 'alreadySaved' : 'saved'))
          if (switcherMode === 'continue' && continuationParent !== null) {
            setNextPassages((current) => ({ ...current, [continuationParent]: { id: value.passage.id, title: value.passage.title } }))
            setContinuationParent(null)
            setSwitcherOpen(false)
            setToast(t('nextPassageSaved'))
            await refreshList(0)
          } else {
            setSwitcherOpen(false)
            await refreshList(0)
            await openPassage(value.passage.id)
          }
        } catch (cause) {
          // Keep the idempotency token across retries; sessionStorage holds no source text.
          setError(String(cause?.message ?? cause))
        } finally {
          submitLock.current = false
          setBusy(false)
        }
      }

      async function exportBackup() {
        setExporting(true)
        setError('')
        setStatus('')
        try {
          // The whole library, not just the sources: analysis, variants,
          // branches, runs, vocabulary and grammar all live in the records.
          const value = unwrap(await exportLibrary(), t)
          const name = `french-close-reading-${new Date().toISOString().slice(0, 10)}.json`
          downloadJson(value, name)
          setStatus(format(t, 'exportDone', { count: value.records.length }))
        } catch (cause) {
          setError(`${t('backupFailed')} ${String(cause?.message ?? cause)}`)
        } finally {
          setExporting(false)
        }
      }

      /**
       * `archivePassage`: archive one passage from the switcher.
       *
       * The endpoint has always existed, but nothing in the panel ever called it — archiving was
       * unreachable. It takes the revision the reader is looking at, so archiving a passage that
       * changed underneath is refused rather than silently applied.
       */
      async function archiveOne(item) {
        setExporting(true)
        setError('')
        try {
          const value = unwrap(await archivePassage({
            passageId: item.id,
            operationId: createUuid(),
            expectedSourceRevision: item.sourceRevision ?? 1,
          }), t)
          if (value.kind === 'conflict') {
            setError(format(t, 'saveConflict', { reason: value.reason }))
            return
          }
          setShelf((current) => { const placements = { ...current.placements }; delete placements[item.id]; return { ...current, placements } })
          setStatus(t('archiveDone'))
          setNextPassages((current) => Object.fromEntries(Object.entries(current).filter(([parent, next]) => parent !== item.id && next.id !== item.id)))
          await refreshList(0)
          if (displayedPassage.current === item.id) {
            passageRequest.current += 1
            displayedPassage.current = null
            setActivePassage(null)
            setSelectedId('')
          }
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setExporting(false)
        }
      }

      async function exportSources() {
        setExporting(true)
        setError('')
        setStatus('')
        try {
          const value = unwrap(await exportPassages(), t)
          const name = `french-close-reading-sources-${new Date().toISOString().slice(0, 10)}.json`
          downloadJson(value, name)
          setStatus(t('exportSourcesDone'))
        } catch (cause) {
          setError(`${t('backupFailed')} ${String(cause?.message ?? cause)}`)
        } finally {
          setExporting(false)
        }
      }

      // --- reading view ---------------------------------------------------
      const [segmentation, setSegmentation] = useState(null)
      const [analysis, setAnalysis] = useState(null)
      const [anchorId, setAnchorId] = useState('passage')
      const [drafts, setDrafts] = useState({})
      const [branchKind, setBranchKind] = useState('constituents')
      const [branchTitle, setBranchTitle] = useState('')
      const [branchBody, setBranchBody] = useState('')
      const [readingBusy, setReadingBusy] = useState(false)
      const [readingStatus, setReadingStatus] = useState('')
      const [pendingSelection, setPendingSelection] = useState(null)
      const [backends, setBackends] = useState([])
      const [backend, setBackend] = useState('')
      const [models, setModels] = useState([])
      const [model, setModel] = useState('')
      const [discussion, setDiscussion] = useState(null)
      const [askDraft, setAskDraft] = useState('')
      const [contextPreview, setContextPreview] = useState(null)
      const [askBusy, setAskBusy] = useState(false)
      const [askStatus, setAskStatus] = useState('')
      // The answer as it arrives. Cleared when the turn settles, because the stored
      // message then carries the same text and two copies would drift apart.
      const [streamText, setStreamText] = useState('')
      const [sentenceAnalysis, setSentenceAnalysis] = useState(null)
      const [coverage, setCoverage] = useState(null)
      const [analysisBusy, setAnalysisBusy] = useState(false)
      const [analysisStatus, setAnalysisStatus] = useState('')
      const [analysisError, setAnalysisError] = useState('')
      // The navigation canvas is the prototype's reading surface: its own camera, and the
      // knowledge view swaps the *detail pane* rather than leaving the passage.
      const [navOpen, setNavOpen] = useState(true)
      // The prototype opens the canvas at 65% (`{x:20, y:20, scale:.65}`), not at
      // 100%: the whole card column fits a navigation too narrow for the full-size
      // cards, which is exactly the case in a panel window.
      const [nav, setNav] = useState({ x: 20, y: 20, scale: 0.65 })
      const [knowledgeOpen, setKnowledgeOpen] = useState(false)
      // `kbUI.mode`/`kbUI.entry`: which knowledge surface the detail pane shows.
      const [knowledgeEntryId, setKnowledgeEntryId] = useState(null)
      const [knowledgeTab, setKnowledgeTab] = useState('vocab')
      // The passage switcher lives over the panel, opened from the brand title.
      const [switcherOpen, setSwitcherOpen] = useState(false)
      const [switcherMode, setSwitcherMode] = useState('list')
      const navStage = useRef(null)
      const navDrag = useRef(null)
      const toastTimer = useRef(null)
      const gesture = useRef(null)
      const ignoreWheelUntil = useRef(0)
      const stageSize = useRef(null)
      // The laid-out world's size, kept from the last render so camera moves can be
      // clamped against it (a camera that loses the text is a bug, not a view).
      const navWorldSize = useRef(null)
      // Where the reader was before the knowledge base took over the pane.
      const returnPoint = useRef(null)
      const detailScrollRef = useRef(null)
      const readingPaneRef = useRef(null)
      const [toast, setToast] = useState('')
      // The prototype ships syntax colouring on, and a second switch for the translation.
      const [syntaxColour, setSyntaxColour] = useState(true)
      // `state.selected`: the node the detail pane renders. Selection follows the
      // prototype's rule — a sentence selects its analysis node when it has one.
      const [selectedNode, setSelectedNode] = useState(null)
      // The three application dialogs, and the fork/cut the branch dialog was opened with.
      const [branchDialog, setBranchDialog] = useState(null)
      // `branchTitle`/`setBranchTitle` already exist for the branch composer, so the dialog
      // reuses them instead of declaring a second field of the same name.
      const [lookupOpen, setLookupOpen] = useState(false)
      const [branchHint, setBranchHint] = useState('')
      const [lookupInput, setLookupInput] = useState('')
      // `selectedMot`: the word 查词 will act on, captured from the detail pane.
      const [selectedWord, setSelectedWord] = useState('')
      const [actionDialog, setActionDialog] = useState(null)
      // `shortReadingLayout`: below 500px of height the prototype scrolls the whole detail
      // pane instead of the inner column, and moves the offset across when it switches.
      const [shortReading, setShortReading] = useState(false)
      // `compactLayout` / `wideNavPreference`: below 1190px of **panel** width (or a
      // portrait panel) the navigation becomes a drawer, and the wide layout's
      // open/closed choice is remembered. The breakpoint is the panel's own width —
      // measured from the rendered root — because the panel lives inside a shell
      // whose sidebar is not part of the viewport's arithmetic. 1190, not the
      // prototype's window-based 1120: wide mode needs nav(380) + detail(780) + 30.
      const [compact, setCompact] = useState(false)
      const wideNavPreference = useRef(true)
      const navToggleRef = useRef(null)
      const rootRef = useRef(null)
      const [actionText, setActionText] = useState('')
      const actionOpener = useRef(null)
      const [syntaxChinese, setSyntaxChinese] = useState(false)
      // The canvas rows' real heights, measured after render. The prototype's 215px
      // pitch fits its own demo sentences; a real sentence can be several times
      // taller, and the geometry only holds once it knows that. Declared after the
      // prototype-faithful states so the preview harness's seeded state indices do
      // not shift.
      const [navRowHeights, setNavRowHeights] = useState(null)
      // The in-flight analysis run, if any: the panel shows its stage and elapsed
      // time, offers 取消, and refuses to start a second one. A run is bound to the
      // passage/sentence it started on — navigating away cancels it, so 解析中 never
      // describes work the reader can no longer see.
      const [analysisRun, setAnalysisRun] = useState(null)
      const [analysisTick, setAnalysisTick] = useState(0)
      // Feedback is stamped with the passage and the sentence it is about: a
      // timeout on sentence 1 must never be read as a verdict on sentence 2, and
      // a cancellation receipt must not follow the reader into another passage.
      const [analysisFeedbackFor, setAnalysisFeedbackFor] = useState(null)
      const analysisAbortRef = useRef(null)
      const analysisBusyRef = useRef(false)
      const analysisRunSeq = useRef(0)
      const analysisCancelledRef = useRef(false)
      const analysisTimedOutRef = useRef(false)
      // A generation call is bounded: a provider stream that never finishes must
      // not leave 解析中 on screen forever. The reader can always cancel earlier.
      const ANALYSIS_TIMEOUT_MS = 180000
      const [continuationParent, setContinuationParent] = useState(null)
      const [nextPassages, setNextPassages] = useState(readContinuationLinks())
      const [shelf, setShelf] = useState(readShelf())
      const [directoryOpen, setDirectoryOpen] = useState(true)
      const [locationDialog, setLocationDialog] = useState(null)
      const [draftLocation, setDraftLocation] = useState({ book: '', chapter: '', number: 1 })
      const [shelfError, setShelfError] = useState('')
      const directorySize = useRef(null)
      // Discard reads from an earlier selection, including A -> B -> A.
      const passageRequest = useRef(0)
      const displayedPassage = useRef(activePassage?.id ?? null)
      function currentRead(passageId, request) {
        return passageRequest.current === request && displayedPassage.current === passageId
      }
      function showBookshelf() {
        passageRequest.current += 1
        displayedPassage.current = null
        setLoadingPassage(false)
        setActivePassage(null)
        setSelectedId('')
        setKnowledgeOpen(false)
        setDirectoryOpen(true)
      }
      useEffect(() => {
        try { localStorage.setItem(SHELF_KEY, JSON.stringify(shelf)); setShelfError('') }
        catch { setShelfError(t('shelfLocal') + ' · ' + t('requestFailed')) }
      }, [shelf])
      useEffect(() => {
        const root = rootRef.current
        if (!root || typeof ResizeObserver === 'undefined') return
        const sync = () => {
          const narrow = root.getBoundingClientRect().width < 960
          if (directorySize.current !== narrow) { setDirectoryOpen(!narrow); directorySize.current = narrow }
        }
        sync()
        const observer = new ResizeObserver(sync)
        observer.observe(root)
        return () => observer.disconnect()
      }, [])

      function nextChapterNumber(book, chapter, after = 0) {
        const used = new Set(Object.values(shelf.placements).filter((loc) => loc.book === book && loc.chapter === chapter).map((loc) => loc.number))
        let number = Math.max(1, after + 1)
        while (used.has(number)) number += 1
        return number
      }
      function beginChapterPassage(book = '', chapter = '') {
        setDraftLocation({ book, chapter, number: nextChapterNumber(book, chapter) })
        setTitle(book ? nextPassageTitle(`${book} · ${chapter}`, [], nextChapterNumber(book, chapter)) : '')
        setSourceText(''); setPreview(null); setStatus(''); setError('')
        setContinuationParent(null)
        setSwitcherMode('new'); setSwitcherOpen(true)
      }
      function saveShelfLocation() {
        const { book, chapter, number, passageId } = locationDialog
        const bookName = book.trim(), chapterName = chapter.trim() || t('noChapter')
        if (!bookName) { setError(t('bookRequired')); return }
        if (passageId && (!Number.isSafeInteger(number) || number < 1 || Object.entries(shelf.placements).some(([id, loc]) => id !== passageId && loc.book === bookName && loc.chapter === chapterName && loc.number === number))) {
          setError(t('locationConflict')); return
        }
        setShelf((current) => {
          const next = addShelfChapter(current, bookName, chapterName)
          return passageId ? { ...next, placements: { ...next.placements, [passageId]: { book: bookName, chapter: chapterName, number } } } : next
        })
        setLocationDialog(null); setError('')
      }
      function locationFields(value, update, includeNumber = true) {
        return h('div', { className: 'locationFields' },
          h('label', { className: 'kbField' }, h('span', null, t('bookField')),
            h('input', { value: value.book, maxLength: 100, list: 'shelf-books', 'aria-label': t('bookField'), disabled: busy,
              onChange: (event) => update({ ...value, book: event.target.value }) })),
          h('datalist', { id: 'shelf-books' }, shelf.books.map((book) => h('option', { key: book.name, value: book.name }))),
          h('label', { className: 'kbField' }, h('span', null, t('chapterField')),
            h('input', { value: value.chapter, maxLength: 100, list: 'shelf-chapters', 'aria-label': t('chapterField'), disabled: busy,
              onChange: (event) => update({ ...value, chapter: event.target.value }) })),
          h('datalist', { id: 'shelf-chapters' }, (shelf.books.find((book) => book.name === value.book)?.chapters ?? []).map((chapter) => h('option', { key: chapter, value: chapter }))),
          includeNumber ? h('label', { className: 'kbField numberField' }, h('span', null, t('numberField')),
            h('input', { type: 'number', min: 1, step: 1, value: value.number, 'aria-label': t('numberField'), disabled: busy,
              onChange: (event) => update({ ...value, number: Number(event.target.value) }) })) : null)
      }
      function locationDialogView() {
        return h('div', { className: 'modalBackdrop' }, h('div', { className: 'modal switcher', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'location-title',
          onKeyDown: (event) => {
            if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); setLocationDialog(null); setError('') }
            if (event.key !== 'Tab') return
            const fields = Array.from(event.currentTarget.querySelectorAll('input:not(:disabled), button:not(:disabled)'))
            const first = fields[0], last = fields[fields.length - 1]
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
          } },
          h('h2', { id: 'location-title' }, locationDialog.passageId ? t('organizePassage') : locationDialog.kind === 'chapter' ? t('newChapter') : t('newBook')),
          locationFields(locationDialog, setLocationDialog, !!locationDialog.passageId),
          error ? h('p', { className: 'error', role: 'alert' }, error) : null,
          h('div', { className: 'modalFoot' },
            h('button', { type: 'button', onClick: () => { setLocationDialog(null); setError('') } }, t('cancel')),
            locationDialog.passageId && shelf.placements[locationDialog.passageId] ? h('button', { type: 'button', onClick: () => {
              setShelf((current) => { const placements = { ...current.placements }; delete placements[locationDialog.passageId]; return { ...current, placements } }); setLocationDialog(null); setError('')
            } }, t('unfilePassage')) : null,
            h('button', { type: 'button', className: 'primary', onClick: saveShelfLocation }, t('saveLocation')))))
      }
      useEffect(() => {
        if (!locationDialog || typeof document === 'undefined') return
        const opener = document.activeElement
        const dialog = rootRef.current?.querySelector('[aria-labelledby="location-title"]')
        dialog?.querySelector('input')?.focus({ preventScroll: true })
        return () => { if (opener?.isConnected) opener.focus?.({ preventScroll: true }) }
      }, [locationDialog !== null])
      useEffect(() => {
        if (branchDialog === null || typeof document === 'undefined') return
        const opener = document.activeElement
        rootRef.current?.querySelector('#branchInput')?.focus({ preventScroll: true })
        return () => { if (opener?.isConnected) opener.focus?.({ preventScroll: true }) }
      }, [branchDialog !== null])
      function bookDirectory() {
        const rows = (book, chapter) => items.filter((item) => {
          const loc = shelf.placements[item.id]
          return book === null ? !loc : loc?.book === book && loc.chapter === chapter
        }).sort((a, b) => (shelf.placements[a.id]?.number ?? 0) - (shelf.placements[b.id]?.number ?? 0))
          .map((item) => h('div', { key: item.id, className: `shelfRow${activePassage?.id === item.id ? ' current' : ''}` },
            h('button', { type: 'button', className: 'shelfPassage', 'aria-current': activePassage?.id === item.id ? 'page' : null,
              onClick: () => { void openPassage(item.id); if (directorySize.current) setDirectoryOpen(false); setKnowledgeOpen(false) } },
              h('span', { className: 'shelfNumber' }, shelf.placements[item.id] ? String(shelf.placements[item.id].number).padStart(2, '0') : '—'),
              h('span', { className: 'shelfPassageText' }, h('span', null, item.title || t('untitled')), h('small', null, item.excerpt ?? ''))),
            h('button', { className: 'shelfOrganize', type: 'button', title: t('organizePassage'), 'aria-label': `${t('organizePassage')} · ${item.title}`,
              onClick: () => { setError(''); setLocationDialog({ passageId: item.id, ...(shelf.placements[item.id] ?? { book: '', chapter: '', number: 1 }) }) } }, '···')))
        return h('aside', { className: `bookDirectory${directoryOpen ? '' : ' hiddenDirectory'}`, 'aria-label': t('shelfTitle'), id: 'book-directory' },
          h('div', { className: 'directoryHead' }, h('strong', null, t('shelfTitle')),
            h('button', { className: 'small', type: 'button', onClick: () => { setError(''); setLocationDialog({ book: '', chapter: '', number: 1 }) } }, t('newBook'))),
          h('div', { className: 'directoryTree' },
            loadingList ? h('p', { className: 'hint' }, t('loading')) : null,
            shelf.books.map((book) => h('details', { key: book.name, className: 'shelfBook', open: true },
              h('summary', null, book.name),
              book.chapters.map((chapter) => h('details', { key: chapter, className: 'shelfChapter', open: true },
                h('summary', null, chapter), rows(book.name, chapter),
                h('button', { className: 'chapterAdd', type: 'button', onClick: () => beginChapterPassage(book.name, chapter) }, `＋ ${t('addToChapter')}`))),
              h('button', { className: 'chapterAdd', type: 'button', onClick: () => { setError(''); setLocationDialog({ book: book.name, chapter: '', number: 1, kind: 'chapter' }) } }, `＋ ${t('newChapter')}`),
              !Object.values(shelf.placements).some((loc) => loc.book === book.name) ? h('button', { className: 'chapterAdd', type: 'button', onClick: () => setShelf((current) => ({ ...current, books: current.books.filter((entry) => entry.name !== book.name) })) }, t('removeEmptyBook')) : null)),
            items.some((item) => !shelf.placements[item.id]) ? h('details', { className: 'shelfBook unfiledBook', open: true },
              h('summary', null, t('unfiled')), rows(null, null)) : null,
            shelf.books.length === 0 && items.length === 0 ? h('p', { className: 'hint' }, t('shelfEmpty')) : null),
          h('div', { className: 'directoryFoot' }, h('small', null, shelfError || t('shelfLocal')),
            h('button', { type: 'button', className: 'small quiet', onClick: () => setDirectoryOpen(false) }, t('closeDirectory')),
            h('button', { type: 'button', className: 'small quiet', disabled: exporting, onClick: exportBackup }, t('exportAll')),
            h('button', { type: 'button', className: 'small quiet', onClick: () => { setSwitcherMode('list'); setSwitcherOpen(true) } }, t('libraryActions'))))
      }
      function readingSource() {
        if (knowledgeOpen) return null
        return h('details', { className: 'readingSource', 'aria-label': t('sourceReading') },
          h('summary', { className: 'sourceSectionHead' }, h('strong', null, t('sourceReading')), h('span', null, t('sourceSelectHint'))),
          segmentation === null ? h('p', { className: 'quote' }, activePassage.sourceText) : (segmentation.paragraphs ?? []).map((paragraph) => h('p', { className: 'sourceParagraph quote', key: paragraph.id },
            paragraph.sentences.map((sentence) => h('span', { key: sentence.id, className: `readingSentence${anchorId === sentence.id ? ' selected' : ''}`, role: 'button', tabIndex: 0,
              'aria-label': sentence.text,
              onClick: () => { if (!window.getSelection?.()?.toString().trim()) selectSentence(sentence.id) },
              onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectSentence(sentence.id) } } }, sentence.text, ' ')))))
      }

      useEffect(() => {
        try { localStorage.setItem(CONTINUATION_KEY, JSON.stringify(nextPassages)) } catch { /* Links remain available in this panel. */ }
      }, [nextPassages])

      async function composeNextPassage() {
        if (activePassage === null || busy) return
        const parentId = activePassage.id
        setError('')
        if (continuationParent !== parentId) {
          setBusy(true)
          try {
            // Read all pages, so numbering does not depend on the visible library page.
            const titles = []
            let pageOffset = 0
            while (true) {
              const page = unwrap(await listPassages({ offset: pageOffset, limit: PAGE_SIZE }), t)
              titles.push(...(page.items ?? []).map((item) => item.title))
              if (!page.hasMore || !(page.items ?? []).length) break
              pageOffset += page.items.length
            }
            const location = shelf.placements[parentId]
            const nextTitle = nextPassageTitle(activePassage.title, titles, location ? nextChapterNumber(location.book, location.chapter, location.number) : null)
            const number = Number(/段落\s*(\d+)$/u.exec(nextTitle)?.[1] ?? 1)
            setDraftLocation(location ? { ...location, number } : { book: '', chapter: '', number })
            setTitle(nextTitle)
            setSourceText('')
            setPreview(null)
            setStatus('')
            setContinuationParent(parentId)
          } catch (cause) {
            setError(String(cause?.message ?? cause))
            return
          } finally { setBusy(false) }
        }
        setSwitcherMode('continue')
        setSwitcherOpen(true)
      }


      /**
       * `toggleNavigation(force)`: remembers the reader's choice in the wide layout, and in the
       * compact drawer moves the focus to the canvas so the keyboard follows the panel that
       * just appeared.
       */
      function toggleNavigation(force) {
        const wasOpen = navOpen
        const next = typeof force === 'boolean' ? force : !navOpen
        setNavOpen(next)
        if (next && directorySize.current) setDirectoryOpen(false)
        if (!next) navToggleRef.current?.focus?.({ preventScroll: true })
        if (!compact) wideNavPreference.current = next
        if (next && !wasOpen && compact) {
          const stage = navStage.current
          if (stage !== null && stage !== undefined) stage.focus({ preventScroll: true })
        }
      }

      function toggleDirectory() {
        if (!directoryOpen && directorySize.current) toggleNavigation(false)
        setDirectoryOpen((open) => !open)
      }

      function onNavigationKeyDown(event) {
        if (event.isComposing) return
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); toggleNavigation(false); return
        }
        if (event.target !== event.currentTarget) return
        if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomNavBy(1.25); return }
        if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomNavBy(0.8); return }
        const delta = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[event.key]
        if (delta) { event.preventDefault(); setNav((current) => clampNavCamera({ ...current, x: current.x + delta[0], y: current.y + delta[1] })) }
      }

      useEffect(() => {
        if (compact && navOpen && !switcherOpen && !locationDialog) navStage.current?.focus?.({ preventScroll: true })
      }, [compact, navOpen, switcherOpen, locationDialog])

      /**
       * `adaptLayout()`: when the **panel** becomes compact the drawer closes; if the
       * focus was inside the navigation at that moment it moves to the toggle instead
       * of disappearing into a hidden region. Measured on the panel's root, not on
       * the window — the shell's sidebar is not ours to layout against.
       */
      useEffect(() => {
        if (typeof ResizeObserver === 'undefined') return undefined
        const apply = () => {
          const root = rootRef.current
          if (root === null || root === undefined) return
          const box = root.getBoundingClientRect()
          if (box.width < 1) return
          const next = box.width <= 1190 || box.width / Math.max(1, box.height) <= 1
          setCompact(next)
          setNavOpen((open) => {
            if (next) {
              wideNavPreference.current = open
              return false
            }
            return wideNavPreference.current
          })
          if (!next) return
          const pane = navStage.current?.closest('.navigation')
          const active = typeof document === 'undefined' ? null : document.activeElement
          if (pane !== null && pane !== undefined && active !== null && pane.contains(active)) {
            navToggleRef.current?.focus?.({ preventScroll: true })
          }
        }
        apply()
        const root = rootRef.current
        if (root === null || root === undefined) return undefined
        const observer = new ResizeObserver(apply)
        observer.observe(root)
        return () => observer.disconnect()
      }, [activePassage])

      // `updateNavigationVisibility()`: in the compact drawer the reading pane is inert, so a
      // tap cannot reach the text behind the overlay.
      useEffect(() => {
        const pane = readingPaneRef.current
        if (pane === null || pane === undefined) return
        pane.inert = compact && navOpen
      }, [compact, navOpen])

      /**
       * `saveReadingPoint()` / `returnToReading()`: leaving for the knowledge base remembers
       * where the reader was — the sentence, the node they had selected, and how far down the
       * reading surface they had scrolled — and coming back restores all three.
       */
      function openKnowledge() {
        toggleNavigation(false)
        const scroller = shortReading ? readingPaneRef.current : detailScrollRef.current
        returnPoint.current = {
          anchorId,
          selectedNode,
          scroll: scroller?.scrollTop ?? 0,
        }
        setKnowledgeOpen(true)
        setKnowledgeEntryId(null)
      }

      function returnToAnalysis() {
        const point = returnPoint.current
        setKnowledgeOpen(false)
        setKnowledgeEntryId(null)
        if (point === null) return
        setAnchorId(point.anchorId)
        setSelectedNode(point.selectedNode)
        requestAnimationFrame(() => {
          const scroller = shortReading ? readingPaneRef.current : detailScrollRef.current
          if (scroller !== null && scroller !== undefined) scroller.scrollTop = point.scroll
        })
      }

      /** The prototype's transient message: shown, then gone after 2.6s. */
      function showToast(message) {
        setToast(message)
        if (toastTimer.current !== null) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(''), 2600)
      }

      /**
       * `clampNavCamera(next)`: the world may slide until its far edge reaches the
       * stage's margin, and it may never start past the top-left margin. Without the
       * clamp a centre-anchored zoom can push the card column off the stage entirely,
       * which reads as "zoom broke the layout" rather than as a moved camera.
       */
      function clampNavCamera(next) {
        const stage = navStage.current
        const world = navWorldSize.current
        if (stage === null || stage === undefined || world === null || world === undefined) return next
        const box = stage.getBoundingClientRect()
        if (box.width < 1 || box.height < 1) return next
        const width = world.width * next.scale
        const height = world.height * next.scale
        const minX = Math.min(18, box.width - width - 18)
        const minY = Math.min(20, box.height - height - 20)
        return {
          scale: next.scale,
          x: Math.max(minX, Math.min(18, next.x)),
          y: Math.max(minY, Math.min(20, next.y)),
        }
      }

      /**
       * `zoomNavigation(factor, cx, cy)`: the prototype zooms **about a point**, so the
       * place under the cursor (or the stage centre) stays put, and clamps the scale to
       * its own 0.2–2.4 range.
       */
      function zoomNavigation(factor, cx, cy) {
        setNav((current) => {
          const previous = current.scale
          const next = Math.max(0.2, Math.min(2.4, previous * factor))
          if (next === previous) return current
          return clampNavCamera({
            scale: next,
            x: cx - (cx - current.x) * next / previous,
            y: cy - (cy - current.y) * next / previous,
          })
        })
      }

      /**
       * `zoomNavBy(factor)`: the buttons zoom the **reading column**, not the stage
       * centre — the card column's left edge (world x = 30) keeps its screen position,
       * so zooming in never pushes the text under the stage's left edge. Vertically the
       * world point near the top of the stage stays, so the line being read stays too.
       * If the reader panned away from the column, the anchor is clamped back onto the
       * stage instead of zooming about an off-screen point.
       */
      function zoomNavBy(factor) {
        const stage = navStage.current
        if (stage === null || stage === undefined) { zoomNavigation(factor, 0, 0); return }
        const box = stage.getBoundingClientRect()
        const cx = Math.max(36, Math.min(box.width - 36, nav.x + NAV_CARD_LEFT * nav.scale))
        zoomNavigation(factor, cx, 64)
      }

      /** `全览`: scale the world so it fits the stage, with the prototype's margins. */
      function fitNavigation() {
        const stage = navStage.current
        const world = stage?.querySelector('.navWorld')
        if (stage === null || world === null || world === undefined) return
        const bounds = world.getBoundingClientRect()
        const stageBox = stage.getBoundingClientRect()
        if (bounds.width < 1 || bounds.height < 1) return
        const scale = Math.max(0.2, Math.min(1,
          (stageBox.width - 36) / (bounds.width / nav.scale),
          (stageBox.height - 40) / (bounds.height / nav.scale)))
        setNav({ x: 18, y: 20, scale })
      }

      function onNavWheel(event) {
        // A gesture synthesises wheel events right after it ends; the prototype ignores
        // them for 100ms so a pinch is not applied twice.
        if (Date.now() < ignoreWheelUntil.current) { event.preventDefault(); return }
        // Trackpad pinch arrives as a wheel with ctrlKey; a plain two-finger swipe pans.
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault()
          const box = event.currentTarget.getBoundingClientRect()
          zoomNavigation(event.deltaY < 0 ? 1.08 : 0.93, event.clientX - box.left, event.clientY - box.top)
          return
        }
        event.preventDefault()
        setNav((current) => clampNavCamera({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }))
      }

      /**
       * Safari's gesture events (the only ones a trackpad pinch produces there):
       * `gesturechange` carries a cumulative `scale`, so each step is relative to the
       * previous one, anchored where the fingers are, and the two-finger movement pans.
       */
      function onGestureStart(event) {
        event.preventDefault()
        const box = event.currentTarget.getBoundingClientRect()
        gesture.current = {
          scale: event.scale || 1,
          x: event.clientX - box.left,
          y: event.clientY - box.top,
        }
        ignoreWheelUntil.current = 0
      }

      function onGestureChange(event) {
        event.preventDefault()
        const previous = gesture.current
        if (previous === null) return
        const current = event.scale || 1
        const box = event.currentTarget.getBoundingClientRect()
        const x = event.clientX - box.left
        const y = event.clientY - box.top
        zoomNavigation(current / previous.scale, previous.x, previous.y)
        setNav((navState) => clampNavCamera({ ...navState, x: navState.x + (x - previous.x), y: navState.y + (y - previous.y) }))
        gesture.current = { scale: current, x, y }
      }

      function onGestureEnd(event) {
        event.preventDefault()
        gesture.current = null
        ignoreWheelUntil.current = Date.now() + 100
      }

      /**
       * `syncStageSize()`: when the stage changes size, the world moves by **half** the
       * difference so whatever the reader was looking at stays in the middle.
       */
      function syncStageSize() {
        const stage = navStage.current
        if (!navOpen || stage === null || stage === undefined) return
        const box = stage.getBoundingClientRect()
        if (box.width < 1 || box.height < 1) return
        const previous = stageSize.current
        if (previous !== null) {
          const halfWidth = (box.width - previous.width) / 2
          const halfHeight = (box.height - previous.height) / 2
          if (halfWidth !== 0 || halfHeight !== 0) {
            setNav((current) => clampNavCamera({ ...current, x: current.x + halfWidth, y: current.y + halfHeight }))
          }
        }
        stageSize.current = { width: box.width, height: box.height }
      }

      function onNavPointerDown(event) {
        if (event.button !== 0) return
        // Record the press only. The stage must NOT take pointer capture here:
        // capturing on pointerdown retargets the derived `click` to the stage, so
        // a plain tap on a child button (sentence / paragraph / audio) never
        // reaches it — the reader's click silently does nothing while keyboard
        // activation works. Capture is taken later, only once a real drag starts.
        navDrag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, captured: false }
      }

      function onNavPointerMove(event) {
        const drag = navDrag.current
        if (drag === null || drag.id !== event.pointerId) return
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 3) {
          drag.moved = true
          if (!drag.captured) {
            // Dragging has started: now capture, so the pan keeps receiving
            // moves even after the pointer leaves the stage.
            drag.captured = true
            event.currentTarget.setPointerCapture?.(event.pointerId)
          }
        }
        drag.x = event.clientX
        drag.y = event.clientY
        setNav((current) => clampNavCamera({ ...current, x: current.x + dx, y: current.y + dy }))
      }

      function onNavPointerUp(event) {
        const drag = navDrag.current
        if (drag === null || drag.id !== event.pointerId) return
        // Keep the "moved" flag until after the click handler has seen it.
        setTimeout(() => { navDrag.current = null }, 0)
      }

      /** True while a pan is in progress, so a drag never selects a sentence. */
      function navPanned() { return navDrag.current?.moved === true }

      const reloadAnalysis = useCallback(async (passageId) => {
        const request = passageRequest.current
        const value = unwrap(await listAnalysis({ passageId }), t)
        if (currentRead(passageId, request)) setAnalysis(value.analysis ?? null)
      }, [listAnalysis, t])

      const loadReading = useCallback(async (passage) => {
        const request = passageRequest.current
        setReadingStatus('')
        setError('')
        try {
          const [segments, stored] = await Promise.all([
            getSegmentation({ passageId: passage.id }).then((result) => unwrap(result, t)),
            listAnalysis({ passageId: passage.id }).then((result) => unwrap(result, t)),
          ])
          if (!currentRead(passage.id, request)) return
          setSegmentation(segments.segmentation ?? null)
          setAnalysis(stored.analysis ?? null)
          setAnchorId(segments.segmentation?.paragraphs?.[0]?.sentences?.[0]?.id ?? 'passage')
          setDrafts({})
        } catch (cause) {
          if (!currentRead(passage.id, request)) return
          setSegmentation(null)
          setAnalysis(null)
          setError(String(cause?.message ?? cause))
        }
      }, [getSegmentation, listAnalysis, t])

      useEffect(() => {
        setSelectedNode(null)
        setBranchDialog(null)
        setAnchorId('passage')
        setDrafts({})
        setSentenceAnalysis(null)
        setCoverage(null)
        setSegmentation(null)
        setAnalysis(null)
        setDiscussion(null)
        setNav({ x: 20, y: 20, scale: 0.65 })
        navDrag.current = null
        navWorldSize.current = null
        returnPoint.current = null
        setNavRowHeights(null)
        if (activePassage === null) return
        loadReading(activePassage)
        loadDiscussion(activePassage.id)
        setAskDraft('')
        setContextPreview(null)
        setAskStatus('')
      }, [activePassage, loadReading])

      // The backend list is a property of the Host, not of one passage, so it is
      // read once when the panel opens.
      useEffect(() => { loadBackends() }, [])

      // The analysis of whatever sentence is currently in focus. It is a read:
      // nothing here generates anything.
      useEffect(() => {
        if (activePassage === null || !/^p[0-9]+\.s[0-9]+$/u.test(anchorId)) { setSentenceAnalysis(null); return }
        let cancelled = false
        const request = passageRequest.current
        setSentenceAnalysis(null)
        readSentenceAnalysis({ passageId: activePassage.id, anchorId })
          .then((result) => { if (!cancelled && currentRead(activePassage.id, request)) setSentenceAnalysis(unwrap(result, t)) })
          .catch(() => { if (!cancelled && currentRead(activePassage.id, request)) setSentenceAnalysis(null) })
        return () => { cancelled = true }
      }, [activePassage, anchorId, readSentenceAnalysis, t])

      const loadCoverage = useCallback(async (passageId) => {
        const request = passageRequest.current
        try {
          const value = unwrap(await readAnalysisCoverage({ passageId }), t)
          if (currentRead(passageId, request)) setCoverage(value)
        } catch {
          if (currentRead(passageId, request)) setCoverage(null)
        }
      }, [readAnalysisCoverage, t])

      useEffect(() => {
        if (activePassage === null) { setCoverage(null); return }
        loadCoverage(activePassage.id)
      }, [activePassage, loadCoverage])

      /**
       * Measure the canvas rows so the geometry can follow the text.
       *
       * Runs after every commit while the navigation is open, and converges in one
       * pass: a row's natural height does not depend on the pitch it was rendered
       * with (the pitch is a `min-height`), so the second measurement equals the
       * first and the state stops changing. A closed navigation is `display:none`
       * and reports zeros, which is why it is skipped rather than stored.
       */
      useMeasuredEffect(() => {
        if (!navOpen || segmentation === null) return
        const stage = navStage.current
        if (stage === null || stage === undefined) return
        const rows = stage.querySelectorAll('.paragraphSentenceRow[data-sentence-id]')
        if (rows.length === 0) return
        const next = new Map()
        rows.forEach((row) => {
          next.set(row.getAttribute('data-sentence-id'), row.offsetHeight)
        })
        setNavRowHeights((current) => {
          const same = current !== null && current.size === next.size
            && [...next.entries()].every(([id, height]) => current.get(id) === height)
          return same ? current : next
        })
      })

      // ---- one bounded, cancellable generation run --------------------------
      // A run is bound to the passage and the sentence it started on: the reader
      // sees its stage and elapsed time, can cancel it, and it can never outlive
      // its timeout or race a second one. The typert call stub takes the
      // AbortSignal as one extra trailing argument; aborting it cancels the RPC
      // down to the Host's provider stream.

      /** Run feedback, stamped with the passage/sentence it is about. */
      function reportAnalysis(kind, text, passageId, anchorId) {
        setAnalysisFeedbackFor(text === '' ? null : { passageId, anchorId })
        setAnalysisError(kind === 'error' ? text : '')
        setAnalysisStatus(kind === 'status' ? text : '')
      }

      function beginAnalysisRun(timeoutMs) {
        const runId = analysisRunSeq.current + 1
        analysisRunSeq.current = runId
        analysisCancelledRef.current = false
        analysisTimedOutRef.current = false
        const controller = new AbortController()
        analysisAbortRef.current = controller
        analysisBusyRef.current = true
        const timer = setTimeout(() => {
          analysisTimedOutRef.current = true
          controller.abort()
        }, timeoutMs)
        setAnalysisRun({ runId, startedAt: Date.now(), timeoutSeconds: Math.round(timeoutMs / 1000) })
        return {
          runId,
          controller,
          timeoutSeconds: Math.round(timeoutMs / 1000),
          isCurrent: () => analysisRunSeq.current === runId,
          finish: () => {
            clearTimeout(timer)
            if (analysisAbortRef.current === controller) analysisAbortRef.current = null
            if (analysisRunSeq.current === runId) {
              analysisBusyRef.current = false
              setAnalysisBusy(false)
              setAnalysisRun(null)
            }
          },
        }
      }

      /** `取消`: abort the run. A cancelled reply is refused downstream, so
       *  nothing partial is ever stored. */
      function cancelAnalysisRun() {
        analysisCancelledRef.current = true
        analysisAbortRef.current?.abort()
      }

      // Navigating away cancels the run the panel is showing: 解析中 must never
      // describe work on a passage or a sentence the reader has left.
      useEffect(() => {
        if (!analysisBusyRef.current) return
        cancelAnalysisRun()
      }, [activePassage, anchorId])

      // Closing the panel ends the run too; the Host stops at the abort.
      useEffect(() => () => { analysisAbortRef.current?.abort() }, [])

      // One tick per second while a run is on, so elapsed time stays visible.
      useEffect(() => {
        if (!analysisBusy) return undefined
        const timer = setInterval(() => setAnalysisTick((tick) => tick + 1), 1000)
        return () => clearInterval(timer)
      }, [analysisBusy])

      /**
       * Generate what one paragraph is missing.
       *
       * The label carries the count, because this spends one model call per
       * sentence: nothing here starts a paid run without the reader reading how
       * much of one it is. (No button renders this entry point yet; the run
       * itself is bounded like every other one.)
       */
      async function analyseParagraphRun(paragraphId) {
        if (activePassage === null || backend === '' || model === '') return
        if (analysisBusyRef.current) return
        const passageId = activePassage.id
        // Feedback from this run is stamped to its passage and sentence, so it
        // can never be misread on another anchor. Declared before first use — a
        // temporal-dead-zone crash here would kill the click with no feedback at
        // all, which is exactly the regression this ordering guards against.
        const reportError = (text) => reportAnalysis('error', text, passageId, anchorId)
        const reportStatus = (text) => reportAnalysis('status', text, passageId, anchorId)
        let run = null
        try {
          reportError('')
          reportStatus('')
          // One bounded call per missing sentence: the Host asks them one by one.
          const missing = (coverage?.missing ?? []).filter((id) => id.startsWith(`${paragraphId}.`)).length
          run = beginAnalysisRun(ANALYSIS_TIMEOUT_MS * Math.max(1, missing))
          setAnalysisBusy(true)
          const value = unwrap(await analyseParagraph({
            passageId, paragraphId, backend, model,
            reasoningEffort: null, operationId: createUuid(),
          }, run.controller.signal), t)
          if (!run.isCurrent()) return
          if (value.ok !== true) {
            reportError(format(t, 'analysisRefused', { reason: value.reason, detail: '' }))
          } else if ((value.asked ?? 0) === 0) {
            reportStatus(value.note ?? t('paragraphNothingMissing'))
          } else {
            reportStatus(format(t, 'paragraphDone', {
              stored: value.stored ?? 0, asked: value.asked ?? 0,
              failed: (value.failed ?? []).length,
            }))
            // The first failure is worth naming: it says which sentence and why.
            const first = (value.failed ?? [])[0]
            if (first !== undefined) {
              reportError(format(t, 'paragraphFailed', { anchorId: first.anchorId, reason: first.reason }))
            }
          }
          if (isSentenceAnchorId(anchorId)) {
            const stored = unwrap(await readSentenceAnalysis({ passageId: activePassage.id, anchorId }), t)
            if (!run.isCurrent()) return
            setSentenceAnalysis(stored)
          }
          await loadCoverage(passageId)
        } catch (cause) {
          if (run !== null && !run.isCurrent()) return
          if (analysisCancelledRef.current) reportStatus(t('analysisCancelled'))
          else if (analysisTimedOutRef.current) {
            reportError(format(t, 'analysisTimedOut', {
              seconds: run === null ? Math.round(ANALYSIS_TIMEOUT_MS / 1000) : run.timeoutSeconds,
            }))
          } else reportError(format(t, 'generationUnavailable', { reason: String(cause?.message ?? cause) }))
        } finally {
          run?.finish()
        }
      }

      /** Whether an anchor names one sentence, which is what per-sentence work needs. */
      function isSentenceAnchorId(id) {
        return /^p[0-9]+\.s[0-9]+$/u.test(id)
      }

      /** Which paragraph, if any, the current anchor belongs to. */


      /** Generate the analysis of the sentence in focus, through the chosen backend. */
      async function analyseCurrent() {
        if (activePassage === null || backend === '' || model === '') return
        if (analysisBusyRef.current) return
        const passageId = activePassage.id
        // Feedback from this run is stamped to its passage and sentence, so it
        // can never be misread on another anchor. Declared before first use — a
        // temporal-dead-zone crash here would kill the click with no feedback at
        // all, which is exactly the regression this ordering guards against.
        const reportError = (text) => reportAnalysis('error', text, passageId, anchorId)
        const reportStatus = (text) => reportAnalysis('status', text, passageId, anchorId)
        let run = null
        try {
          reportError('')
          reportStatus('')
          run = beginAnalysisRun(ANALYSIS_TIMEOUT_MS)
          setAnalysisBusy(true)
          const value = unwrap(await analyseSentence({
            passageId, anchorId, backend, model,
            reasoningEffort: null, operationId: createUuid(),
          }, run.controller.signal), t)
          if (!run.isCurrent()) return
          if (value.ok !== true) {
            // A refused analysis is refused with the gate's own reason: the panel
            // shows what was wrong instead of displaying an unusable parse.
            reportError(format(t, 'analysisRefused', { reason: value.reason, detail: value.failure ?? '' }))
          } else {
            reportStatus(format(t, 'analysisDone', {
              covered: value.covered, missing: value.missing, failed: value.failed, stale: value.stale,
            }))
          }
          const stored = unwrap(await readSentenceAnalysis({ passageId: activePassage.id, anchorId }), t)
          if (!run.isCurrent()) return
          setSentenceAnalysis(stored)
          await loadCoverage(passageId)
        } catch (cause) {
          if (run !== null && !run.isCurrent()) return
          if (analysisCancelledRef.current) reportStatus(t('analysisCancelled'))
          else if (analysisTimedOutRef.current) {
            reportError(format(t, 'analysisTimedOut', {
              seconds: run === null ? Math.round(ANALYSIS_TIMEOUT_MS / 1000) : run.timeoutSeconds,
            }))
          } else reportError(format(t, 'generationUnavailable', { reason: String(cause?.message ?? cause) }))
        } finally {
          run?.finish()
        }
      }

      async function publishAnalysis() {
        if (activePassage === null) return
        setAnalysisBusy(true)
        reportAnalysis('error', '', activePassage.id, 'passage')
        try {
          const value = unwrap(await publishAnalysis({
            passageId: activePassage.id,
            overallTranslation: latestTranslation('passage')?.text ?? null,
            cohesion: '',
          }), t)
          if (value.kind === 'conflict') reportAnalysis('error', format(t, 'saveConflict', { reason: value.reason }), activePassage.id, 'passage')
          else reportAnalysis('status', format(t, 'publishedDone', { revision: value.revision, covered: value.coveredCount }), activePassage.id, 'passage')
          await loadCoverage(activePassage.id)
        } catch (cause) {
          reportAnalysis('error', format(t, 'generationUnavailable', { reason: String(cause?.message ?? cause) }), activePassage.id, 'passage')
        } finally {
          setAnalysisBusy(false)
        }
      }

      

      

      function branchCount(target) {
        return (analysis?.branches ?? []).filter((branch) => branch.anchorId === target).length
      }

      /** Nested rendering: a refinement hangs under the branch it refines. */
      

      async function saveTranslationFor(target) {
        if (activePassage === null) return
        const text = (drafts[target] ?? latestTranslation(target)?.text ?? '').trim()
        if (text === '') { setError(t('sourceRequired')); return }
        setReadingBusy(true)
        setError('')
        setReadingStatus('')
        try {
          const value = unwrap(await saveTranslation({
            passageId: activePassage.id,
            operationId: createUuid(),
            anchorId: target,
            language: 'zh-Hans',
            text,
          }), t)
          if (value.kind === 'conflict') {
            setError(format(t, 'saveConflict', { reason: value.reason }))
            return
          }
          await reloadAnalysis(activePassage.id)
          setDrafts((current) => {
            const next = { ...current }
            delete next[target]
            return next
          })
          setReadingStatus(t('translationSaved'))
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setReadingBusy(false)
        }
      }

      async function submitBranch(event) {
        event.preventDefault()
        if (activePassage === null) return
        if (!branchTitle.trim()) { setError(t('titleRequired')); return }
        setReadingBusy(true)
        setError('')
        setReadingStatus('')
        try {
          const value = unwrap(await addBranch({
            passageId: activePassage.id,
            operationId: createUuid(),
            parentId: null,
            anchorId,
            kind: branchKind,
            title: branchTitle.trim(),
            body: branchBody,
          }), t)
          if (value.kind === 'conflict') {
            setError(format(t, 'saveConflict', { reason: value.reason }))
            return
          }
          setBranchTitle('')
          setBranchBody('')
          await reloadAnalysis(activePassage.id)
          setReadingStatus(t('branchAdded'))
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setReadingBusy(false)
        }
      }

      const anchorLabel = (target) => (target === 'passage' ? t('wholePassage') : target)

      /**
       * The paragraph text node whose content a DOM position points into, or null
       * when the position is not part of the French original at all.
       */




      // --- renderers ------------------------------------------------------

      /**
       * The passage switcher, opened from the brand title (the reader's decision).
       *
       * The prototype has no passage list — it reads one demo text — so this is an extra
       * capability, and the rule for those is that it must not invent a look: it is built from
       * the prototype's own dialog vocabulary (`modalBackdrop`, `modal`, `modalFoot`, plus the
       * knowledge list's `kbRows` / `kbRow`), so it reads as part of the same panel.
       */
      function passageSwitcher() {
        return h('div', { className: 'modalBackdrop' },
          h('div', {
            className: 'modal switcher', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'switchTitle',
            onKeyDown: (event) => {
              if (event.key === 'Escape' && !busy && !event.isComposing) { event.stopPropagation(); setSwitcherOpen(false) }
              if (event.key !== 'Tab') return
              const fields = Array.from(event.currentTarget.querySelectorAll('input:not(:disabled), textarea:not(:disabled), button:not(:disabled)'))
              const first = fields[0], last = fields[fields.length - 1]
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
              if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
            },
          },
            switcherMode === 'continue' ? null : h('div', { className: 'kbBar' },
              h('button', {
                className: 'kbReturn', type: 'button',
                onClick: () => setSwitcherMode(switcherMode === 'new' ? 'list' : 'new'),
              }, switcherMode === 'new' ? t('passageList') : t('newPassage')),
            ),
            h('h2', { id: 'switchTitle' }, switcherMode === 'continue' ? t('nextPassage') : switcherMode === 'new' ? t('newPassage') : t('switchPassage')),
            switcherMode === 'continue' ? h('p', { className: 'hint' }, t('nextPassageHint')) : null,
            switcherMode !== 'list' ? passageComposer([
              h('button', {
                key: 'cancel', type: 'button', disabled: busy,
                onClick: () => switcherMode === 'continue' ? setSwitcherOpen(false) : setSwitcherMode('list'),
              }, switcherMode === 'continue' ? t('resumeReading') : t('cancel')),
            ]) : passageRows(),
            switcherMode !== 'list'
              ? null
              : h('div', { className: 'modalFoot' },
                h('button', {
                  type: 'button', disabled: exporting, onClick: exportBackup,
                }, exporting ? t('exporting') : t('exportAll')),
                h('button', { type: 'button', disabled: exporting, onClick: exportSources }, t('exportSources')),
                h('button', { type: 'button', onClick: () => setSwitcherOpen(false) }, t('cancel'))),
          ),
        )
      }

      /**
       * The new-passage form, shared by the switcher dialog and the front door.
       *
       * The two-step submit is deliberate: the first press previews the segmentation,
       * the confirming press stores exactly what the preview showed. `extraButtons`
       * is the dialog's cancel, when there is a dialog to cancel out of.
       */
      function passageComposer(extraButtons = []) {
        return h('form', { onSubmit: submit },
          locationFields(draftLocation, setDraftLocation),
          h('label', { className: 'kbField' },
            h('span', null, t('titleField')),
            h('input', {
              value: title, maxLength: 120, disabled: busy, 'aria-label': t('titleField'),
              placeholder: t('titlePlaceholder'),
              onChange: (event) => setTitle(event.target.value),
            })),
          h('label', { className: 'kbField' },
            h('span', null, t('source')),
            h('textarea', {
              rows: 8, value: sourceText, disabled: busy, autoFocus: switcherOpen, 'aria-label': t('source'),
              placeholder: t('sourcePlaceholder'),
              onChange: (event) => setSourceText(event.target.value),
            })),
          preview === null ? null : h('p', { className: 'policyNote' }, format(t, 'previewSummary', {
            paragraphs: Array.isArray(preview.paragraphs) ? preview.paragraphs.length : (preview.paragraphs ?? 0),
            sentences: Array.isArray(preview.sentences) ? preview.sentences.length : (preview.sentences ?? 0),
          })),
          error === '' ? null : h('p', { className: 'error', role: 'alert' }, error),
          status === '' ? null : h('p', { className: 'status', role: 'status' }, status),
          h('div', { className: 'modalFoot' },
            h('button', {
              className: 'primary', type: 'submit', disabled: busy,
            }, busy ? t('saving') : preview?.unavailable ? t('preview') : preview === null ? t('preview') : switcherMode === 'continue' ? t('saveNextPassage') : t('confirmSave')),
            ...extraButtons))
      }

      /**
       * The saved-passage list, shared by the switcher and the front door. Each row
       * shows the excerpt, not just the title: a list of titles is not recognisable.
       *
       * A row is a `kbRow` button plus its own archive control. `kbRow` is a `<button>` in
       * the prototype, and a button inside a button is invalid HTML — the browser hoists
       * the inner one out, which is exactly what the first render showed. The wrapper
       * carries the layout as an inline style, so no new class is introduced.
       */
      function passageRows() {
        return h('div', { className: 'kbRows' }, items.length === 0
          ? h('div', { className: 'kbEmpty' }, t('noPassageYet'))
          : items.map((item) => h('div', {
            key: item.id,
            style: { display: 'flex', alignItems: 'center', gap: '8px' },
          },
            h('button', {
              className: 'kbRow', type: 'button', style: { flex: '1 1 auto' },
              onClick: () => { setSwitcherOpen(false); void openPassage(item.id) },
            },
              h('div', null,
                h('div', { className: 'name' }, item.title || t('untitled')),
                h('div', { className: 'subline' }, item.excerpt ?? '')),
              h('span', { className: 'kbStatus' }, item.updatedAt === undefined ? '' : String(item.updatedAt).slice(0, 10)),
              h('span', { className: 'kbStatus' }, format(t, 'chars', { count: item.characterCount ?? 0 }))),
            h('button', {
              className: 'small quiet', type: 'button', disabled: exporting,
              // The row is a flex line: without this the label wraps to two lines
              // (`归` / `档`) as soon as the title takes the space.
              style: { flex: '0 0 auto', whiteSpace: 'nowrap' },
              onClick: () => { void archiveOne(item) },
            }, t('archivePassage')))))
      }

      function closeButton() {
        return h('button', {
          className: 'fr-button fr-buttonQuiet', type: 'button', onClick: onClose,
          title: t('close'), 'aria-label': t('close'),
        }, '×')
      }

      async function loadBackends() {
        try {
          const value = unwrap(await listBackends({ scope: 'all' }), t)
          setBackends(value.backends ?? [])
          const first = (value.backends ?? []).find((entry) => entry.available)
          // Picking the backend must also load its models: without this call `model`
          // stayed '' forever and every generation button read as permanently dead —
          // the "backend not wired" defect. The compact bar carries no picker, so the
          // first available backend and its first model are the panel's defaults.
          if (first !== undefined && backend === '') {
            setBackend(first.backend)
            void loadModels(first.backend)
          }
        } catch (cause) {
          setError(format(t, 'generationUnavailable', { reason: String(cause?.message ?? cause) }))
        }
      }

      async function loadModels(name) {
        setModels([])
        setModel('')
        try {
          const value = unwrap(await listBackendModels({ backend: name }), t)
          setModels(value.models ?? [])
          if (value.reason !== null && value.reason !== undefined) {
            setError(format(t, 'generationUnavailable', { reason: value.reason }))
            return
          }
          const available = value.models ?? []
          if (available.length === 0) return
          // The reader's saved choice wins; a saved model that no longer exists
          // falls back visibly, never silently.
          const saved = readModelPreference()
          const chosen = available.find((entry) => entry.id === saved)?.id ?? available[0].id
          if (saved !== null && saved !== '' && chosen !== saved) {
            showToast(format(t, 'modelFallback', { model: saved }))
          }
          setModel(chosen)
        } catch (cause) {
          setError(format(t, 'generationUnavailable', { reason: String(cause?.message ?? cause) }))
        }
      }

      async function loadDiscussion(passageId) {
        const request = passageRequest.current
        try {
          const value = unwrap(await listDiscussion({ passageId }), t)
          if (currentRead(passageId, request)) setDiscussion(value)
        } catch {
          // A panel from an older Host has no discussion endpoint yet; the rest of
          // the workbench keeps working rather than the whole reading failing.
          if (currentRead(passageId, request)) setDiscussion({ branches: [], conclusions: [] })
        }
      }

      async function previewTurn(target) {
        if (activePassage === null || backend === '' || model === '') return
        const branchId = branchFor(target)
        if (branchId === null) { setError(t('branchFirst')); return }
        setAskBusy(true)
        setError('')
        try {
          const value = unwrap(await previewAsk({
            passageId: activePassage.id, branchId, question: askDraft,
            backend, model, extras: [],
          }), t)
          if (value.ok !== true) { setError(format(t, 'previewRefused', { reason: value.reason })); return }
          setContextPreview(value)
        } catch (cause) {
          setError(format(t, 'generationUnavailable', { reason: String(cause?.message ?? cause) }))
        } finally {
          setAskBusy(false)
        }
      }

      async function sendTurn(target) {
        if (activePassage === null || backend === '' || model === '' || askDraft.trim() === '') return
        const branchId = branchFor(target)
        if (branchId === null) { setError(t('branchFirst')); return }
        setAskBusy(true)
        setError('')
        setAskStatus('')
        setStreamText('')
        const request = {
          passageId: activePassage.id, branchId, question: askDraft.trim(),
          backend, model, reasoningEffort: null, extras: [],
          operationId: createUuid(),
          expectedFingerprint: contextPreview === null ? null : contextPreview.fingerprint,
        }
        try {
          // A streamed turn shows the answer while it is written and always ends with a
          // terminal frame; a Host that cannot stream still answers in one piece.
          const value = typeof streamAsk === 'function'
            ? await receiveStream(streamAsk(request), t, setStreamText)
            : unwrap(await ask(request), t)
          if (value.ok !== true) {
            setError(format(t, 'askFailed', { reason: value.reason, failure: value.failure ?? '' }))
          } else {
            setAskDraft('')
            setContextPreview(null)
            setAskStatus(value.finish === 'stop'
              ? format(t, 'answerDone', { model: value.resolvedModel ?? value.model })
              : format(t, 'answerPartial', { finish: value.finish }))
          }
          await loadDiscussion(activePassage.id)
        } catch (cause) {
          setError(format(t, 'generationUnavailable', { reason: String(cause?.message ?? cause) }))
        } finally {
          setAskBusy(false)
          // The stored message is authoritative from here on.
          setStreamText('')
        }
      }

      async function receiveStream(handle, translate, onDelta) {
        let result = null
        for await (const frame of handle) {
          if (frame.kind === 'delta') onDelta((current) => current + frame.text)
          else if (frame.kind === 'done') result = frame.result
        }
        if (result === null) throw new Error(translate('streamEndedEarly'))
        return result
      }

      async function startBranch(target) {
        if (activePassage === null) return
        setAskBusy(true)
        setError('')
        try {
          const value = unwrap(await createBranch({
            passageId: activePassage.id, anchorId: target, kind: 'discussion',
            title: `${t('discussionTitle')} ${target}`, parentId: null, forkedFrom: null,
            operationId: createUuid(),
          }), t)
          if (value.kind === 'conflict') { setError(format(t, 'saveConflict', { reason: value.reason })); return }
          await loadDiscussion(activePassage.id)
          setAskStatus(t('branchOpened'))
        } catch (cause) {
          setError(format(t, 'generationUnavailable', { reason: String(cause?.message ?? cause) }))
        } finally {
          setAskBusy(false)
        }
      }

      async function markBranch(branchId, status) {
        if (activePassage === null) return
        try {
          const value = unwrap(await setBranchState({
            passageId: activePassage.id, branchId, status, title: null,
          }), t)
          if (value.kind === 'conflict') setError(format(t, 'saveConflict', { reason: value.reason }))
          await loadDiscussion(activePassage.id)
        } catch (cause) {
          setError(format(t, 'generationUnavailable', { reason: String(cause?.message ?? cause) }))
        }
      }

      

      

      // --- discussion: pick a backend, see what will be sent, then ask ---------

      /**
       * The turn the reader is composing.
       *
       * The backend and model are chosen here rather than globally: the choice
       * belongs to this reading, and switching it must not change any other
       * session's model.
       */



      /** What this turn would send. The panel shows the list before sending. */

      /**
       * Send the turn. The fingerprint of the preview the reader looked at travels
       * with it, so content that changed after the preview is refused rather than
       * sent unseen.
       */

      /**
       * Iterate one streamed turn: report deltas as they arrive, return the terminal
       * result.
       *
       * A stream that ends without a terminal frame is an error rather than an empty
       * answer — "still arriving" and "failed" must not look the same to the reader.
       */

      /** The branch a turn on this anchor belongs to, if one is open. */
      

      /** Open a discussion branch on the current anchor. */


      /**
       * The six parts of one sentence, in the plan's order.
       *
       * Part of speech, syntactic function and the semantic reading are three
       * different things on screen too: the coloured original answers "what is the
       * structure", the morphology list answers "what is this form", and the
       * explanations are labelled with how certain they are.
       */
      

      /** Clause rows with their nesting depth, and any orphan shown at the top. */
      function clauseRows(clauses) {
        const byParent = new Map()
        for (const clause of clauses) {
          const key = clause.parentId ?? ''
          byParent.set(key, [...(byParent.get(key) ?? []), clause])
        }
        const rows = []
        const seen = new Set()
        const walk = (parentId, depth) => {
          for (const clause of byParent.get(parentId) ?? []) {
            if (seen.has(clause.id)) continue
            seen.add(clause.id)
            rows.push({ clause, depth })
            walk(clause.id, depth + 1)
          }
        }
        walk('', 0)
        // A clause whose parent is not in the list still renders rather than vanishing.
        for (const clause of clauses) if (!seen.has(clause.id)) rows.push({ clause, depth: 0 })
        return rows
      }

      

      /**
       * One paragraph of the source, in the prototype's shape: a label line
       * (`段落 NN`, plus `当前 · 第 N 句` while this paragraph holds the focus) above the
       * text, and a click-to-focus span per sentence.
       *
       * The label stays the paragraph anchor's handle, so the plugin's paragraph anchor
       * is still reachable — the prototype's label is not a control, and this one looks
       * the same, which is the only reason it may differ at all (spec §0 rule 3).
       */
      /**
       * One paragraph as the prototype's navigation card.
       *
       * This is where the reader actually meets the text: the prototype never leaves
       * `data-view="focus"`, and that view hides `readerPane`, so the sentences on screen
       * are these rows. Every interaction the reading pane would have carried lives here —
       * click to focus, the selection guard, keyboard reach, and the honest "not wired"
       * audio controls.
       */
      /**
       * The navigation world, laid out the way the prototype lays it out.
       *
       * `renderGraph()` places everything at computed coordinates inside `.navWorld`:
       * a row per sentence, chapter headings above their paragraphs, connector
       * paths between cards, and the `PARCOURS` caption at `570/55`. The numbers below are
       * the prototype's own constants, not estimates — with one correction: its fixed
       * `rowHeight 215` only fits its demo sentences, so it is the *minimum* pitch here,
       * and each row lays out at its measured height instead.
       */
      const NAV_ROW_HEIGHT = 215
      const NAV_CARD_TOP = 56
      // The card column's left edge in world coordinates (the prototype's `left:30px`).
      const NAV_CARD_LEFT = 30

      /** A row's pitch: the prototype's 215px, or more when the measured row is taller. */
      function navRowHeight(sentenceId) {
        const measured = navRowHeights?.get(sentenceId)
        return Math.max(NAV_ROW_HEIGHT, measured ?? 0)
      }

      function navGeometry(paragraphs, routeNodes) {
        const chapters = []
        const cards = []
        const connectors = []
        let y = 30
        let lastBottom = null
        chapters.push({ index: 1, title: format(t, 'chapterLabel', { index: 1 }), y })
        y += 85
        for (const [index, paragraph] of paragraphs.entries()) {
          const rows = paragraph.sentences.map((sentence) => navRowHeight(sentence.id))
          const height = NAV_CARD_TOP + rows.reduce((sum, row) => sum + row, 0)
          if (lastBottom !== null) connectors.push({ from: lastBottom, to: y })
          cards.push({ paragraph, index, top: y, height })
          lastBottom = y + height
          y = lastBottom + 65
        }
        // `sentencePositions`: where each sentence sits, so the route can start from it.
        const origins = new Map()
        for (const card of cards) {
          let rowY = card.top + NAV_CARD_TOP
          card.paragraph.sentences.forEach((sentence) => {
            const row = navRowHeight(sentence.id)
            origins.set(sentence.id, { x: 450, y: rowY + row / 2 })
            rowY += row
          })
        }
        const route = walkRoute(routeNodes, origins)
        return {
          chapters,
          cards,
          connectors,
          origins,
          routePaths: route.paths,
          routeNodes: route.nodes,
          width: Math.max(930, route.maxX),
          height: Math.max(y, route.maxY),
        }
      }

      /**
       * The prototype's `walk()`: route nodes are laid out in columns of 95px per depth
       * step, each hanging off its parent with a bezier, and knowledge nodes drawn dashed.
       * Constants (`570 + depth*95`, `routeY += 95`, the curve, the 2.5px dot) are its own.
       */
      function walkRoute(routeNodes, origins) {
        const paths = []
        const nodes = []
        let routeY = 135
        let maxX = 930
        let maxY = 0
        for (const [anchorIdOfSentence, origin] of origins) {
          const here = routeNodes.filter((node) => node.anchorId === anchorIdOfSentence)
          if (here.length === 0) continue
          const seen = new Set()
          routeY = Math.max(routeY, origin.y - 18)
          const walk = (parentId, depth, from) => {
            for (const node of here.filter((entry) => entry.parentId === parentId)) {
              if (seen.has(node.id)) continue
              seen.add(node.id)
              const x = 570 + depth * 95
              const y = routeY
              routeY += 95
              paths.push({
                key: `${node.id}-path`,
                d: `M ${from.x} ${from.y} C ${from.x + 65} ${from.y}, ${x - 60} ${y + 15}, ${x - 15} ${y + 15}`,
                stroke: node.kind === 'knowledge' ? '#b69b72' : '#b8c6aa',
                dashed: node.kind === 'knowledge',
                dot: { x: x - 15, y: y + 15 },
              })
              nodes.push({ ...node, x, y, width: 270 })
              maxX = Math.max(maxX, x + 295)
              maxY = Math.max(maxY, y + 95)
              walk(node.id, depth + 1, { x: x + 25, y: y + 48 })
            }
          }
          walk(null, 0, origin)
        }
        return { paths, nodes, maxX, maxY }
      }

      /**
       * The plugin's route nodes, in the prototype's shape.
       *
       * An analysed sentence becomes an analysis node; every discussion branch hangs under
       * its parent branch, or under the analysis node when it starts from the sentence.
       */
      function routeNodes() {
        const all = sentenceList()
        const nodes = []
        for (const [index, sentence] of all.entries()) {
          if ((coverage?.covered ?? []).includes(sentence.id)) {
            nodes.push({
              id: `a-${sentence.id}`, anchorId: sentence.id, parentId: null,
              kind: 'analysis', title: t('analysisTitle'),
              status: sentenceAnalysis?.kind === 'found' && anchorId === sentence.id
                ? t('statusDraft')
                : t('statusGenerated'),
            })
          }
          void index
        }
        for (const branch of discussion?.branches ?? []) {
          nodes.push({
            id: branch.branchId,
            anchorId: branch.anchorId,
            // A branch whose parent is unknown to the panel hangs off the sentence.
            parentId: branch.parentId ?? `a-${branch.anchorId}`,
            kind: branch.kind === 'vocabulary' || branch.kind === 'grammar' ? 'knowledge' : 'discussion',
            title: branch.title,
            status: branch.status === 'open' ? t('branchOpen') : t('branchSettled'),
          })
        }
        return nodes
      }

      /** `pick(id)`: select the node, which means focusing its sentence. */
      /**
       * `captureReadingSelection()`: the word the reader selected **inside the detail
       * pane's quote**, which is what the prototype's 查词 acts on.
       *
       * The prototype is strict on purpose: the selection must sit inside a `.quote`, it
       * must be non-empty, and it must be at most 100 characters — a stray drag across the
       * panel must not become a lookup.
       */
      function captureReadingSelection() {
        if (typeof window === 'undefined') return
        const selection = window.getSelection?.()
        if (selection === null || selection === undefined || selection.rangeCount === 0) return
        const range = selection.getRangeAt(0)
        const start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement
        const quote = start?.closest?.('.quote')
        const pane = readingPaneRef.current
        if (quote === null || quote === undefined || pane === null || !pane.contains(quote)) return
        if (!quote.contains(range.endContainer)) return
        const value = selection.toString().trim()
        if (value === '' || value.length > 100) return
        setSelectedWord(value)
      }

      function pickNode(node) {
        setAnchorId(node.anchorId)
        setSelectedNode(node)
      }

      /**
       * `selectSentence(i)`: focus the sentence, and select its analysis node exactly when
       * that sentence has been analysed — nothing otherwise.
       */
      function selectSentence(sentenceId) {
        setAnchorId(sentenceId)
        setSelectedNode((coverage?.covered ?? []).includes(sentenceId)
          ? { id: `a-${sentenceId}`, anchorId: sentenceId, parentId: null, kind: 'analysis', title: t('analysisTitle'), status: '' }
          : null)
      }

      /** One sentence row: ordinal, text (constituent-coloured when it is the anchor), audio row. */
      function navSentenceRow(paragraph, sentence, rowIndex) {
        const text = paragraph.text.slice(sentence.start - paragraph.start, sentence.end - paragraph.start)
        // Only the focused sentence has a loaded analysis, so only it can carry the
        // constituent colours; the rest stay plain rather than inventing a structure.
        const coloured = anchorId === sentence.id && sentenceAnalysis?.kind === 'found'
        const pieces = coloured
          ? renderConstituents(text, sentenceAnalysis.analysis.constituents)
          : [{ role: null, text, partOfSpeech: null }]
        return h('div', {
          key: sentence.id,
          className: 'paragraphSentenceRow',
          // `minHeight`, not `height`: the prototype's pitch is the floor, and a long
          // sentence grows the row rather than overflowing into the next one.
          style: { minHeight: `${NAV_ROW_HEIGHT}px` },
          'data-sentence-id': sentence.id,
        },
          h('button', {
            className: `paragraphSentence${anchorId === sentence.id ? ' active' : ''}`,
            type: 'button',
            style: { minHeight: `${NAV_ROW_HEIGHT - 32}px` },
            onClick: () => {
              // A pan or an existing text selection must not move the focus.
              if (navPanned()) return
              if (window.getSelection()?.toString().trim()) return
              selectSentence(sentence.id)
            },
          },
            h('span', { className: 'lineNumber' }, String(rowIndex + 1).padStart(2, '0')),
            h('span', { className: 'sourceText' }, pieces.map((piece, pieceIndex) => piece.role === null
              ? piece.text
              : h('span', {
                key: `${piece.role}-${String(pieceIndex)}`,
                className: 'constituent',
                style: { color: tokenForRole(piece.role) },
              }, piece.text))),
          ),
          h('div', { className: 'sentenceAudioMini' },
            h('button', {
              type: 'button', disabled: true, 'aria-label': format(t, 'audioSentence', { index: rowIndex + 1 }),
              onClick: () => requestSentenceAudio(sentence.id, 'generate'),
            }, t('audioGenerate')),
            h('button', {
              type: 'button', disabled: true, 'aria-label': format(t, 'audioRegenerateSentence', { index: rowIndex + 1 }),
              onClick: () => requestSentenceAudio(sentence.id, 'regenerate'),
            }, t('audioRegenerateShort')),
            h('span', null, t('audioReserved')),
          ),
        )
      }

      /** One paragraph card, positioned exactly where the prototype puts it. */
      function navCard(card) {
        const { paragraph, index, top, height } = card
        return h('section', {
          key: paragraph.id,
          className: `paragraphCard${anchorId === paragraph.id ? ' active' : ''}`,
          style: { left: '30px', top: `${top}px`, height: `${height}px` },
          'data-paragraph-id': paragraph.id,
        },
          h('div', { className: 'paragraphHeading' },
            h('button', {
              type: 'button', title: paragraph.id,
              onClick: () => setAnchorId(paragraph.id),
            }, format(t, 'paragraphLabel', { index: index + 1 })),
          ),
          paragraph.sentences.map((sentence, rowIndex) => navSentenceRow(paragraph, sentence, rowIndex)),
        )
      }

      function navWorld(paragraphs) {
        const geometry = navGeometry(paragraphs, routeNodes())
        navWorldSize.current = { width: geometry.width, height: geometry.height }
        return h('div', {
          className: 'navWorld',
          style: {
            transform: `translate(${nav.x}px,${nav.y}px) scale(${nav.scale})`,
            width: `${geometry.width}px`,
            height: `${geometry.height}px`,
          },
        },
          geometry.chapters.map((chapter) => h('div', {
            key: `chapter-${String(chapter.index)}`,
            className: 'chapterHeading',
            style: { left: '30px', top: `${chapter.y}px` },
          },
            h('span', { className: 'chapterNumber' }, String(chapter.index).padStart(2, '0')),
            h('span', null, chapter.title),
          )),
          h('div', { className: 'navCaption', style: { left: '570px', top: '55px' } }, t('routeCaption')),
          h('svg', {
            className: 'navPaths',
            width: `${geometry.width}px`,
            height: `${geometry.height}px`,
            'aria-hidden': 'true',
          },
            geometry.connectors.map((connector, connectorIndex) => h('path', {
              key: `connector-${String(connectorIndex)}`,
              d: `M 240 ${connector.from} L 240 ${connector.to}`,
              stroke: '#b7c8a7',
              strokeWidth: '1.4',
              fill: 'none',
            })),
            geometry.routePaths.map((path) => h('path', {
              key: path.key,
              d: path.d,
              stroke: path.stroke,
              strokeWidth: '1.2',
              fill: 'none',
              strokeDasharray: path.dashed ? '4 5' : null,
            })),
            geometry.routePaths.map((path) => h('circle', {
              key: `${path.key}-dot`,
              cx: path.dot.x,
              cy: path.dot.y,
              r: '2.5',
              fill: '#819874',
            }))),
          geometry.cards.map((card) => navCard(card)),
          geometry.routeNodes.map((node) => h('button', {
            key: node.id,
            className: 'navText',
            type: 'button',
            style: { left: `${node.x}px`, top: `${node.y}px`, width: `${node.width}px` },
            onClick: () => pickNode(node),
          },
            h('div', { className: 'routeTitle' }, node.title),
            h('div', { className: 'routeMeta' }, node.status),
          )),
        )
      }

      /**
       * Per-sentence audio.
       *
       * The prototype keeps these controls present and says so out loud: no provider is
       * connected, so the button reports that instead of pretending to queue anything.
       */
      function requestSentenceAudio(anchorIdOfSentence, action) {
        showToast(format(t, 'audioNotWiredSentence', {
          index: sentenceOrdinal(anchorIdOfSentence),
          action: action === 'regenerate' ? t('audioRegenerate') : t('audioGenerate'),
        }))
        return { status: 'unconfigured' }
      }

      /** The 1-based position of a sentence in the passage, as the prototype labels it. */
      function sentenceOrdinal(id) {
        const all = (segmentation?.paragraphs ?? []).flatMap((paragraph) => paragraph.sentences)
        const at = all.findIndex((sentence) => sentence.id === id)
        return at === -1 ? 1 : at + 1
      }

      /**
       * The prototype's own constituent vocabulary.
       *
       * Its legend and its stylesheet speak in these eight names, so the Host's Chinese
       * role labels are mapped onto them rather than inventing a second palette.
       */
      const SYN_ROLES = [
        [/^(主语|sujet)/iu, 'subject'],
        [/^(谓语|变位动词|verbe|predicate)/iu, 'verb'],
        [/^(直接宾语|间接宾语|宾语|objet|cod|coi)/iu, 'object'],
        [/^(表语|attribut)/iu, 'predicative'],
        [/^(状语|副词|circonstanciel|adverbial)/iu, 'adverbial'],
        [/^(不定式|infinitif)/iu, 'infinitive'],
        [/^(修饰|épithète|epithete|modif)/iu, 'modifier'],
      ]

      function synRoleOf(role) {
        for (const [pattern, name] of SYN_ROLES) if (pattern.test(role)) return name
        return null
      }

      /**
       * The sentence with its constituents marked, the way the prototype marks it:
       * `span.syn-<role>` from its own stylesheet, and the prototype's invariant that the
       * markup must not change the text.
       */
      function syntaxMarkedSentence(text, constituents) {
        const pieces = renderConstituents(text, constituents)
        if (pieces.map((piece) => piece.text).join('') !== text) return [text]
        return pieces.map((piece, index) => (piece.role === null || synRoleOf(piece.role) === null
          ? piece.text
          : h('span', {
            key: `${piece.role}-${String(index)}`,
            className: `syn-${synRoleOf(piece.role)}`,
            title: piece.partOfSpeech === null ? piece.role : `${piece.role} · ${piece.partOfSpeech}`,
          }, piece.text)))
      }

      /**
       * `dialogValue(inputId, maxLength, emptyMessage)`: trim, refuse empty, refuse over
       * the limit, and put the focus back on the field either way.
       */
      function dialogValue(value, maxLength, emptyMessage) {
        const trimmed = value.trim()
        if (trimmed === '') { showToast(emptyMessage); return null }
        if (value.length > maxLength) { showToast(format(t, 'dialogTooLong', { max: maxLength })); return null }
        return trimmed
      }

      /**
       * `handleDialogEnter(event, action)`: Enter submits, but never while an input method
       * is composing (that Enter belongs to the IME), and never on a key repeat.
       */
      function handleDialogEnter(event, action) {
        if (event.key !== 'Enter') return false
        if (event.isComposing || event.keyCode === 229) return false
        event.preventDefault()
        event.stopPropagation()
        if (event.repeat) return false
        if (action === 'branch') { submitBranchDialog(); return true }
        if (action === 'lookup') { submitLookupDialog(); return true }
        return false
      }

      /** `openBranch(parent, cut)`: the hint names the source, or the sentence. */
      function openBranchDialog(parentId, cut) {
        const parent = (discussion?.branches ?? []).find((branch) => branch.branchId === parentId)
        setBranchDialog({ parentId, cut })
        setBranchTitle('')
        setBranchHint(parent === undefined
          ? format(t, 'branchFromSentence', { index: sentenceOrdinal(anchorId) })
          : `${t('branchFrom')}${parent.title}`)
        showToast('')
      }

      async function submitBranchDialog() {
        if (branchDialog === null) return
        const title = dialogValue(branchTitle, 90, t('branchTitleRequired'))
        if (title === null) return
        const fork = branchDialog
        setBranchDialog(null)
        await createBranchWith({ title, parentId: fork.parentId, cut: fork.cut })
      }

      async function submitLookupDialog() {
        const mot = dialogValue(lookupInput, 100, t('lookupRequired'))
        if (mot === null) return
        setLookupOpen(false)
        await lookupWord(mot)
      }

      /** Create a branch with the dialog's title, and the fork it was opened from. */
      async function createBranchWith({ title, parentId, cut }) {
        if (activePassage === null) return
        setAskBusy(true)
        setError('')
        try {
          const value = unwrap(await createBranch({
            passageId: activePassage.id, anchorId, kind: 'discussion', title,
            parentId: parentId ?? null,
            forkedFrom: parentId === null || cut === null || cut === undefined
              ? null
              : { branchId: parentId, messageId: forkedMessageId(parentId, cut) },
            operationId: createUuid(),
          }), t)
          if (value.kind === 'conflict') { setError(format(t, 'saveConflict', { reason: value.reason })); return }
          await loadDiscussion(activePassage.id)
          setAskStatus(t('branchOpened'))
        } catch (cause) {
          setError(format(t, 'generationUnavailable', { reason: String(cause?.message ?? cause) }))
        } finally {
          setAskBusy(false)
        }
      }

      /** The message a fork is fixed at, by its 1-based position in its own branch. */
      function forkedMessageId(branchId, cut) {
        const branch = (discussion?.branches ?? []).find((entry) => entry.branchId === branchId)
        const message = branch?.messages?.[cut - 1]
        return message?.messageId ?? ''
      }

      /** `lookupWord(mot)`: exact-Mot lookup — a hit is the stored entry, a miss is a miss. */
      async function lookupWord(mot) {
        try {
          const value = unwrap(await lookupMot({ mot, partOfSpeech: null }), t)
          setSelectedNode({
            id: `lookup-${mot}`, anchorId, kind: 'knowledge', title: mot,
            status: value.found ? t('entryStored') : t('entryNotStored'),
            body: value.found
              ? (value.entries[0]?.senses?.[0]?.definition ?? '')
              : format(t, 'lookupMiss', { count: value.candidates.length }),
            parentTitle: mot,
          })
        } catch (cause) {
          setError(format(t, 'generationUnavailable', { reason: String(cause?.message ?? cause) }))
        }
      }

      /** `conclude(id, j)` → the conclusion is stored as its own record, never as a rewrite. */
      async function recordConclusionFor(branchId, text) {
        if (activePassage === null) return
        try {
          const value = unwrap(await recordConclusion({
            passageId: activePassage.id, branchId, text, operationId: createUuid(),
          }), t)
          if (value.kind === 'conflict') setError(format(t, 'saveConflict', { reason: value.reason }))
          await loadDiscussion(activePassage.id)
          showToast(t('conclusionSaved'))
        } catch (cause) {
          setError(format(t, 'generationUnavailable', { reason: String(cause?.message ?? cause) }))
        }
      }

      /** `openActionDialog(config)`: the opener is remembered so focus can go back. */
      function openActionDialog(config) {
        actionOpener.current = typeof document === 'undefined' ? null : document.activeElement
        setActionDialog(config)
        setActionText(config.kind === 'conclude' ? config.value : '')
        setLookupOpen(false)
      }

      /** `closeActionDialog(restoreFocus)`: focus returns to whatever opened it. */
      function closeActionDialog(restoreFocus = true) {
        const opener = actionOpener.current
        setActionDialog(null)
        setActionText('')
        if (!restoreFocus || opener === null) return
        if (opener.isConnected === true) opener.focus?.({ preventScroll: true })
      }

      async function commitActionDialog() {
        if (actionDialog === null) return
        if (actionDialog.kind === 'conclude') {
          const text = dialogValue(actionText, 4000, t('conclusionRequired'))
          if (text === null) return
          const dialog = actionDialog
          closeActionDialog(false)
          await recordConclusionFor(dialog.branchId, text)
          return
        }
        closeActionDialog()
      }

      /**
       * The prototype's three dialogs, markup for markup.
       *
       * None of them is a native `prompt`/`confirm`: those are intercepted in a sandboxed
       * iframe, which is exactly what happened to this panel before.
       */
      function branchDialogView() {
        return h('div', { className: 'modalBackdrop' },
          h('div', {
            className: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modalTitle',
            onKeyDown: (event) => {
              if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); setBranchDialog(null) }
              if (event.key !== 'Tab') return
              const fields = Array.from(event.currentTarget.querySelectorAll('input:not(:disabled), button:not(:disabled)'))
              const first = fields[0], last = fields[fields.length - 1]
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
              if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
            },
          },
            h('div', { className: 'eyebrow' }, 'NEW BRANCH'),
            h('h2', { id: 'modalTitle' }, t('newBranch')),
            h('p', { className: 'hint', id: 'modalHint' }, branchHint),
            h('label', { htmlFor: 'branchInput', style: { fontSize: '12px' } }, t('titleField')),
            h('input', {
              id: 'branchInput', 'aria-required': 'true', maxLength: 90,
              placeholder: t('branchNamePlaceholder'),
              value: branchTitle,
              onChange: (event) => setBranchTitle(event.target.value),
              onKeyDown: (event) => handleDialogEnter(event, 'branch'),
            }),
            h('div', { className: 'modalFoot' },
              h('button', { type: 'button', onClick: () => setBranchDialog(null) }, t('cancel')),
              h('button', { type: 'button', className: 'primary', onClick: submitBranchDialog }, t('create')),
            ),
          ),
        )
      }

      function lookupDialogView() {
        return h('div', { className: 'modalBackdrop' },
          h('div', {
            className: 'modal kbModal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lookupTitle',
          },
            h('h2', { id: 'lookupTitle' }, t('lookupWord')),
            h('input', {
              id: 'lookupInput', autoComplete: 'off', maxLength: 100,
              'aria-required': 'true', 'aria-label': t('lookupPlaceholder'),
              placeholder: t('lookupPlaceholder'),
              value: lookupInput,
              onChange: (event) => setLookupInput(event.target.value),
              onKeyDown: (event) => handleDialogEnter(event, 'lookup'),
            }),
            h('div', { className: 'modalFoot' },
              h('button', { type: 'button', onClick: () => setLookupOpen(false) }, t('cancel')),
              h('button', { type: 'button', className: 'primary', onClick: submitLookupDialog }, t('lookupSubmit')),
            ),
          ),
        )
      }

      function actionDialogView() {
        const dialog = actionDialog
        return h('div', { className: 'modalBackdrop' },
          h('div', {
            className: 'modal actionDialog', role: 'dialog', 'aria-modal': 'true',
            'aria-labelledby': 'actionDialogTitle', 'aria-describedby': 'actionDialogDescription',
          },
            h('h2', { id: 'actionDialogTitle' }, dialog.title),
            h('p', { id: 'actionDialogDescription', className: 'hint' }, dialog.description),
            h('label', { className: 'kbField' },
              h('span', null, t('conclusionField')),
              h('textarea', {
                id: 'actionText', rows: 7, value: actionText,
                onChange: (event) => setActionText(event.target.value),
                onKeyDown: (event) => {
                  // Ctrl / ⌘ + Enter confirms; plain Enter stays a newline in a textarea.
                  if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
                  if (event.isComposing || event.keyCode === 229) return
                  event.preventDefault()
                  commitActionDialog()
                },
              }),
            ),
            h('div', { className: 'modalFoot' },
              h('button', { id: 'actionCancel', type: 'button', onClick: () => closeActionDialog() }, t('cancel')),
              h('button', { id: 'actionConfirm', type: 'button', className: 'primary', onClick: commitActionDialog }, t('confirm')),
            ),
          ),
        )
      }

      /** `syntaxLegend()`, markup and wording from the prototype. */
      function syntaxLegend() {
        if (!syntaxColour) return null
        return h('aside', { className: 'syntaxLegend', 'aria-label': t('syntaxLegendLabel') },
          h('div', { className: 'legendHead' },
            h('span', null, t('syntaxLegendHead')),
            h('button', {
              type: 'button',
              onClick: () => setSyntaxChinese((on) => !on),
            }, syntaxChinese ? t('syntaxTranslationColourOff') : t('syntaxTranslationColourOn')),
          ),
          h('span', { className: 'syn-subject' }, t('synSubject')),
          h('span', { className: 'syn-verb' }, t('synVerb')),
          h('span', { className: 'syn-object' }, t('synObject')),
          h('span', { className: 'syn-predicative' }, t('synPredicative')),
          h('span', { className: 'syn-adverbial' }, t('synAdverbial')),
          h('span', { className: 'syn-infinitive' }, t('synInfinitive')),
          h('span', { className: 'syn-modifier' }, t('synModifier')),
          h('span', { className: 'syn-clause', underline: 'true' }, t('synClause')),
        )
      }

      /** `renderLocation()`: chapter / paragraph / ordinal · node title. */
      function crumbText() {
        if (knowledgeOpen) return `${t('tabKnowledge')} / ${libraryTab === 'knowledge' ? t('lexiconTab') : t('lexiconTab')}`
        const paragraphs = segmentation?.paragraphs ?? []
        for (const [pIndex, paragraph] of paragraphs.entries()) {
          const sIndex = paragraph.sentences.findIndex((sentence) => sentence.id === anchorId)
          if (sIndex === -1) continue
          const title = sentenceAnalysis?.kind === 'found' ? t('analysisTitle') : t('notAnalysed')
          return `${format(t, 'sentenceMark', { index: sentenceList().findIndex((sentence) => sentence.id === anchorId) + 1 })} · ${title}`
        }
        return `${anchorLabel(anchorId)} · ${t('notAnalysed')}`
      }

      /** The passage's sentences in order, for ← / → and the ordinal display. */
      function sentenceList() {
        return (segmentation?.paragraphs ?? []).flatMap((paragraph) => paragraph.sentences)
      }

      function selectSentenceBy(step) {
        const all = sentenceList()
        const at = all.findIndex((sentence) => sentence.id === anchorId)
        // From a passage/paragraph anchor there is no current sentence; 下一句
        // enters the first one instead of being a dead control (上一句 stays
        // put at the very start).
        const next = at === -1 ? (step > 0 ? all[0] : undefined) : all[at + step]
        if (next === undefined) return
        selectSentence(next.id)
      }

      /** `focusNavigation()`: bring the focused sentence into view on the canvas. */
      function focusNavigation() {
        const paragraphs = segmentation?.paragraphs ?? []
        const all = paragraphs.flatMap((paragraph) => paragraph.sentences)
        const at = all.findIndex((sentence) => sentence.id === anchorId)
        if (at === -1) return
        setNavOpen(true)
        // The prototype's own aim: `nav = {scale:.8, x:12, y:55 - origin.y*.8}`, with
        // the origin being the sentence row's centre — correct for measured rows too.
        const origin = navGeometry(paragraphs, []).origins.get(anchorId)
        if (origin === undefined) return
        setNav(clampNavCamera({ x: 12, y: 55 - origin.y * 0.8, scale: 0.8 }))
        showToast(format(t, 'locatedSentence', { index: at + 1 }))
      }

      /** `focusIndex`: the current sentence's place in the passage. */
      function sentenceOrdinalText() {
        const all = sentenceList()
        const at = all.findIndex((sentence) => sentence.id === anchorId)
        if (at === -1) return `— / ${all.length}`
        return `${at + 1} / ${all.length}`
      }



      /**
       * The detail column's contents.
       *
       * The pane's own head (title + current anchor) and its scroll container live in
       * `readingShell`; this is only what goes inside, so the frame can change without
       * touching the sections.
       */
      /**
       * `renderDetail()`'s two branches for the reading surface.
       *
       * No node yet: the legend, the sentence itself, and the two actions the prototype
       * offers (`解析` / `＋ 分支`). With an analysis: title and status, the sentence, then
       * the prototype's three labelled sections — `句子译文`, `主干`, `结构与说明`.
       */
      /**
       * `renderDetail()`, branch by branch.
       *
       * The node the reader picked decides everything: an analysis node shows the three
       * labelled sections, a knowledge node shows the confirmed conclusion with its
       * source, a discussion node shows its messages and the composer, and no node at all
       * shows the sentence with the two actions the prototype offers.
       */
      function detailContent() {
        if (knowledgeOpen) {
          // `kbUI.mode`: the library lists, then an entry opens on top of it.
          if (knowledgeEntryId === null) {
            return h(KnowledgeLibrary, {
              t, listLexicon, listGrammar,
              onReturn: returnToAnalysis,
              onOpenEntry: (id, tab) => { setKnowledgeEntryId(id); setKnowledgeTab(tab) },
            })
          }
          return h(KnowledgeEntry, {
            t, entryId: knowledgeEntryId, tab: knowledgeTab, listLexicon, listGrammar, setGrammarMastery,
          },
            // One child, and it is a function: `KnowledgeEntry` is the only place that knows
            // the entry, so the bar and the card are both built inside it.
            (entry) => h('div', null,
              h('div', { className: 'kbBar' },
                h('button', {
                  className: 'kbReturn', type: 'button',
                  onClick: () => setKnowledgeEntryId(null),
                }, t('backToEntryList')),
                h('button', {
                  className: 'kbReturn', type: 'button', onClick: returnToAnalysis,
                }, t('backToAnalysis')),
              ),
              entry !== null && entry !== undefined && knowledgeTab === 'grammar' && entry.topic !== undefined
                ? h(GrammarDetail, { t, entry })
                : null,
              h(KnowledgeSection, {
              t, listLexicon, listGrammar, renderLexicon, resolveGrammarCandidate,
              setGrammarMastery, listLexiconSources, fetchLexiconSource,
              readConjugation, fetchConjugation, entry, tab: knowledgeTab,
              // The conjugation belongs to the entry's own conjugation section; which one
              // that is comes from the Host's section list, never from a fixed § number.
              extraForSection: ({ number, title }) => {
                if (knowledgeTab === 'grammar') return null
                if (!/变位|conjugat/iu.test(String(title)) && String(number) !== '§4') return null
                const lemma = conjugationLemmaOf(entry === null || entry === undefined
                  ? null
                  : entry.lemma ?? entry.mot ?? null)
                if (lemma === null) return null
                return h(ConjugationView, { key: 'conjugation', t, lemma, readConjugation, fetchConjugation })
              },
              }),
            ),
          )
        }
        const node = selectedNode
        if (node === null) return detailReading()
        if (node.kind === 'analysis') return detailReading()
        if (node.kind === 'knowledge') {
          return h('div', null,
            syntaxLegend(),
            h('div', { className: 'sectionLabel' }, t('confirmedConclusion')),
            h('div', { className: 'answer' }, node.body ?? node.status ?? ''),
            h('div', { className: 'quote' }, `${t('conclusionSource')}${node.parentTitle ?? node.title}`),
            h('button', {
              className: 'small', type: 'button',
              onClick: () => setSelectedNode(null),
            }, t('backToSourceDiscussion')),
          )
        }
        return h('div', null, syntaxLegend(), discussionNode(node))
      }

      /**
       * `⑂ 分叉`: the prototype opens its branch dialog with the fork point fixed to
       * message `j+1`. The dialog is the next milestone, so for now the fork records the
       * parent and the cut on the branch it creates rather than pretending otherwise.
       */
      /** `⑂ 分叉`: open the branch dialog with the fork fixed at message `j+1`. */
      function forkBranch(node, message) {
        const cut = ((discussion?.branches ?? [])
          .find((entry) => entry.branchId === node.id)?.messages ?? [])
          .findIndex((entry) => entry.messageId === message.messageId) + 1
        setAnchorId(node.anchorId)
        openBranchDialog(node.id, cut === 0 ? null : cut)
      }

      /** `提炼结论`: the prototype prefills the answer in a dialog and never rewrites it. */
      function concludeFrom(node, message) {
        openActionDialog({
          kind: 'conclude',
          title: t('distilConclusion'),
          description: t('conclusionDialogDescription'),
          branchId: node.id,
          value: message.text,
        })
      }

      /**
       * The prototype's composer: what the turn is about, the context it will send, the
       * draft, and the send control.
       *
       * One documented difference: the prototype sends in one press, while this panel
       * shows the compiled context first and sends on the confirming press — the reader
       * asked for "what I saw is what is sent", and that guarantee needs the preview.
       */
      function composerBody(node) {
        const branch = (discussion?.branches ?? []).find((entry) => entry.branchId === node.id)
        return h('div', null,
          h('div', { className: 'composeTarget' }, branch?.title ?? node.title),
          h('details', { className: 'context' },
            h('summary', null, t('contextTitle')),
            h('div', null, contextPreview === null
              ? t('contextNotCompiled')
              : format(t, 'contextSize', {
                characters: contextPreview.characters,
                count: contextPreview.materials.length,
              })),
          ),
          h('textarea', {
            className: 'draft',
            value: askDraft,
            placeholder: t('askPlaceholder'),
            'aria-label': t('askPlaceholder'),
            onChange: (event) => setAskDraft(event.target.value),
          }),
          h('div', { className: 'composerFoot' },
            h('span', { className: 'hint' }, model === '' ? t('modelNotConnected') : `${backend} · ${model}`),
            h('button', {
              className: 'small', type: 'button',
              disabled: askBusy || askDraft.trim() === '',
              onClick: () => (contextPreview === null ? previewTurn(node.anchorId) : sendTurn(node.anchorId)),
            }, contextPreview === null ? t('previewContext') : t('sendTurn')),
          ),
          streamText === ''
            ? null
            : h('pre', { className: 'streamText', role: 'status', 'aria-live': 'polite' }, streamText),
          askStatus === '' ? null : h('p', { className: 'status', role: 'status' }, askStatus),
        )
      }

      /** A discussion branch: where it came from, its messages, and its own actions. */
      function discussionNode(node) {
        const branch = (discussion?.branches ?? []).find((entry) => entry.branchId === node.id)
        const parent = (discussion?.branches ?? []).find((entry) => entry.branchId === branch?.parentId)
        return h('div', { className: 'discussionNode' },
          h('div', { className: 'quote' }, branch?.excerpt ?? sentenceText(node.anchorId)),
          branch?.parentId === null || branch?.parentId === undefined
            ? null
            : h('p', { className: 'hint' }, format(t, 'forkedFrom', {
              title: parent?.title ?? t('sourceText'),
              cut: branch.forkedFrom?.messageId === undefined ? '' : ` · ${format(t, 'fixedAtMessage', { index: branch.historyCount ?? 0 })}`,
            })),
          (branch?.messages ?? []).map((message) => h('div', {
            key: message.messageId,
            className: `message${message.author === 'user' ? ' user' : ''}`,
          },
            h('div', { className: 'messageLabel' }, message.author === 'user' ? t('you') : t('modelAnswer')),
            h('div', { className: 'answer' }, message.text),
            // `receiptHTML`: what this answer changed in the knowledge base. Silence here
            // would make "no reusable rule" and "the block was unreadable" look alike.
            message.author !== 'model' || message.extraction === null || message.extraction === undefined
              ? null
              : h('div', { className: 'writeReceipt' },
                h('div', { className: 'knowledgeChangesLabel' }, t('knowledgeChangesLabel')),
                h('span', null, message.extraction.status === 'extracted'
                  ? format(t, 'extractionAdded', { count: message.extraction.points })
                  : message.extraction.status === 'none'
                    ? t('extractionNone')
                    : format(t, 'extractionUnusable', {
                      reason: message.extraction.detail ?? message.extraction.status,
                    }))),
            message.author === 'model' ? h('div', { className: 'answerActions' },
              h('button', { className: 'small', type: 'button', onClick: () => forkBranch(node, message) }, t('forkBranch')),
              h('button', { className: 'small quiet', type: 'button', onClick: () => concludeFrom(node, message) }, t('distilConclusion')),
            ) : null,
          )),
          h('div', { className: 'answerActions' },
            h('button', {
              className: 'small', type: 'button',
              onClick: () => markBranch(node.id, (branch?.status ?? 'open') === 'open' ? 'settled' : 'open'),
            }, (branch?.status ?? 'open') === 'open' ? t('markUnderstood') : t('markToCheck')),
          ),
        )
      }

      /**
       * `renderDetail()` opens every branch with the legend, so the reading branches do too:
       * a wrapper keeps the existing markup untouched and puts the legend where the prototype
       * puts it.
       */
      function detailReading() {
        return h('div', null, sentenceAnalysis?.kind === 'found' ? syntaxLegend() : null, detailReadingBody())
      }

      function detailReadingBody() {
        const found = sentenceAnalysis?.kind === 'found' ? sentenceAnalysis.analysis : null
        const isSentence = isSentenceAnchorId(anchorId)
        if (found === null) {
          // A sentence anchor always shows the sentence itself; "select a sentence"
          // as the message while a sentence IS selected told the reader to do the
          // thing they had just done. The hint belongs to paragraph/passage anchors.
          return h('div', { className: 'empty' },
            isSentence
              ? h('div', { className: 'quote' }, syntaxMarkedSentence(sentenceText(anchorId), []))
              : h('div', { className: 'quote' }, t('analysisNeedsSentence')),
            isSentence
              ? h('p', { className: 'hint' }, t('notAnalysed'))
              : null,
          )
        }
        return h('div', { className: 'analysisView' },
          h('h2', { className: 'detailTitle' }, t('analysisTitle')),
          h('span', { className: 'tag' }, found.status === 'reviewed' ? t('statusReviewed') : t('statusDraft')),
          h('div', { className: 'quote' },
            syntaxMarkedSentence(found.text, found.constituents)),
          h('div', { className: 'sectionLabel' }, t('sentenceTranslationLabel')),
          h('div', { className: 'answer' }, found.translation),
          h('div', { className: 'sectionLabel' }, t('partBackbone')),
          h('div', { className: 'backbone' }, found.backbone),
          h('div', { className: 'sectionLabel' }, t('partStructure')),
          h('div', { className: 'answer' }, structureAnswer(found)),
        )
      }

      /** The sentence's own text, taken from the segmentation rather than re-read. */
      function sentenceText(id) {
        const sentence = sentenceList().find((entry) => entry.id === id)
        if (sentence !== undefined) return sentence.text
        return sentenceAnalysis?.kind === 'found' ? sentenceAnalysis.analysis.text : ''
      }

      /**
       * `结构与说明`: the prototype shows the clause structure and the explanations in one
       * labelled section, so the plugin's richer parts are folded in rather than given
       * their own headings.
       */
      function structureAnswer(found) {
        const rows = []
        for (const { clause, depth } of clauseRows(found.clauses)) {
          rows.push(h('p', { key: clause.id, className: 'structureClause', style: { marginLeft: `${depth * 14}px` } },
            h('span', { className: 'branchKind' }, clause.role), ' ', clause.text))
        }
        for (const explanation of found.explanations) {
          rows.push(h('p', { key: explanation.id, className: 'structureNote' },
            h('span', { className: 'noteKind' }, t(`certainty_${explanation.kind}`)), ' ', explanation.text))
        }
        if (rows.length === 0) rows.push(h('p', { key: 'empty', className: 'missingSection' }, t('noStructureYet')))
        return rows
      }

      

      /**
       * The reading frame: a compact top bar and two columns.
       *
       * Ported from the accepted prototype — a single 46px bar instead of a tall
       * header, and panes separated by hairlines instead of floating cards. The data
       * flow is unchanged: the same passages, the same anchors, the same workbench
       * sections inside the detail column.
       */
      /**
       * The panel as the prototype presents it: one compact bar, the navigation canvas
       * holding the paragraphs as cards, and the detail pane.
       *
       * `readerPane` and `graphPane` are deliberately absent. The prototype writes
       * `workspace.dataset.view` exactly once and always to `focus`, and that view hides
       * those two panes; rendering them would be a departure, not a port.
       */
      function readingShell(passage) {
        // Run feedback belongs to one passage and one sentence (or to the whole
        // passage); it is shown there and nowhere else.
        const feedbackVisible = analysisFeedbackFor !== null
          && analysisFeedbackFor.passageId === passage.id
          && (analysisFeedbackFor.anchorId === 'passage' || analysisFeedbackFor.anchorId === anchorId)
        return h('div', { className: 'fr-root bookLayout', ref: rootRef, 'data-directory': directoryOpen ? 'open' : 'closed' },
          h('header', { className: 'top compactTop' },
            h('div', { className: 'topLeft' },
              h('div', { className: 'brand', title: t('panel') },
                h('div', { className: 'logo' }, 'f.'),
                h('span', { className: 'title' }, t('panel')),
              ),
              h('button', { type: 'button', 'aria-expanded': directoryOpen, 'aria-controls': 'book-directory', onClick: toggleDirectory }, t('shelfToggle')),
              h('button', { type: 'button', onClick: showBookshelf }, t('shelfHome')),
              h('button', {
                className: 'navToggle', type: 'button', ref: navToggleRef,
                'aria-expanded': navOpen ? 'true' : 'false', 'aria-controls': 'reading-route',
                onClick: () => toggleNavigation(),
              }, navOpen ? t('navCollapse') : t('navToggle')),
            ),
            h('div', { className: 'topActions' },
              h('span', { className: 'progressWrap' },
                format(t, 'progressSentences', {
                  covered: (coverage?.covered ?? []).length,
                  total: coverage?.total ?? 0,
                })),
              h('button', {
                className: 'knowledgeTop', type: 'button',
                onClick: () => {
                  if (knowledgeOpen) { returnToAnalysis(); return }
                  openKnowledge()
                },
              }, t('tabKnowledge')),
              closeButton(),
            ),
          ),
          h('div', {
            className: `toast${toast === '' ? ' hidden' : ''}`,
            role: 'status', 'aria-live': 'polite',
          }, toast),
          bookDirectory(),
          locationDialog ? locationDialogView() : null,
          switcherOpen ? passageSwitcher() : null,
          branchDialog === null ? null : branchDialogView(),
          lookupOpen ? lookupDialogView() : null,
          actionDialog === null ? null : actionDialogView(),
          h('main', {
            className: 'workspace', 'data-view': 'focus', 'data-navigation': navOpen ? 'open' : 'closed',
          },
            h('aside', {
              className: `navigation${navOpen ? '' : ' closed'}`, id: 'reading-route',
              'aria-label': t('navTitle'),
              // In the compact drawer the canvas is a modal surface over an inert pane.
              role: compact && navOpen ? 'dialog' : null,
              'aria-modal': compact && navOpen ? 'true' : null,
              onKeyDown: (event) => {
                if (event.key === 'Escape') onNavigationKeyDown(event)
                if (event.key !== 'Tab' || !compact) return
                const controls = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled), [tabindex="0"]'))
                const first = controls[0], last = controls[controls.length - 1]
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
                if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
              },
            },
              h('div', { className: 'sheetHandle', 'aria-hidden': 'true' }),
              h('div', { className: 'navHead' },
                h('strong', null, t('navTitle')),
                h('div', { className: 'controls' },
                  h('button', {
                    type: 'button', 'aria-label': t('navZoomOut'), onClick: () => zoomNavBy(0.8),
                  }, `− ${t('navZoomOut')}`),
                  h('span', { id: 'navScale', role: 'status', 'aria-live': 'polite' }, `${Math.round(nav.scale * 100)}%`),
                  h('button', {
                    type: 'button', 'aria-label': t('navZoomIn'), onClick: () => zoomNavBy(1.25),
                  }, `＋ ${t('navZoomIn')}`),
                  h('button', {
                    type: 'button', 'aria-label': t('navCollapse'), onClick: () => toggleNavigation(false),
                  }, t('navCollapse')),
                ),
              ),
              h('div', {
                className: 'navStage',
                ref: navStage,
                tabIndex: 0,
                'aria-label': t('navStageLabel'),
                onWheel: onNavWheel,
                onPointerDown: onNavPointerDown,
                onPointerMove: onNavPointerMove,
                onPointerUp: onNavPointerUp,
                onPointerCancel: onNavPointerUp,
                onKeyDown: onNavigationKeyDown,
              },
                segmentation === null
                  ? h('div', { className: 'empty' }, t('segmentationLoading'))
                  : navWorld(segmentation.paragraphs ?? []),
              ),
              h('div', { className: 'navFoot' },
                h('span', null, t('navHint')),
                h('button', { className: 'quiet', type: 'button', onClick: fitNavigation }, t('navFit')),
              ),
            ),
            h('section', {
              className: `pane detailPane${knowledgeOpen ? ' readingPaneKnowledge' : ''}${shortReading ? ' shortReading' : ''}`,
              id: 'readingPane',
              ref: readingPaneRef,
              onMouseUp: captureReadingSelection,
              onKeyUp: captureReadingSelection,
              'aria-label': knowledgeOpen ? t('tabKnowledge') : t('benchTitle'),
            },
              h('div', { className: 'continuationBar' },
                h('div', { className: 'passageHeading' },
                  h('div', { className: 'bookBreadcrumb' }, shelf.placements[passage.id] ? `${shelf.placements[passage.id].book} / ${shelf.placements[passage.id].chapter} / ${format(t, 'paragraphLabel', { index: shelf.placements[passage.id].number })}` : t('unfiled')),
                  h('strong', { className: 'currentPassageTitle', title: passage.title }, passage.title)),
                h('button', { type: 'button', className: 'small quiet', onClick: () => { setError(''); setLocationDialog({ passageId: passage.id, ...(shelf.placements[passage.id] ?? { book: '', chapter: '', number: 1 }) }) } }, t('organizePassage')),
                nextPassages[passage.id] ? h('button', {
                  className: 'primary small', type: 'button', disabled: busy || loadingPassage,
                  title: nextPassages[passage.id].title,
                  onClick: () => { void openPassage(nextPassages[passage.id].id) },
                }, t('startNextPassage')) : h('button', {
                  className: 'small', type: 'button', disabled: busy,
                  onClick: () => { void composeNextPassage() },
                }, t('nextPassage')),
              ),
              h('div', { className: 'crumb', id: 'crumb' }, crumbText()),
              // Generation feedback was previously set into state and rendered
              // nowhere: a refused or failed analysis was invisible. These lines
              // are where the reader learns what the run did — and, while one is
              // on, what stage it is at, how long it has been going, and that it
              // can be cancelled.
              h('div', { className: 'detailScroll', ref: detailScrollRef },
                readingSource(),
                knowledgeOpen ? null : h('div', { className: 'sentenceWorkspace' },
              h('div', { className: 'paneHead' },
                h('div', { className: 'sentenceControls' },
                  h('button', {
                    className: 'small quiet', type: 'button', 'aria-label': t('previousSentence'), disabled: sentenceList().findIndex((sentence) => sentence.id === anchorId) <= 0,
                    onClick: () => selectSentenceBy(-1),
                  }, '←'),
                  h('span', { id: 'focusIndex' }, sentenceOrdinalText()),
                  h('button', {
                    className: 'small quiet', type: 'button', 'aria-label': t('nextSentence'), disabled: sentenceList().length === 0 || sentenceList().findIndex((sentence) => sentence.id === anchorId) === sentenceList().length - 1,
                    onClick: () => selectSentenceBy(1),
                  }, '→'),
                ),
                h('div', { className: 'focusTools' },
                  h('button', {
                    className: 'quiet small', type: 'button', onClick: focusNavigation,
                  }, t('locateNavigation')),
                ),
              ),
              h('div', { className: 'readingActions', id: 'readingActions' },
                h('button', { id: 'start', className: 'primary small', type: 'button', disabled: analysisBusy || backend === '' || model === '' || !isSentenceAnchorId(anchorId), onClick: analyseCurrent }, analysisBusy ? t('analyzing') : sentenceAnalysis?.kind === 'found' ? t('reanalyseSentence') : t('analyseTop')),
                h('span', { className: 'selectedWord' }, selectedWord),
                h('button', {
                  className: 'small', type: 'button',
                  // `openLookup()`: a selected word is looked up straight away; only an
                  // empty selection opens the dialog.
                  onClick: () => {
                    if (selectedWord !== '') { void lookupWord(selectedWord); return }
                    setLookupInput('')
                    setLookupOpen(true)
                  },
                }, t('lookupWord')),
                h('button', {
                  className: `small${syntaxColour ? ' syntaxActive' : ''}`, type: 'button',
                  'aria-pressed': syntaxColour ? 'true' : 'false',
                  onClick: () => setSyntaxColour((on) => !on),
                }, t('syntaxToggle')),
                // The model the run will use is visible and selectable here — the
                // generation wiring used to be entirely implicit (first backend,
                // first model), with no way to see or change it mid-reading.
                h('select', {
                  className: 'modelSelect', 'aria-label': t('modelLabel'),
                  value: model, disabled: analysisBusy || models.length === 0,
                  onChange: (event) => {
                    setModel(event.target.value)
                    persistModelPreference(event.target.value)
                  },
                }, models.length === 0
                  ? [h('option', { key: 'no-model', value: '' }, t('noModels'))]
                  : models.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.name))),
                h('button', { type: 'button', className: 'small', disabled: true, title: t('audioNotWired') }, t('audioGenerate')),
              ),
              h('div', { className: 'branchStrip', id: 'branchStrip' },
                (discussion?.branches ?? [])
                  .filter((branch) => branch.anchorId === anchorId)
                  .map((branch) => h('button', {
                    key: branch.branchId, className: 'small', type: 'button',
                    onClick: () => startBranch(anchorId),
                  }, branch.title)),
                anchorId === '' ? null : h('button', {
                  className: 'small', type: 'button', onClick: () => openBranchDialog(null, null),
                }, t('addBranchShort')),
              ),
                ),
                analysisRun === null ? null : h('div', { className: 'runStatus', role: 'status' },
                  h('span', null, format(t, 'analysisStageElapsed', {
                    stage: t('analysisStage'),
                    seconds: Math.floor((Date.now() - analysisRun.startedAt) / 1000),
                  })),
                  h('button', {
                    className: 'small quiet', type: 'button', onClick: cancelAnalysisRun,
                  }, t('cancel')),
                ),
                error === '' ? null : h('p', { className: 'error', role: 'alert' }, error),
                !feedbackVisible || analysisError === '' ? null : h('p', { className: 'error', role: 'alert' }, analysisError),
                !feedbackVisible || analysisStatus === '' ? null : h('p', { className: 'hint', role: 'status' }, analysisStatus),
                detailContent()),
              // The composer belongs to a discussion node and to nothing else, exactly as
              // the prototype toggles it (`!n || n.type !== 'discussion'` → hidden).
              selectedNode !== null && selectedNode.kind === 'discussion' && !knowledgeOpen
                ? h('div', { className: 'composer' }, composerBody(selectedNode))
                : null,
            ),
          ),
        )
      }

      /**
       * The panel's front door.
       *
       * `readingShell` when a passage is open. With none open the panel is the start
       * page itself, not a dialog over nothing: what a close reading commits to
       * (`composeHint`), the new-passage composer already open, and the saved passages
       * below it with their excerpts. The switcher dialog still exists — opened from
       * the brand title while a passage is loaded.
       */
      function frontDoor() {
        if (activePassage !== null) return readingShell(activePassage)
        return h('div', { className: 'fr-root bookLayout', ref: rootRef, 'data-directory': directoryOpen ? 'open' : 'closed' },
          h('header', { className: 'top compactTop' },
            h('div', { className: 'topLeft' }, h('div', { className: 'brand' }, h('div', { className: 'logo' }, 'f.'), h('span', { className: 'title' }, t('panel'))),
              h('button', { type: 'button', onClick: toggleDirectory, 'aria-expanded': directoryOpen, 'aria-controls': 'book-directory' }, t('shelfToggle'))),
            h('div', { className: 'topActions' }, h('button', { type: 'button', onClick: () => beginChapterPassage() }, t('newPassage')), closeButton())),
          bookDirectory(),
          h('main', { className: 'frontDoor shelfWelcome' },
            h('div', { className: 'frontDoorInner' }, h('div', { className: 'eyebrow' }, t('brandSub')),
              h('h2', { className: 'frontDoorTitle' }, t('shelfWelcome')),
              h('p', { className: 'frontDoorHint' }, t('shelfWelcomeHint')),
              h('div', { className: 'shelfWelcomeActions' },
                h('button', { className: 'primary', type: 'button', onClick: () => { setError(''); setLocationDialog({ book: '', chapter: '', number: 1 }) } }, t('newBook')),
                h('button', { type: 'button', onClick: () => beginChapterPassage() }, t('newPassage'))),
              h('p', { className: 'hint' }, format(t, 'count', { count: total })))),
          switcherOpen ? passageSwitcher() : null,
          locationDialog ? locationDialogView() : null,
          error ? h('p', { className: 'error', role: 'alert' }, error) : null)
      }

      return h('div', { className: 'fr-page' },
        h('style', null, `${PROTOTYPE_STYLES}\n${styles}`),
        frontDoor(),
      )
    }

    const UiPlugin = {
      name: 'french-close-reading:ui',
      inject: ['remote.frenchReader', 'slots', 'locale', 'layout'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        const api = ctx.remote.frenchReader
        const face = {
          t,
          listPassages: (request) => api.listPassages(request),
          getPassage: (request) => api.getPassage(request),
          createPassage: (request) => api.createPassage(request),
          archivePassage: (request) => api.archivePassage(request),
          exportPassages: () => api.exportPassages(),
          exportLibrary: () => api.exportLibrary({ scope: 'all' }),
          previewImport: (request) => api.previewImport(request),
          createSelection: (request) => api.createSelection(request),
          listLexicon: (request) => api.listLexicon(request),
          listGrammar: (request) => api.listGrammar(request),
          resolveGrammarCandidate: (request) => api.resolveGrammarCandidate(request),
          renderLexicon: (request) => api.renderLexicon(request),
          readSentenceAnalysis: (request) => api.readSentenceAnalysis(request),
          readAnalysisCoverage: (request) => api.readAnalysisCoverage(request),
          // The typert call stub takes the caller's AbortSignal as one extra
          // trailing argument (cancellation: { parameter: 'signal' }); aborting it
          // cancels the RPC, which propagates to the Host's generation stream.
          analyseSentence: (request, signal) => (signal === undefined
            ? api.analyseSentence(request)
            : api.analyseSentence(request, signal)),
          analyseParagraph: (request, signal) => (signal === undefined
            ? api.analyseParagraph(request)
            : api.analyseParagraph(request, signal)),
          publishAnalysis: (request) => api.publishAnalysis(request),
          listLexiconSources: (request) => api.listLexiconSources(request),
          fetchLexiconSource: (request) => api.fetchLexiconSource(request),
          setGrammarMastery: (request) => api.setGrammarMastery(request),
          listBackends: (request) => api.listBackends(request),
          listBackendModels: (request) => api.listBackendModels(request),
          previewAsk: (request) => api.previewAsk(request),
          ask: (request) => api.ask(request),
          streamAsk: (request) => api.streamAsk(request),
          listDiscussion: (request) => api.listDiscussion(request),
          lookupMot: (request) => api.lookupMot(request),
          recordConclusion: (request) => api.recordConclusion(request),
          adoptTranslation: (request) => api.adoptTranslation(request),
          createBranch: (request) => api.createBranch(request),
          setBranchState: (request) => api.setBranchState(request),
          getSegmentation: (request) => api.getSegmentation(request),
          listAnalysis: (request) => api.listAnalysis(request),
          saveTranslation: (request) => api.saveTranslation(request),
          addBranch: (request) => api.addBranch(request),
          onClose: () => ctx.layout.selectPanel(null),
        }
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'french-close-reading', locale: NS, inject: () => face,
        }, PassagePage))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'french-close-reading', order: 40,
          locale: NS, label: () => t('panel'),
        }, ReaderIcon))
      },
    }

    return {
      /** Test seam: the offset rule, without a browser. */
      __test__: internals,
      inject: ['remote', 'locale'],
      async apply(ctx) {
        // A browser half must never take the whole web boot down with it: the
        // boot audit fails the app when any client entry's fiber is not active,
        // so every failure here is reported in the panel instead of thrown.
        try {
          ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'french-close-reading: dictionaries')
          let remoteFailure = null
          let disposeRemote = async () => {}
          try {
            disposeRemote = await ctx.remote.$mount(remoteContribution)
          } catch (error) {
            remoteFailure = error
            console.error('[french-close-reading] Remote mount failed', error)
          }
          const uiFiber = ctx.plugin(remoteFailure === null ? UiPlugin : failurePlugin(remoteFailure))
          return async () => {
            if (uiFiber) await uiFiber.dispose()
            await disposeRemote()
          }
        } catch (error) {
          console.error('[french-close-reading] client activation failed', error)
          return undefined
        }
      },
    }

    /** Panel shown when the Remote mount failed, so the failure is visible, not silent. */
    function failurePlugin(error) {
      const message = String(error?.message ?? error)
      function FailurePanel({ t, onClose }) {
        return h('div', { className: 'fr-page' },
          h('style', null, `${PROTOTYPE_STYLES}\n${styles}`),
          h('div', { className: 'fr-shell' },
            h('header', { className: 'fr-top' },
              h('div', { className: 'fr-brand' },
                h('span', { className: 'fr-brandIcon' }, h(ReaderIcon, { size: 20, active: true })),
                h('div', null, h('div', { className: 'fr-brandName' }, t('panel'))),
              ),
              h('div', { className: 'fr-topActions' },
                h('button', { className: 'fr-button fr-buttonQuiet', type: 'button', onClick: onClose, title: t('close') }, '×'),
              ),
            ),
            h('div', { className: 'fr-nestedCard' },
              h('p', { className: 'fr-error', role: 'alert' }, t('activationFailed')),
              h('pre', { className: 'fr-cardBody' }, message),
              h('p', { className: 'fr-help' }, t('activationFailedHint')),
            ),
          ),
        )
      }
      return {
        name: 'french-close-reading:failed',
        inject: ['slots', 'locale', 'layout'],
        apply(ctx) {
          const t = ctx.locale.bind(NS)
          const face = { t, onClose: () => ctx.layout.selectPanel(null) }
          ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main', key: 'french-close-reading', locale: NS, inject: () => face,
          }, FailurePanel))
        },
      }
    }
  },
})
