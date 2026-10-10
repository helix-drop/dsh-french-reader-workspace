import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  MAX_TITLES_PER_REQUEST,
  conjugationLinksUrl,
  fetchConjugationDataset,
  formNamesFromLinks,
  formTitlesUrl,
} from '../lib/conjugation-fetch.js'
import { conjugationKey, writeConjugationDataset, answerForLemma } from '../lib/conjugation-store.js'

/**
 * The two-request walk, replayed against the pages that were really fetched.
 *
 * The stub fetcher serves the saved conjugation page and synthesises the bulk
 * `titles=` response from the saved form pages — so the walk, its budgeting and its
 * failure handling are exercised without touching the network, while the data going
 * through them is the source's own.
 */
const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/wiktionary/${name}`, import.meta.url)), 'utf8'))

const conjugationPage = fixture('conjugation-page-venir.json')
/**
 * The same table's link set, as JSON — the route the walk really uses.
 *
 * Kept beside the old rendered page so the size difference stays visible: the
 * fixture below is 1.5 KB where the rendered page is 52 KB, and one verb's page
 * (`retrouver`) exceeded this Host's 100 000-character body cap outright.
 */
const conjugationLinks = fixture('conjugation-links-venir.json')
const retrouverLinks = fixture('conjugation-links-retrouver.json')
const linkTitles = (fixtureValue) => fixtureValue.query.pages[0].links.map((link) => link.title)
const formPages = {
  viens: fixture('viens.json').parse.wikitext,
  venons: fixture('venons.json').parse.wikitext,
  viennent: fixture('viennent.json').parse.wikitext,
  parlons: fixture('parlons.json').parse.wikitext,
}

const ok = (content) => ({ statusCode: 200, body: { kind: 'html', content }, truncated: false })
const signal = () => new AbortController().signal

/** A fetcher that answers the conjugation page, then one batch of form pages. */
function stubFetcher({ forms = formPages, conjugation = conjugationLinks, onBatch } = {}) {
  const calls = []
  const fetchPage = async (url) => {
    calls.push(url)
    if (url.includes('action=query&prop=links')) return ok(JSON.stringify(conjugation))
    if (url.includes('action=parse')) return ok(JSON.stringify(conjugation))
    if (onBatch !== undefined) {
      const answer = onBatch(url)
      if (answer !== undefined) return answer
    }
    const titles = decodeURIComponent(/titles=([^&]*)/u.exec(url)[1]).split('|')
    const pages = titles.map((title) => {
      const wikitext = forms[title]
      return wikitext === undefined
        ? { title, missing: true }
        : { title, revisions: [{ slots: { main: { content: wikitext } } }] }
    })
    return ok(JSON.stringify({ query: { pages } }))
  }
  return { calls, fetchPage }
}

const walk = (overrides = {}) => fetchConjugationDataset({
  lemma: 'venir',
  fetchPage: overrides.fetchPage ?? stubFetcher().fetchPage,
  signal: signal(),
  sleep: async () => {},
  spacingMs: 0,
  now: () => '2026-10-07T00:00:00.000Z',
  ...overrides,
})

test('the form list comes from the table’s link set, without rendering it', () => {
  const names = formNamesFromLinks(linkTitles(conjugationLinks), 'venir')
  // The table lists the whole paradigm; these are the ones a reader sees on the card.
  for (const wanted of ['viens', 'venons', 'venaient', 'viendrai', 'vins', 'vinsse', 'vîntes']) {
    assert.equal(names.includes(wanted), true, `${wanted} is discovered`)
  }
  // And the table's own furniture is not a form.
  for (const furniture of ['gérondif', 'infinitif', 'participe', 'mode']) {
    assert.equal(names.includes(furniture), false, `${furniture} is not a form`)
  }
  assert.equal(names.includes('venir'), false, 'the lemma is not one of its own forms')
  assert.equal(names.length > 30, true, 'the walk has a real paradigm to fetch')
})

test('a paradigm costs two requests and yields the known bases', async () => {
  const stub = stubFetcher()
  const outcome = await walk({ fetchPage: stub.fetchPage })
  assert.equal(outcome.requests, 2, 'one request for the table, one for every form page')
  assert.equal(outcome.status, 'partial', 'the stub only has four of the forty-four forms')
  assert.equal(outcome.dataset.lemma, 'venir')
  assert.equal(outcome.dataset.source.kind, 'fr-wiktionary')

  const present = outcome.dataset.tenses.find((tense) => tense.mood === 'ind' && tense.tense === 'pre')
  assert.deepEqual(
    present.bases.map((base) => ({ ipa: base.ipa, persons: base.persons })),
    [
      { ipa: 'vjɛ̃', persons: ['1s', '2s'] },
      { ipa: 'vən', persons: ['1p'] },
      { ipa: 'vjɛn', persons: ['3p'] },
    ],
    'the four fetched forms produce the bases the interface carried',
  )
  // The forms nobody fetched are named rather than assumed.
  assert.equal(outcome.missingForms.includes('viendrai'), true)
  assert.equal(outcome.missingForms.includes('viens'), false, 'a fetched form is not a gap')
  assert.equal(stub.calls[0].includes('Conjugaison%3Afran%C3%A7ais%2Fvenir'), true)
  assert.match(stub.calls[1], /titles=/u)
})

test('a rate limit stops the walk and is not retried', async () => {
  let batches = 0
  const stub = stubFetcher({
    onBatch: () => {
      batches += 1
      return { statusCode: 429, body: { kind: 'text', content: 'too many' }, truncated: false }
    },
  })
  const outcome = await walk({ fetchPage: stub.fetchPage })
  assert.equal(batches, 1, 'one refused batch is not retried in a loop')
  assert.equal(outcome.status, 'rate-limited')
  assert.equal(outcome.dataset, null)
  assert.match(outcome.failure, /限流/u)
  assert.equal(outcome.missingForms.length > 0, true, 'what was not fetched is listed')
})

test('the request budget cuts the walk and says so', async () => {
  const stub = stubFetcher()
  const outcome = await walk({ fetchPage: stub.fetchPage, maxRequests: 1 })
  assert.equal(outcome.requests, 1)
  assert.equal(outcome.status, 'partial')
  assert.equal(outcome.dataset, null, 'nothing was derived from a table-only walk')
  assert.equal(outcome.notes.some((note) => /请求上限/u.test(note)), true)
  assert.equal(outcome.missingForms.length > 30, true)
})

test('a table that lists no form is its own outcome, not an empty paradigm', async () => {
  // Links, but none of them a form: the table's furniture only.
  const stub = stubFetcher({
    conjugation: {
      query: {
        pages: [{
          title: 'Conjugaison:français/x',
          links: ['gérondif', 'infinitif', 'participe', 'mode'].map((title) => ({ ns: 0, title })),
        }],
      },
    },
  })
  const outcome = await walk({ fetchPage: stub.fetchPage })
  assert.equal(outcome.status, 'no-forms')
  assert.equal(outcome.dataset, null)
  assert.equal(outcome.requests, 1)
  assert.equal(outcome.notes.some((note) => /未找到形式链接/u.test(note)), true)
})

test('a link list that cannot be fetched fails without inventing anything', async () => {
  const outcome = await walk({
    fetchPage: async () => ({ statusCode: 500, body: { kind: 'text', content: '' }, truncated: false }),
  })
  assert.equal(outcome.status, 'failed')
  assert.equal(outcome.dataset, null)
  assert.match(outcome.notes[0], /形式清单/u)
})

test('a missing form page is a gap, and a form of another verb is skipped', async () => {
  const stub = stubFetcher({
    forms: { venons: formPages.venons, parlons: formPages.parlons, viens: formPages.viens },
  })
  const outcome = await walk({ fetchPage: stub.fetchPage })
  const present = outcome.dataset.tenses.find((tense) => tense.mood === 'ind' && tense.tense === 'pre')
  // One spelling can fill two persons (`viens` is both 1s and 2s), so the comparison
  // is by cell rather than by word.
  assert.deepEqual(
    present.forms.map((form) => `${form.person}:${form.written}`).sort(),
    ['1p:venons', '1s:viens', '2s:viens'],
  )
  // `parlons` was linked from the table but declares `parler`, so it is not a form of
  // venir — it is skipped rather than becoming a wrong cell.
  assert.equal(outcome.dataset.tenses.some((tense) => tense.forms.some((form) => form.written === 'parlons')), false)
})

test('the walk stores what it derived, and the card reads it back', async () => {
  const records = new Map()
  const table = {
    get: (key) => records.get(key),
    entries: () => [...records.entries()],
    get size() { return records.size },
    async put(key, value) { records.set(key, value) },
    async delete(key) { return records.delete(key) },
    async update(key, fn) { const next = fn(records.get(key)); records.set(key, next); return next },
  }
  const outcome = await walk()
  await writeConjugationDataset(table, {
    lemma: 'venir',
    dataset: outcome.dataset,
    source: 'fr-wiktionary',
    sourceVersion: 'api',
    fetchStatus: outcome.status === 'ok' ? 'ok' : 'partial',
    failure: outcome.failure,
    missingForms: outcome.missingForms,
  })
  const answer = answerForLemma(table, 'venir')
  assert.equal(answer.kind, 'dataset')
  assert.equal(answer.record.fetchStatus, 'partial')
  assert.equal(answer.record.missingForms.includes('viendrai'), true)
  assert.equal(records.has(conjugationKey('venir')), true)
})

test('the request URLs stay inside the declared endpoint and respect the title limit', () => {
  assert.match(conjugationLinksUrl('venir'), /^https:\/\/fr\.wiktionary\.org\/w\/api\.php\?/u)
  assert.match(conjugationLinksUrl('venir'), /action=query&prop=links/u)
  assert.match(conjugationLinksUrl("avoir été"), /titles=Conjugaison%3Afran%C3%A7ais%2Favoir%20%C3%A9t%C3%A9/u)
  // A paged list keeps its own cursor, so a big paradigm costs a second request
  // rather than a silently shorter one.
  assert.match(conjugationLinksUrl('venir', 'plcontinue-token'), /plcontinue=plcontinue-token/u)
  assert.equal(conjugationLinksUrl('venir', null).includes('plcontinue'), false)
  const many = Array.from({ length: MAX_TITLES_PER_REQUEST }, (_, index) => `form${String(index)}`)
  assert.match(formTitlesUrl(many), /titles=form0%7Cform1/u)
  assert.equal(MAX_TITLES_PER_REQUEST, 50, 'the API limit this walk batches against')
})

test('a failed re-fetch keeps the dataset an earlier fetch proved', async () => {
  // First the walk succeeds and stores real data; then the network dies. The
  // refresh records its own failure, but the proved dataset must survive it.
  const { createBacking, openController } = await import('./support/harness.mjs')
  const { FRENCH_READER_DOMAIN } = await import('../lib/domain.js')
  const stub = stubFetcher()
  let fail = false
  const web = {
    fetch: ({ url }) => fail
      ? Promise.resolve({ statusCode: 500, body: { kind: 'text', content: '' }, truncated: false })
      : stub.fetchPage(url),
  }
  const { controller } = await openController(createBacking(), FRENCH_READER_DOMAIN, { services: { web } })

  const first = await controller.fetchConjugation({ lemma: 'venir' }, signal())
  assert.equal(first.status, 'partial', 'the stub serves four of the forms')
  assert.equal(first.bases > 0, true)

  fail = true
  const second = await controller.fetchConjugation({ lemma: 'venir' }, signal())
  assert.equal(second.status, 'failed')
  assert.equal(second.bases, 0, 'the failed run itself derived nothing')

  const read = controller.readConjugation({ lemma: 'venir' }, signal())
  assert.equal(read.state, 'dataset', 'the proved data is still what the card reads')
  assert.equal(read.tenses.length > 0, true)
  assert.equal(read.fetchStatus, 'failed', 'the failed refresh is still recorded as failed')
})

/**
 * The regression this route exists for.
 *
 * This Host caps a fetched body at `maxBodyChars` (100 000 by default) and marks
 * anything longer `truncated`; `conjugation-source.ts` refuses a truncated body,
 * which is correct — but the rendered conjugation table for `retrouver` is
 * 105 797 characters of HTML (15 537 of them text), so **every** fetch of it came
 * back truncated and the walk failed before it read a single form. Measured
 * against the live source at the time of the fix:
 *
 * | route                                   | payload      |
 * | ---                                     | ---          |
 * | `action=parse&prop=text` (old)          | 106–116 KB   |
 * | `action=query&prop=links` (now)         | 1.3–1.5 KB   |
 *
 * So this test pins the property, not the plumbing: on the very verb that failed,
 * the walk must reach the form pages. A stub that answers the old rendered-table
 * route is not enough — the walk never asks for it.
 */
test('a verb whose rendered table exceeded the Host body cap still yields a paradigm', async () => {
  const stub = stubFetcher({ conjugation: retrouverLinks })
  const outcome = await fetchConjugationDataset({
    lemma: 'retrouver',
    fetchPage: stub.fetchPage,
    signal: signal(),
    sleep: async () => {},
    spacingMs: 0,
    now: () => '2026-10-10T00:00:00.000Z',
  })

  // The whole point: the walk runs at all. Before the fix the only request it made
  // came back truncated and the paradigm never started.
  // The stub's own form pages are `venir`'s, so nothing derives — but the walk got
  // as far as asking, which is exactly what used to be impossible.
  assert.notEqual(outcome.status, 'failed', 'the first request is not refused')
  assert.equal(outcome.requests >= 2, true, 'the walk reached the form-page phase')
  assert.equal(outcome.missingForms.length > 30, true, 'the discovered paradigm was carried that far')
  assert.equal(stub.calls.some((url) => url.includes('action=parse&prop=text')), false,
    'the rendered table — the response that exceeded the Host cap — is never requested')
  assert.equal(stub.calls[0].includes('action=query&prop=links'), true,
    'the walk starts from the link set')

  // And the names it discovered are the source's own, accents included: that is what
  // the second phase needs to ask for `retrouvé` / `retrouvant` at all.
  const discovered = formNamesFromLinks(linkTitles(retrouverLinks), 'retrouver')
  for (const name of ['retrouvé', 'retrouvant', 'retrouvassions', 'retrouvèrent']) {
    assert.equal(discovered.includes(name), true, `${name} is discovered from the link set`)
  }
  assert.equal(outcome.missingForms.includes('retrouvé'), true,
    'the stub owns no retrouvé page, so it is named as a gap rather than invented')
})

/**
 * The counter-case, which the old code could not express: a truncated *first*
 * response is a refusal, never a shorter paradigm.
 */
test('a truncated link list refuses instead of deriving from half a table', async () => {
  const outcome = await fetchConjugationDataset({
    lemma: 'retrouver',
    fetchPage: async (url) => (url.includes('action=query&prop=links')
      ? { statusCode: 200, body: { kind: 'text', content: JSON.stringify(retrouverLinks) }, truncated: true }
      : ok(JSON.stringify({ query: { pages: [] } }))),
    signal: signal(),
    sleep: async () => {},
    spacingMs: 0,
    now: () => '2026-10-10T00:00:00.000Z',
  })
  assert.equal(outcome.status, 'failed')
  assert.equal(outcome.dataset, null)
  assert.match(outcome.failure, /截断/u)
  assert.equal(outcome.missingForms.length, 0, 'nothing is named as a gap when nothing was read')
})

/**
 * The size property itself, over every verb fixture we hold: the first request must
 * stay well inside the Host's cap with room for a longer paradigm than the ones
 * measured. This is what would have caught the original defect at review time.
 */
test('the first request of a walk stays far inside the Host body cap', () => {
  const HOST_BODY_CAP = 100_000
  for (const [name, value] of [['venir', conjugationLinks], ['retrouver', retrouverLinks]]) {
    const body = JSON.stringify(value)
    assert.equal(body.length < HOST_BODY_CAP / 10, true,
      `${name}: ${String(body.length)} chars must sit an order of magnitude under the cap`)
  }
})
