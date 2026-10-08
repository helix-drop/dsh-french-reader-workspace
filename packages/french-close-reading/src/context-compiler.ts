/**
 * The context compiler.
 *
 * A request's context is *compiled*, never inherited. The compiler takes the
 * materials the reader chose — the current paragraph, the current sentence or
 * selection, the analysis version, this branch's own history, explicitly added
 * knowledge — and produces one immutable manifest: what went in, at which
 * version, why, and the exact text.
 *
 * Three properties matter more than the rest:
 *
 * 1. **Preview and request compile the same object.** There is one code path, and
 *    the caller sends the manifest it compiled for the preview rather than
 *    compiling a second time, so what the reader was shown is what was sent.
 * 2. **A branch is a boundary.** History comes from this branch and the chain of
 *    branches it was forked from, each cut off at its fork point; a sibling
 *    branch's messages cannot enter a request because the two happen to share a
 *    parent.
 * 3. **An unresolved anchor is refused, never silently dropped.** A request whose
 *    object of discussion could not be resolved would ask about text the model
 *    cannot see, so compilation fails with a reason instead.
 */
import type {
  StoredAnalysis,
  StoredContextManifest,
  StoredContextMaterial,
  StoredDiscussion,
  StoredDiscussionBranch,
  StoredPassage,
  StoredSegmentation,
} from './domain.ts'
import { branchHistory } from './discussion-store.ts'
import { renderExtractionInstruction } from './answer-extraction.ts'
import { sha256Hex } from './digest.ts'
import { findAnchor, PASSAGE_ANCHOR_ID } from './segmentation.ts'

/**
 * The output-policy revision the model is asked to follow.
 *
 * Revision 2 adds the grammar block: a turn that raises a reusable grammar point
 * must end with the machine-readable block the automatic accumulation path reads
 * (see `answer-extraction.ts`). The revision is hashed into every fingerprint, so
 * previews compiled under revision 1 are deliberately stale rather than silently
 * sent with instructions the reader never saw.
 */
export const POLICY_REVISION = 'close-reading/2'

/**
 * The compiler's own revision, part of every fingerprint.
 *
 * The fingerprint answers "would this request contain exactly the bytes the
 * reader approved?". A change to how materials are assembled changes that answer
 * even when the inputs did not, so bumping this deliberately invalidates every
 * preview compiled by an older build instead of silently accepting it. Version 2
 * is the first content-covering fingerprint (version 1 hashed ids and lengths).
 */
export const COMPILER_VERSION = 2

export interface CompileInput {
  passage: StoredPassage
  segmentation: StoredSegmentation
  discussion: StoredDiscussion
  analysis: StoredAnalysis
  branch: StoredDiscussionBranch
  /** The reader's question for this turn. */
  question: string
  backend: string
  model: string
  /** Knowledge or other conclusions the reader explicitly added to this turn. */
  extras?: readonly { refId: string; reason: string; text: string }[]
  /**
   * The reader's selection, when the branch is anchored on one. A selection is not
   * part of the segmentation, so its text has to travel with the compile input;
   * the caller resolves it from the stored selection record and refuses the turn
   * when it cannot (see `selection-stale`), because a request that cannot quote
   * the words it is about would be asking about nothing.
   */
  selection?: { refId: string; text: string } | null
  /**
   * Hard ceiling on the compiled text. Exceeding it is a refusal, never a silent
   * truncation: dropping the sentence a question is about would be worse than
   * not asking.
   */
  maxCharacters?: number | null
}

export interface CompileResult {
  ok: boolean
  manifest?: StoredContextManifest
  /** Set when the compilation was refused; the message names the reason. */
  reason?: string
  characters?: number
}

/** The default ceiling: agy's own limit is tighter and overrides this. */
export const DEFAULT_MAX_CONTEXT_CHARACTERS = 60_000

/**
 * Compile one turn's context.
 *
 * The materials are built in a fixed order so the same inputs always produce the
 * same manifest, including the fingerprint that decides whether a preview is
 * still usable.
 */
