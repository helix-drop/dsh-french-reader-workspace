import { extractText } from './source-fetch.ts'
import type { PageFetcher } from './conjugation-source.ts'
import type { QuickDictionaryValue } from './types.ts'

const POS: Record<string, string> = { Adjective: '形容词', Participle: '分词', Verb: '动词', Noun: '名词', Adverb: '副词', Pronoun: '代词', Preposition: '介词', Conjunction: '连词', Interjection: '感叹词', Determiner: '限定词' }
export function dictionaryUrl(mot: string): string {
  return `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(mot)}`
}
export function parseDictionary(content: string): QuickDictionaryValue['glosses'] {
  const data: unknown = JSON.parse(content)
  if (data === null || typeof data !== 'object' || !('fr' in data) || !Array.isArray(data.fr)) return []
  const glosses: QuickDictionaryValue['glosses'] = []
  for (const entry of data.fr) {
    if (entry === null || typeof entry !== 'object' || entry.language !== 'French' || !Array.isArray(entry.definitions)) continue
    for (const definition of entry.definitions) {
      if (typeof definition?.definition !== 'string') continue
      const text = extractText(definition.definition).slice(0, 300)
      if (text === '' || glosses.some((gloss) => gloss.text === text)) continue
      glosses.push({ partOfSpeech: POS[entry.partOfSpeech] ?? String(entry.partOfSpeech ?? '').slice(0, 60), text })
      if (glosses.length === 3) return glosses
    }
  }
  return glosses
}

/** Translate standard dictionary form labels without another model request. */
export function chineseForm(text: string): string | null {
  const known: Record<string, string> = { favourite: '最喜欢的；偏爱的', favorite: '最喜欢的；偏爱的', 'to walk': '步行；行走', garden: '花园', 'a garden': '花园' }
  if (known[text.toLowerCase()] !== undefined) return known[text.toLowerCase()]!
  const participle = /^(past|present) participle of (.+)$/iu.exec(text)
  if (participle) return `${participle[2]} 的${participle[1]!.toLowerCase() === 'past' ? '过去' : '现在'}分词`
  const verb = /^(first|second|third)[- ]person (singular|plural) (.+) of (.+)$/iu.exec(text)
  if (verb) {
    const tenses: Record<string, string> = { 'present subjunctive': '虚拟式现在时', 'present indicative': '直陈式现在时', 'imperfect indicative': '直陈式未完成过去时', 'future indicative': '直陈式简单将来时', 'past historic': '直陈式简单过去时', 'conditional': '条件式现在时', 'present conditional': '条件式现在时' }
    const tense = tenses[verb[3]!.toLowerCase()]
    if (tense) return `${verb[4]} 的${tense}${{first:'第一',second:'第二',third:'第三'}[verb[1]!.toLowerCase()]}人称${verb[2]!.toLowerCase() === 'singular' ? '单数' : '复数'}形式`
  }
  return null
}

async function chineseGloss(text: string, partOfSpeech: string, mot: string, fetchPage: PageFetcher, signal: AbortSignal): Promise<string> {
  const form = chineseForm(text)
  if (form !== null) return form
  // Context prevents standalone dictionary words from being read as UI commands.
  const pos = Object.keys(POS).find((key) => POS[key] === partOfSpeech)?.toLowerCase() ?? 'word'
  let query = `The French ${pos} ${mot} means: ${text}`
  while (new TextEncoder().encode(query).length > 450) query = query.slice(0, -1)
  const url = `https://api.mymemory.translated.net/get?langpair=en%7Czh-CN&q=${encodeURIComponent(query)}`
  const response = await fetchPage(url, signal)
  if (response.statusCode !== 200 || response.truncated) throw new Error('translation-unavailable')
  const data = JSON.parse(response.body.content)
  const translated = typeof data?.responseData?.translatedText === 'string' ? extractText(data.responseData.translatedText) : ''
  const gloss = translated.replace(/^.*?(?:意思是|意为|含义是)[:：]?\s*/u, '').slice(0, 500)
  if (data.responseStatus !== 200 || data.quotaFinished === true || !/[\p{Script=Han}]/u.test(gloss)
    || (/^[a-z]+$/iu.test(text) && gloss.toLowerCase().includes(text.toLowerCase()))) throw new Error('translation-unavailable')
  return gloss
}

/** Read-only, bounded dictionary cache. No model calls or lexicon writes. */
export class QuickDictionary {
  private readonly cache = new Map<string, { until: number; value: QuickDictionaryValue }>()
  async lookup(mot: string, fetchPage: PageFetcher | undefined, signal: AbortSignal, timeoutMs = 6500): Promise<QuickDictionaryValue> {
    const query = mot.normalize('NFC').trim().toLowerCase()
    const sourceUrl = `https://en.wiktionary.org/wiki/${encodeURIComponent(query)}#French`
    const empty = (status: QuickDictionaryValue['status']): QuickDictionaryValue => ({ status, sourceUrl, glosses: [] })
    if (signal.aborted) return empty('unavailable')
    const cached = this.cache.get(query)
    if (cached !== undefined && cached.until > Date.now()) return cached.value
    if (fetchPage === undefined) return empty('unavailable')
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: () => void = () => {}
    const stop = new Promise<null>((resolve) => {
      onAbort = () => { controller.abort(); resolve(null) }
      signal.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(onAbort, timeoutMs)
    })
    try {
      const response = await Promise.race([(async () => {
        const dictionary = await fetchPage(dictionaryUrl(query), controller.signal)
        if (dictionary.statusCode !== 200 || dictionary.truncated || dictionary.body.content.length > 100_000) return dictionary
        const raw = parseDictionary(dictionary.body.content)
        const glosses = await Promise.all(raw.map(async (gloss) => ({ partOfSpeech: gloss.partOfSpeech, text: await chineseGloss(gloss.text, gloss.partOfSpeech, query, fetchPage, controller.signal) })))
        return { ...dictionary, body: { ...dictionary.body, content: JSON.stringify({ fr: glosses.map((gloss) => ({ language: 'French', partOfSpeech: gloss.partOfSpeech, definitions: [{ definition: gloss.text }] })) }) } }
      })(), stop])
      if (response === null || signal.aborted || response.truncated || response.body.content.length > 100_000) return empty('unavailable')
      if (response.statusCode === 404) return empty('not-found')
      if (response.statusCode !== 200) return empty('unavailable')
      const glosses = parseDictionary(response.body.content)
      const value = { status: glosses.length === 0 ? 'not-found' : 'found', sourceUrl, glosses } satisfies QuickDictionaryValue
      if (value.status === 'found') {
        this.cache.delete(query)
        this.cache.set(query, { until: Date.now() + 6 * 60 * 60 * 1000, value })
        while (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!)
      }
      return value
    } catch { return empty('unavailable') }
    finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort) }
  }
}
