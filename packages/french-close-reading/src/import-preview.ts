/**
 * Import confirmation.
 *
 * A French source enters the library only after the reader has seen what will be
 * stored: the paragraph and sentence boundaries the segmenter will use, and
 * anything about the text that looks like damage rather than prose. This module
 * never writes — it only reports, so confirming is a separate deliberate act.
 */

import { segmentSource } from './segmentation.ts'

export type ImportFlagCode =
  | 'empty'
  | 'mojibake'
  | 'byte-order-mark'
  | 'mixed-line-endings'
  | 'unbalanced-guillemets'
  | 'trailing-whitespace'
  | 'ligature-missing'
  | 'paragraph-too-long'
  | 'no-terminal-punctuation'
  | 'non-breaking-space'
  | 'double-space'

export interface ImportFlag {
  code: ImportFlagCode
  severity: 'error' | 'hint'
  detail: string
}

export interface ImportSentencePreview {
  id: string
  text: string
  /** Absolute half-open character range into the exact source text. */
  start: number
  end: number
}

export interface ImportPreview {
  title: string
  characters: number
  paragraphs: number
  sentences: number
  /** Paragraph and sentence boundaries as the segmenter will store them. */
  blocks: { id: string; sentences: number; excerpt: string; sentenceDetails: ImportSentencePreview[] }[]
  head: string
  tail: string
  flags: ImportFlag[]
}

/** Paragraphs longer than this are worth splitting before analysis. */
const LONG_PARAGRAPH = 1200

/**
 * Describe what importing this source would store.
 * @param input - The proposed title and the exact French source.
 * @returns Boundaries, excerpts and every flag the reader should judge.
 */
export function previewImport(input: { title: string; sourceText: string }): ImportPreview {
  const sourceText = input.sourceText
  const paragraphs = segmentSource(sourceText)
  const sentences = paragraphs.reduce((total, paragraph) => total + paragraph.sentences.length, 0)
  const flags: ImportFlag[] = []

  if (sourceText.trim() === '') {
    flags.push({ code: 'empty', severity: 'error', detail: '原文为空：没有任何内容可保存' })
  }

  // Encoding damage: mojibake survives copy-paste and silently corrupts every
  // later analysis, so it is an error rather than a style note.
  // UTF-8 read as Latin-1 shows up as these pairs; none of them occur in real
  // French text, so the check does not fire on legitimate accents (â, é, ç…).
  const mojibake = sourceText.match(/Ã.|Å.|â€.|Â.|ï»¿|�/gu)
  if (mojibake !== null) {
    flags.push({
      code: 'mojibake',
      severity: 'error',
      detail: `疑似编码损坏 ${String(mojibake.length)} 处（如 ${mojibake.slice(0, 3).join('、')}）：这通常是 UTF-8 被按 Latin-1 解读`,
    })
  }

  // A byte-order mark is invisible but becomes part of the first word, so the
  // first anchor would carry it forever.
  if (sourceText.includes('\uFEFF')) {
    flags.push({
      code: 'byte-order-mark',
      severity: 'error',
      detail: '原文含 BOM（\uFEFF）：它会成为第一个词的一部分，请去掉后再保存',
    })
  }

  if (sourceText.includes('\r\n') && /(?<!\r)\n/u.test(sourceText)) {
    flags.push({ code: 'mixed-line-endings', severity: 'hint', detail: '同时存在 CRLF 与 LF 换行：分段结果可能不稳定' })
  }

  const open = (sourceText.match(/«/gu) ?? []).length
  const close = (sourceText.match(/»/gu) ?? []).length
  if (open !== close) {
    flags.push({ code: 'unbalanced-guillemets', severity: 'hint', detail: `法文引号不配对：« ${String(open)} 个，» ${String(close)} 个` })
  }

  const trailing = sourceText.split('\n').filter((line) => /[ \t]+$/u.test(line)).length
  if (trailing > 0) {
    flags.push({ code: 'trailing-whitespace', severity: 'hint', detail: `有 ${String(trailing)} 行以空白结尾：将被自动裁掉` })
  }

  const ligatureless = (sourceText.match(/\b(?:c|s|v|n|d)oeur\w*|\b(?:oe|oeu)\w*/giu) ?? []).length
  if (ligatureless > 0) {
    flags.push({
      code: 'ligature-missing',
      severity: 'hint',
      detail: `有 ${String(ligatureless)} 处写作 oe 而非连字 œ：若原文用连字请勿替换，词形查询按精确形处理`,
    })
  }

  for (const paragraph of paragraphs) {
    if (paragraph.text.length > LONG_PARAGRAPH) {
      flags.push({
        code: 'paragraph-too-long',
        severity: 'hint',
        detail: `${paragraph.id} 长 ${String(paragraph.text.length)} 字符：逐句解析会很长，建议先按空行拆分`,
      })
    }
  }

  const lastParagraph = paragraphs[paragraphs.length - 1]
  const lastSentence = lastParagraph?.sentences[lastParagraph.sentences.length - 1]
  if (lastSentence !== undefined && !/[.!?…»]$/u.test(lastSentence.text)) {
    flags.push({ code: 'no-terminal-punctuation', severity: 'hint', detail: '最后一句没有终止标点：可能是被截断的导入' })
  }

  const nbsp = (sourceText.match(/\u00a0/gu) ?? []).length
  if (nbsp > 0) {
    flags.push({ code: 'non-breaking-space', severity: 'hint', detail: `含 ${String(nbsp)} 个不换行空格：属法文排版，保留不改` })
  }

  const doubleSpace = (sourceText.match(/ {2,}/gu) ?? []).length
  if (doubleSpace > 0) {
    flags.push({ code: 'double-space', severity: 'hint', detail: `有 ${String(doubleSpace)} 处连续空格` })
  }

  return {
    title: input.title.trim(),
    characters: sourceText.length,
    paragraphs: paragraphs.length,
    sentences,
    blocks: paragraphs.map((paragraph) => ({
      id: paragraph.id,
      sentences: paragraph.sentences.length,
      excerpt: paragraph.text.length > 120 ? `${paragraph.text.slice(0, 120)}…` : paragraph.text,
      sentenceDetails: paragraph.sentences.map(({ id, text, start, end }) => ({ id, text, start, end })),
    })),
    head: sourceText.slice(0, 200),
    tail: sourceText.length > 200 ? sourceText.slice(-200) : '',
    flags,
  }
}