export function compileContext(input: CompileInput): CompileResult {
  const materials: StoredContextMaterial[] = []
  const anchorId = input.branch.anchorId

  // 1. The paragraph the anchor lives in, kept whole so pronouns and the flow of
  //    the argument survive. A bare sentence loses exactly what a close reading
  //    depends on.
  const paragraph = paragraphOf(input.segmentation, anchorId)
  if (paragraph !== undefined) {
    materials.push({
      kind: 'paragraph',
      refId: paragraph.id,
      reason: '当前段落原文：代词与论述关系需要在上下文中',
      sourceRevision: input.passage.sourceRevision,
      anchorId: paragraph.id,
      text: paragraph.text,
      reduced: false,
    })
  }

  // 2. The exact anchor: the whole passage, one paragraph, one sentence, or the
  //    reader's selection — quoted so the model sees precisely what is discussed.
  const anchorText = textOfAnchor(input, anchorId)
  if (anchorText === undefined) {
    // Dropping the anchor would leave a request about text the model cannot see:
    // the question would be answered against the paragraph alone, or against
    // nothing at all. A refusal with its reason is the honest outcome.
    return {
      ok: false,
      reason: `anchor-unresolved: 锚点 ${anchorId} 无法在本修订的原文中解析；为避免问题脱离原文，本次未发送。`,
    }
  }
  if (anchorText !== paragraph?.text) {
    materials.push({
      kind: anchorMaterialKind(anchorId),
      refId: anchorId,
      reason: '本次讨论锚点：问题针对的原文',
      sourceRevision: input.passage.sourceRevision,
      anchorId,
      text: anchorText,
      reduced: false,
    })
  }

  // 3. The analysis currently on record for this anchor, at the version it is at
  //    now. Translations of other anchors are deliberately absent.
  for (const translation of input.analysis.translations.filter((entry) => entry.anchorId === anchorId)) {
    materials.push({
      kind: 'analysis',
      refId: translation.id,
      reason: '当前译文（作为可讨论的版本，不是既定结论）',
      sourceRevision: input.passage.sourceRevision,
      anchorId,
      text: translation.text,
      reduced: false,
    })
  }

  // 4. This branch's own history, cut off at its fork point.
  const history = branchHistory(input.discussion, input.branch)
  if (history.length > 0) {
    const text = history
      .map((message) => `${message.author === 'user' ? '读者' : '回答'}：${message.text}`)
      .join('\n\n')
    materials.push({
      kind: 'branch-history',
      refId: input.branch.id,
      reason: `本分支历史（${String(history.length)} 条）：分支之间互不继承`,
      sourceRevision: null,
      anchorId,
      text,
      reduced: false,
    })
  }

  // 5. Whatever the reader explicitly added for this turn.
  for (const extra of input.extras ?? []) {
    materials.push({
      kind: 'knowledge',
      refId: extra.refId,
      reason: extra.reason,
      sourceRevision: null,
      anchorId: null,
      text: extra.text,
      reduced: false,
    })
  }

  const characters = materials.reduce((total, material) => total + material.text.length, 0)
  const ceiling = input.maxCharacters ?? DEFAULT_MAX_CONTEXT_CHARACTERS
  if (characters > ceiling) {
    return {
      ok: false,
      characters,
      reason: `context-too-long: 本次上下文约 ${String(characters)} 字符，超过上限 ${String(ceiling)}；请缩减引用或改用容量更大的模型。`,
    }
  }

  const id = globalThis.crypto.randomUUID()
  const manifest: StoredContextManifest = {
    id,
    passageId: input.passage.id,
    branchId: input.branch.id,
    anchorId,
    question: input.question,
    backend: input.backend,
    model: input.model,
    materials,
    characters,
    fingerprint: fingerprintOf({
      passageId: input.passage.id,
      branchId: input.branch.id,
      anchorId,
      question: input.question,
      backend: input.backend,
      model: input.model,
      sourceRevision: input.passage.sourceRevision,
      materials,
    }),
    policyRevision: POLICY_REVISION,
    createdAt: new Date().toISOString(),
  }
  return { ok: true, manifest, characters }
}

/**
 * Render the compiled manifest as the model-facing prompt.
 *
 * The prompt is a rendering of the manifest, not a second assembly: every block
 * names the material it came from, so an answer can be traced back to what it was
 * allowed to see.
 */
export function renderPrompt(manifest: StoredContextManifest): string {
  const blocks = manifest.materials.map((material) => [
    `【${materialLabel(material)}】${material.reason}`,
    material.text,
  ].join('\n'))
  return [
    '请基于以下材料回答读者的问题。只使用这些材料；材料之外的内容若需查证，请明确说明。',
    '',
    '=== 本次材料 ===',
    blocks.join('\n\n'),
    '',
    '=== 读者的问题 ===',
    manifest.question,
  ].join('\n')
}

