# Test fixtures

## `lexique-verbs.tsv`

A 340-row excerpt of **Lexique 3.83** (`http://www.lexique.org/databases/Lexique383/Lexique383.tsv`,
27 MB, downloaded 2026-10-07 from this machine), keeping only the verb rows of ten
lemmas: `parler`, `venir`, `prendre`, `finir`, `tracer`, `écarter`, `ouvrir`,
`connaître`, `être`, `avoir`.

- Columns used: `ortho`, `phon`, `lemme`, `cgram`, `infover` (the header row is
  kept verbatim so the excerpt stays readable without this note).
- **Why it is committed at all:** the derivation in `src/conjugation-data.ts` is
  only meaningful against real pronunciation data. The assertions in
  `test/conjugation-data.test.mjs` compare against this data rather than against
  expectations the code also produced.
- **Licence:** Lexique 3.83 is published under CC BY-SA 4.0 by its authors
  (New, B., Pallier, C., Brysbaert, M. & Ferrand, L.). The excerpt is used here as
  test evidence with attribution; the runtime path fetches the distribution from the
  publisher instead of bundling it.
- **Not a runtime asset.** Nothing in `lib/` reads this file.
