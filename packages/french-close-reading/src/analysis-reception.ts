/** Model transport normalization. It never invents words or resolves a tie by proximity. */
export const ANALYSIS_PROTOCOL_VERSION = 2
export interface SourceToken { id: number; start: number; end: number; text: string }
export function sourceTokens(text: string): SourceToken[] {
  // Elisions, hyphens and punctuation have their own anchors; offsets are always
  // computed from the original JS string, including surrogate pairs.
  return [...text.matchAll(/[\p{L}\p{M}\p{N}]+|[^\s]/gu)].map((match, index) => ({
    id: index + 1, start: match.index!, end: match.index! + match[0].length, text: match[0],
  }))
}
export interface ReceptionIssue { kind: 'clause' | 'constituent' | 'explanation'; index: number; role: string; text: string; reason: string }
export interface Reception {
  protocolVersion: number; state: 'complete' | 'partial'; issues: ReceptionIssue[];
  recoveredRanges: number; tokenRanges: number; receivedClauses: number; receivedConstituents: number
}
type Row = Record<string, unknown>
const record = (value: unknown): Row => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(record) : []
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)
const normalize = (s: string): string => s.replace(/\s*['’]\s*/gu, "'").replace(/\s+/gu, ' ').trim()
interface Range { start: number; end: number; text: string }
export function normalizeAnalysisReply(json: Row, text: string): { json: Row; reception: Reception } {
  const tokens = sourceTokens(text)
  const rawClauses = rows(json.clauses), rawParts = rows(json.constituents)
  const reception: Reception = { protocolVersion: ANALYSIS_PROTOCOL_VERSION, state: 'complete', issues: [], recoveredRanges: 0, tokenRanges: 0, receivedClauses: rawClauses.length, receivedConstituents: rawParts.length }
  const issue = (kind: ReceptionIssue['kind'], index: number, row: Row, reason: string): void => {
    reception.issues.push({ kind, index, role: typeof row.role === 'string' ? row.role : '', text: typeof row.text === 'string' ? row.text : '', reason })
  }
  const rangeOf = (row: Row, scope?: Range): Range | null => {
    const quote = typeof row.text === 'string' ? row.text : ''
    const within = (r: Range): boolean => scope === undefined || (r.start >= scope.start && r.end <= scope.end)
    const range = (start: number, end: number): Range => ({ start, end, text: text.slice(start, end) })
    // A quote cross-check prevents a valid but wrong anchor from silently moving highlights.
    if (integer(row.startToken) && integer(row.endToken) && row.startToken >= 1 && row.endToken >= row.startToken && row.endToken <= tokens.length) {
      const r = range(tokens[row.startToken - 1]!.start, tokens[row.endToken - 1]!.end)
      if (within(r) && quote !== '' && normalize(r.text) === normalize(quote)) { reception.tokenRanges++; return r }
    }
    if (integer(row.start) && integer(row.end) && row.start >= 0 && row.end > row.start && row.end <= text.length) {
      const r = range(row.start, row.end)
      if (within(r) && (quote === '' || r.text === quote)) return r
    }
    if (quote.trim() === '') return null
    const escaped = quote.trim().replace(/\s*['’]\s*/gu, "'").replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\s+/gu, '\\s+').replace(/['’]/gu, "\\s*['’]\\s*")
    const candidates = [...text.matchAll(new RegExp(escaped, 'gu'))].map(m => range(m.index!, m.index! + m[0].length))
      .filter(r => within(r)
        && (!/^[\p{L}\p{M}\p{N}]/u.test(r.text) || !/[\p{L}\p{M}\p{N}]$/u.test(text.slice(0, r.start)))
        && (!/[\p{L}\p{M}\p{N}]$/u.test(r.text) || !/^[\p{L}\p{M}\p{N}]/u.test(text.slice(r.end))))
    // Explicit occurrence is one-based within the referenced clause, or sentence.
    const selected = integer(row.occurrence) && row.occurrence >= 1 ? candidates[row.occurrence - 1]
      : candidates.length === 1 ? candidates[0] : undefined
    if (selected) { reception.recoveredRanges++; return selected }
    return null
  }
  const ids = new Map<string, number>(), duplicates = new Set<string>()
  rawClauses.forEach((row, index) => { if (typeof row.id === 'string') { if (ids.has(row.id)) duplicates.add(row.id); ids.set(row.id, index) } })
  const ref = (row: Row, idKey: string, indexKey: string): number | null | undefined => {
    if (row[idKey] !== undefined && row[idKey] !== null) {
      const id = row[idKey]
      return typeof id === 'string' && !duplicates.has(id) ? ids.get(id) : undefined
    }
    const index = row[indexKey]
    return index === null || index === undefined ? null : integer(index) && index >= 0 && index < rawClauses.length ? index : undefined
  }
  const located = rawClauses.map(row => rangeOf(row))
  const parents = rawClauses.map(row => ref(row, 'parentId', 'parentIndex'))
  const bad = new Set<number>()
  rawClauses.forEach((row, i) => {
    if (!located[i]) { bad.add(i); issue('clause', i, row, '原文片段无法唯一定位') }
    if (parents[i] === undefined || (typeof row.id === 'string' && duplicates.has(row.id))) { bad.add(i); issue('clause', i, row, '引用不存在的从句下标或重复标识') }
    const seen = new Set<number>(); let cursor: number | null | undefined = i
    while (cursor !== null && cursor !== undefined) {
      if (seen.has(cursor)) { bad.add(i); issue('clause', i, row, '父从句链形成循环'); break }
      seen.add(cursor); cursor = parents[cursor]
    }
  })
  // Descendants of unusable nodes are also unresolved; they are never promoted to roots.
  let changed = true
  while (changed) { changed = false; parents.forEach((p, i) => { if (p !== null && p !== undefined && bad.has(p) && !bad.has(i)) { bad.add(i); issue('clause', i, rawClauses[i]!, '父从句尚未确认'); changed = true } }) }
  const remap = new Map<number, number>()
  const clauses: Row[] = []
  rawClauses.forEach((row, i) => { if (!bad.has(i)) { remap.set(i, clauses.length); clauses.push({ ...row, ...located[i]!, parentIndex: null }) } })
  rawClauses.forEach((_, i) => { const target = remap.get(i), p = parents[i]; if (target !== undefined) clauses[target]!.parentIndex = p === null || p === undefined ? null : remap.get(p) })
  const constituents: Row[] = []
  rawParts.forEach((row, i) => {
    const owner = ref(row, 'clauseId', 'clauseIndex')
    if (owner === undefined || (owner !== null && bad.has(owner))) { issue('constituent', i, row, '所属从句尚未确认或引用不存在的从句下标'); return }
    const r = rangeOf(row, owner === null ? undefined : located[owner] ?? undefined)
    if (!r) { issue('constituent', i, row, '原文片段无法唯一定位或超出所属从句'); return }
    constituents.push({ ...row, ...r, clauseIndex: owner === null ? null : remap.get(owner) })
  })
  const explanations = rows(json.explanations).map((row, i) => {
    if (row.start === undefined && row.end === undefined || row.start === null && row.end === null) return { ...row, start: null, end: null }
    if (integer(row.start) && integer(row.end) && row.start >= 0 && row.end > row.start && row.end <= text.length) return row
    issue('explanation', i, row, '解释位置无效，已保留说明并取消原文定位')
    return { ...row, start: null, end: null }
  })
  if (reception.issues.length || !clauses.length || !constituents.length) reception.state = 'partial'
  return { json: { ...json, clauses, constituents, explanations }, reception }
}

/** Balanced object scanner: braces inside strings and appended grammar blocks are separate. */
export function extractAnalysisObject(reply: string): Row | null {
  let fallback: Row | null = null
  for (let start = 0; start < reply.length; start++) {
    if (reply[start] !== '{') continue
    let depth = 0, quoted = false, escaped = false
    for (let end = start; end < reply.length; end++) {
      const c = reply[end]!
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue }
      if (c === '"') quoted = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        try { const value = record(JSON.parse(reply.slice(start, end + 1))); if (typeof value.translation === 'string') return value; fallback ??= value } catch { /* Keep searching for a complete analysis object. */ }
        start = end; break
      }
    }
  }
  return fallback
}
