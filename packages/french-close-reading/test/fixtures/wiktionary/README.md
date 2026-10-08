# Wiktionary fixtures

Real API responses, fetched 2026-10-07 from this machine:

```
curl -sS "https://fr.wiktionary.org/w/api.php?action=parse&page=<form>&prop=wikitext&format=json&formatversion=2"
```

One file per French verb form: `venons`, `viens`, `viennent`, `parlons`, `parlent`,
`finissent`, `finissons`, `parlerons`. Each is 0.5–2 KB of the API's JSON, kept
verbatim so `test/conjugation-source.test.mjs` parses what the source actually
returned rather than a transcript of it.

- **What they are used for:** the pronunciation (`{{pron|və.nɔ̃|fr}}`), the spelling
  (`'''venons'''`), the lemma and the inflection slots
  (`{{fr-verbe-flexion|grp=3|venir|ind.p.1p=oui|imp.p.1p=oui}}`).
- **Licence:** Wiktionary content is CC BY-SA 4.0; the attribution belongs to the
  Wiktionary contributors. These files are test evidence, not runtime assets —
  nothing in `lib/` reads them, and the runtime path fetches from the API.
- **Rate limits are real.** A burst of ten requests provoked
  `429 You are making too many requests to the API`, which is why
  `src/conjugation-source.ts` spaces requests, treats 429 as its own outcome, and
  never retries in a loop.