/** The system instruction for one compiled turn. */
export function renderSystem(): string {
  return [
    '你是一位法语精读助手，帮助读者逐句读懂法语原文。',
    '纪律：',
    '- 分开陈述句法事实、语境解释与修辞／思想解读，不要把推测写成作者必然的意图。',
    '- 不确定的内容标注「待查证」，不要编造。',
    '- 不要改写原文，不要假设你看到了未提供的段落。',
    '- 回答用中文，保留法语原句与术语。',
    '',
    renderExtractionInstruction(),
  ].join('\n')
}

export function materialLabel(material: StoredContextMaterial): string {
  switch (material.kind) {
    case 'paragraph': return '当前段落'
    case 'sentence': return `锚点 ${material.refId}`
    case 'selection': return `选区 ${material.refId}`
    case 'passage': return '整篇原文'
    case 'analysis': return '当前译文'
    case 'branch-history': return '本分支历史'
    case 'knowledge': return '读者加入的知识'
    case 'conclusion': return '已确认结论'
    case 'message': return '引用消息'
    default: return '材料'
  }
}

/** The paragraph anchor containing one anchor id, if there is one. */
function paragraphOf(segmentation: StoredSegmentation, anchorId: string): { id: string; text: string } | undefined {
  if (anchorId === PASSAGE_ANCHOR_ID) return undefined
  for (const paragraph of segmentation.paragraphs) {
    if (paragraph.id === anchorId) return paragraph
    for (const sentence of paragraph.sentences) {
      if (sentence.id === anchorId) return paragraph
    }
  }
  return undefined
}

/** The exact text of one anchor: the passage, a paragraph, a sentence, or a selection. */
function textOfAnchor(input: CompileInput, anchorId: string): string | undefined {
  if (anchorId === PASSAGE_ANCHOR_ID) return input.passage.sourceText
  const found = findAnchor(input.segmentation.paragraphs, anchorId)
  if (found !== undefined) return found.text
  // A selection anchor is not part of the segmentation: its text is the excerpt
  // stored with the selection record, resolved by the caller and carried here.
  // Anything else — including a selection the caller could not resolve — has no
  // text, and the compiler refuses rather than sending a request without its
  // object of discussion.
  if (anchorId.startsWith('sel_')) {
    return input.selection !== null && input.selection !== undefined && input.selection.refId === anchorId
      ? input.selection.text
      : undefined
  }
  return undefined
}

/** The material kind one anchor id produces. */
function anchorMaterialKind(anchorId: string): StoredContextMaterial['kind'] {
  if (anchorId === PASSAGE_ANCHOR_ID) return 'passage'
  return anchorId.startsWith('sel_') ? 'selection' : 'sentence'
}

/**
 * A stable fingerprint of everything that decides what a request contains.
 *
 * It covers the **content** of every material, not just its identity: hashing ids,
 * revisions and lengths would let a same-length edit pass as "the same context",
 * which is exactly the case a preview must catch. The compiler revision and the
 * policy revision are hashed too, so a build that assembles or instructs
 * differently cannot inherit an older approval.
 *
 * It is recomputed the same way for a preview and for the real send, so a stale
 * preview is detectable instead of silently re-used.
 */
export function fingerprintOf(parts: {
  passageId: string
  branchId: string
  anchorId: string
  question: string
  backend: string
  model: string
  sourceRevision: number
  materials: readonly StoredContextMaterial[]
}): string {
  // A canonical rendering: field order is fixed here rather than inherited from
  // whatever object the caller holds, so the digest depends on the values only.
  const canonical = JSON.stringify({
    compilerVersion: COMPILER_VERSION,
    policyRevision: POLICY_REVISION,
    passageId: parts.passageId,
    branchId: parts.branchId,
    anchorId: parts.anchorId,
    question: parts.question,
    backend: parts.backend,
    model: parts.model,
    sourceRevision: parts.sourceRevision,
    materials: parts.materials.map((material) => ({
      kind: material.kind,
      refId: material.refId,
      reason: material.reason,
      sourceRevision: material.sourceRevision,
      anchorId: material.anchorId,
      reduced: material.reduced,
      text: material.text,
    })),
  })
  return sha256Hex(canonical)
}
