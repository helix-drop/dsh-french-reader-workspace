# Verification log

Evidence for the four gates in the review plan. Each entry states what was run,
where, and what was actually observed — never "registered successfully" as a
substitute for "the user can use it".

## G0 · Minimal DSH integration

| Item | Status | Evidence |
|---|---|---|
| Exact runtime + matching contracts | verified | Installed artifacts read from `app.asar`: `@deepseek-ai/dsh-client-modules`, `dsh-typert-registry/lib/client.js`, `dsh-api-gateway/lib/client.js`, `dsh-storage-json/lib/index.js`, the shell's static module table (`rM()` in the web frontend bundle). |
| Independent Host/Client entries | verified | Host row activates (`french_reader` tool registered in a live session); Client bundle activates (app boots with the bundle enabled, no crash report). |
| New reading panel | pending user check | Panel registration matches the installed slot declarations (`main` = `kind: 'keyed'`, `sidebar.panellist` = `kind: 'list'`). |
| Client calls Host, save + read | verified | Live `save`/`read`/`list`/`translate`/`branch`/`analysis`/`archive` calls against the running Host. |
| Still present after refresh | verified | Records reload from `~/.dsh/storages/french_reader`; the library listed passages written before a Host restart. |
| Clean unload, no leftover registration | partial | Unload path disposes the UI fiber and the Remote mount; the storage domain closes through `ctx.effect`. Not yet exercised end to end. |
| No core modification, no replacement server | verified | Only the plugin package and the profile's own bundle/patch files were touched. |

### Failures found live (and fixed)

Fourth live failure (2026-10-06 19:14, round with the revision feature): after
`revise`, six branches and two translations written *before* spans existed still
reported `resolved` while pointing at different text — their positional id still
existed in the new segmentation, so `p1.s1` silently named the newly prepended
sentence. Fixed twice over:

1. a span-less record is only trusted while `sourceRevision === 1`; after any
   revision it reports `unresolved` with `anchorReason: 'legacy-stale'` instead of
   a silent `resolved`;
2. the `backfill` action derives spans from a **named** revision the caller
   supplies, so the migration is evidence-backed: migrated records then relocate
   normally, and anchors missing from that revision are reported, never invented.

Relocation also keeps the author's granularity: a paragraph note relocates to a
paragraph, never silently to a sentence inside it.

Verified live after the next restart (2026-10-06 19:17): `backfill
{sourceRevision: 1}` migrated exactly 8 records, and the reading then reported
those 8 as `relocated`/`moved` (their text moved into paragraph 2) while the two
notes written against the current revision stayed `resolved`/`span`. A later
`answer` committed one answer with two intents (a grammar branch and a variant),
both `applied`, and `resume` returned 0 pending.


1. `web boot: 1 entry did not activate … missed the module table` — a client half
   declared its own `/remote` subpath in `dsh.client.external`. Fixed by inlining
   the contribution; regression test asserts the baseline-only require set.
2. `per-record key '<uuid>#segments' is not path-safe` — the JSON backend uses each
   key as a file name (`SAFE_KEY_RE = /^[a-zA-Z0-9_-]+$/`). Keys are now
   `segments_<uuid>` / `analysis_<uuid>`.
3. `web boot: 1 entry did not activate … failed` — the client registry requires
   every strict codec to carry a `create()` factory
   (`validateCodec` in `dsh-typert-registry/lib/client.js`). The contribution now
   ships dependency-free validators with the zod surface, because the browser's
   static module table has no zod.

## G1 · Data and failure recovery

| Item | Status | Evidence |
|---|---|---|
| Source/segmentation revisions kept apart | implemented, verified locally | `reviseSource` writes an immutable `source_<id>_<rev>` row first and flips the catalogue pointer afterwards; segmentation is keyed per source revision; a never-revised passage has no history row because its current text *is* revision 1, and the first correction backfills the revision it replaces. |
| Anchors never silently re-attached | verified | Every note stores the span of one revision (`anchorId`, revisions, offsets, excerpt). On read: the span still carries the excerpt → `resolved` (or `relocated` when only the label moved); the excerpt moved and occurs exactly once → `relocated` with `currentAnchorId`; ambiguous or gone → `unresolved` with the original anchor kept. Legacy records without a span fall back to id resolution. |
| Live data survives the schema change | verified locally | A test loads the exact record shapes the running Host already wrote (no span, literal revisions, legacy segmentation key) through the real storage domain and asserts they still resolve. |
| Operation dedupe | verified | Identical retries collapse: `createPassage`, `saveTranslation`, `addBranch`, `archivePassage`, `commitRun`, and deterministic ids in the tool. |
| Answer commit + knowledge accumulation recovery | implemented, verified locally | One `runs_<passageId>` record holds the answer **and** every intended write. Intents apply one by one, each persisted as it completes; a crash leaves the answer readable, finished writes valid, the rest pending, and `resumeRuns` finishes only those. Covered by a fault-injection test that rewinds a run and deletes one write. Not yet live-verified (needs a Host restart). |
| Answer/source revision separation | not started | Needs multi-revision sources. |

## G2 · Vocabulary (started)

| Rule from the plan | Implementation | Evidence |
|---|---|---|
| Look up the exact Mot before anything else | `lookupMot` reads the derived index and the stored entries; a hit returns them unchanged | A hit reports `generated: false`; a second create returns the stored entry |
| No model call, no network on a hit | The lookup path touches only the storage domain | Tool-level test with no I/O service in scope |
| A lemma match is a candidate, not a hit | Index links carry `exact` or `form`; only `exact` fills `entries` | `ouvrait` → `found: false` + the `ouvrir` entry as candidate |
| Inflected forms never merged silently | The entry lists the forms it claims; the exact form the reader looked up is what is stored | Same test, plus lookup of `ouvrir` itself is a hit with no candidates |
| Homographs and multiple parts of speech stay distinct | One entry per hash of `motKey + partOfSpeech` | Two `que` entries (relative pronoun, conjunction) returned side by side |
| A context note never rewrites the entry | Occurrences are a separate list on the entry | Appending leaves `senses` untouched; repeated operationId is idempotent |
| Duplicate check before write | The record key is the hash, so a second create reports `exists` instead of inserting | Duplicate and three-way concurrent creates leave one entry |
| Derived index, not a second truth | `lexicon_index` is rebuildable; entries are authoritative | Dropping the index and rebuilding reports `repaired: 2` |

Accented and apostrophised forms (`cœur`, `l'être`) are storable because the
record key is a hash: a path-safe key is still required by the JSON backend.

Not yet implemented: the §1–§7 content policy, CNRTL fetching with per-section
source truthfulness, and graded grammar accumulation.

## G2 · Translation variants (started)

| Rule from the plan | Implementation | Evidence |
|---|---|---|
| Multiple translations are formal data | Every `saveTranslation` appends a variant carrying `source` (`ai`/`user`) and a comparison `note` | Two variants on one anchor coexist and stay distinguishable |
| Adopting is a pointer, not an overwrite | Adoption lives in its own `adoptions_<passageId>` record: one atomic write per adoption, all variants kept | Switching variants keeps both, and records what it replaced |
| The overall translation is never rewritten silently | Reconciliation is derived on read: an adoption remembers the overall translation that was current when it happened, and the report names it plus what each sentence said before | The overall row is byte-identical after an adoption; the report lists the changed sentence with previous/current text |
| Reconciliation by identity, not clock | Adoption stores `staleOverallId`; the report compares ids | Two writes inside the same millisecond still order correctly (a timestamp rule failed this) |
| Writing a new overall translation coordinates again | A new passage-level variant becomes the current overall, so earlier adoptions no longer match it | Report flips back to `needed: false`, and returns when a sentence changes again |

## G2 · Vocabulary output policy and source truthfulness

The plan's section order, formats and honesty rules are a pure policy module, not
a prompt the model improvises: the same object decides what is rendered and what
is validated.

| Rule from the plan | Implementation | Evidence |
|---|---|---|
| Section order per type | `sectionOrder`: verbe §1 §2 §4 §3 §6 §7 (with §5), nom/adjectif and locutions likewise, pronouns and the unclassified floor get §1 §2 §6 §7 | Asserted per type; §3 appears for a pronoun only when asked |
| §5 only for its types, before §6 | Only verbe/nom/adjectif/locution/idiome carry it | An adverb, conjunction and numeral never receive it |
| §2 is an ordered list with examples, never a table | `renderCard` numbers the senses and appends `— 例：…` | Rendered text asserted; no `|` in §2 |
| §3b is an unordered list with ｜ | Rendered as `｜item` lines | Asserted |
| §1 is the overview | Form, lemma, part of speech | Asserted |
| No fabrication to fill sections | A required section that is empty is an **error**; saying「未发现可靠关联」counts as content | Two empty sections → two named errors; an explicit statement passes |
| Frequency and register are not invented | They live in §1 and must be stated or declared unknown | Covered by the empty-section rule |
| Success is not an HTTP 200 | `judgeSource` checks http status, entry found, usable body, truncation and parse failure separately | The measured CNRTL case (200 + `Portail lexical`) is `body-missing` |
| A source supports only its own section | `toSourceRecord` stores the section and the truthful `ok` flag; a failed fetch is recorded with its reason | Asserted for all four failure modes |
| Fallback is stated, not hidden | The note says the card falls back instead of claiming live data | Asserted |

A real defect the tests caught: `/verb/` matched "ad**verb**e", so an adverb was
routed as a verb and would have received a conjugation section. Classification is
now anchored and the adverb is asserted to stay unclassified.

## G2 · Grammar accumulation — verified live (2026-10-06 19:26, Host restarted)

One `answer` carried two grammar intents: two entries were created, each with its
own topic, level, module and wording, both `mastery: learning` and
`contentStatus: ai-unverified`, and the pitfall landed only on the intended entry.

Counting, measured on the running Host:

| Action | Observed |
|---|---|
| Same question committed twice (identical run) | the untouched topic stayed at `askCount 1`, the repeated one never incremented from the retry |
| A genuinely new question on the same sentence | that entry went to `askCount 2`, `examples 2`, `lastAskedAt` updated, `pitfalls` not duplicated |
| Whitelist | `keyPoints`, `level`, `module`, `mastery`, `contentStatus` all unchanged by the automatic path |

Ambiguity and decision, measured on the same Host:

| Action | Observed |
|---|---|
| A topic near-matching two entries | a pending candidate was recorded with exactly those two candidates; **no entry created or modified** |
| `resolve attach` naming one entry plus new wording | the chosen entry gained the question and example, its `keyPoints` became the supplied wording, `contentStatus` turned `mixed`, and `mastery`/`level`/`module` stayed put |
| The other candidate | `askCount 1`, `examples 1`, unchanged wording |
| The decision itself | the candidate row now carries `resolution: attached` and `resolvedEntryId`, so it is auditable rather than deleted |

Export/import stays locally verified: the `export` action returns the whole
library inline, which is the wrong channel for a live check in this session — the
panel export is where that belongs.

## G2 · Vocabulary card in the panel

| Requirement | Implementation | Evidence |
|---|---|---|
| The policy is what the reader sees | `renderLexicon` returns the policy-rendered card and the policy's own verdict | A fresh verb card lists §1 §2 §4 §3a §3b §5 §6 §7 |
| Gaps are visible, not tidied away | Missing required sections are errors and appear in the text as `（待补：该章节为空）` | Two errors on a fresh card; zero after both sections are written |
| The panel does not invent completeness | The card shows errors and hints under the rendered text | Asserted through the Remote projection |
| A missing entry is an answer, not a crash | `{ kind: 'missing' }` | Asserted, and a malformed id is a bad request |
| §3 is available on request | The panel offers both "open card" and "with etymology" | `wantsEtymology` is part of the request codec |

## G2 · Deciding a candidate in the panel

| Requirement | Implementation | Evidence |
|---|---|---|
| The reader decides, the panel records it | `resolveGrammarCandidate` is a Remote endpoint over the same rules the tool uses | Attaching names one entry and the candidate closes as `attached` |
| Attaching is not rewriting | Empty wording leaves `contentStatus` at `ai-unverified` and only adds the example | Asserted after the panel decision |
| Rewriting is deliberate | The optional wording field is the only path to a rule change | Tool tests cover the same path with wording; the panel passes `keyPoints: null` when it is empty |
| A decision never counts twice | A retried decision returns `already-resolved` | Counter stays at 2 after the retry |
| An unusable decision is refused | Unknown entry → `conflict`; an invented decision → bad request | Both asserted |
| Nothing is deleted | All three outcomes keep the candidate row as a trace | `discarded` returns and the entry count is unchanged |

### The wire name mismatch the panel reported (fixed)

The panel's library tab failed with
`frenchReader/listLexicon: args fields do not match the descriptor: missing
"_request"; unexpected "request"`. Two Host methods (`listLexiconRemote`,
`listGrammarRemote`) had their request parameter named `_request` — the
unused-parameter convention — while every other endpoint names it `request`, and
the client sent `request`. The name is the wire key, so those two endpoints could
never be called from the panel.

Fixed by naming the parameter consistently on the Host, and a new test compares
the Host's generated descriptors against the client's inlined ones, endpoint by
endpoint and parameter by parameter. It was written before the fix and reproduced
the exact failure, naming both endpoints and both sides of the mismatch.

### A silent patch failure, and the guard it produced

The knowledge section — vocabulary/grammar tabs, cards and candidate decisions —
was reported as landed in round 9 while the bundle contained only its *strings*:
the anchors for the component definition did not match the file, and the edit
script replaced nothing without saying so. The user found it by looking at the
panel. Three things changed as a result:

1. the component was inserted with every anchor asserted (a missing or ambiguous
   anchor now aborts the edit instead of quietly doing nothing);
2. a test asserts each panel capability by **definition and use** — 21 markers
   covering the preview flow, the selection flow, the knowledge section, the card
   verdict, the three candidate decisions, keyboard activation and the error
   surfaces — so a capability cannot exist as dead strings again;
3. the strings that had landed alone are now used, and the section is rendered
   full width under the panel grid, collapsed by default.

## G2 · Knowledge libraries in the panel — verified live (2026-10-06 19:57)

Seen in the running panel after the restart that carried the wire-name fix:

| Seen | Detail |
|---|---|
| The library lists real entries | `cœur` (nom masculin, 0 forms · 1 sense) and `raison` (nom féminin, 1 form · 1 sense), each with its stored definition |
| A card renders through the policy | `cœur · 词卡（按输出规范渲染）` with the section line `§1 §2 §3a §3b §5 §6 §7` — the noun order, no §4 |
| The honesty rules are visible in the UI | §6 shows `未发现可靠关联：…` (an explicit statement, not an omission) and §7 renders as `｜…` lines; **no errors**, because both sections were written explicitly |
| The endpoint fix works | The same tab that reported `missing "_request"` now returns data |

The grammar tab was verified the same way: three entries with their mastery, ask
counts and content status (`learning` · 提问 1/2 次 · `ai-unverified` / `mixed`),
the resolved candidate shown as `attached` **without** decision controls, and the
open candidate showing the candidate selector, the attach button, the optional
rule-rewrite field and the create/discard pair — the plan's "候选有歧义时让你选择"
reachable in the reader's own panel.

### The reader's own decision path, verified live

The last open candidate was attached from the panel itself, with the wording field
left empty, and all three expectations held at once:

| Expected | Observed |
|---|---|
| The candidate closes and its controls disappear | The row became `attached`; the selector, wording field and the create/discard pair are gone |
| The named entry gains the question | `关系代词 que 作直接宾语` went from 提问 2 次 to **3 次** |
| **Empty wording never rewrites the rule** | Its content status stayed **`mixed`** — unchanged by the attach |
| The decision is visible, not silent | The tab reported `已处理：attached`, and the resolved row stays as a trace |

That closes the plan's "自动积累 → 歧义候选 → 由你决定 → 只动白名单字段" loop through
the reader's own panel rather than through the tool, which is where it has to work.

One cosmetic defect the screenshot showed — the card's two buttons were pushed to
opposite ends by the row's `space-between` — is fixed with a left-aligned variant
used by the card and decision rows.

## G2 · Knowledge libraries in the panel

| Requirement | Implementation | Evidence |
|---|---|---|
| Accumulated knowledge is visible while reading | Two more Remote endpoints (`listLexicon`, `listGrammar`) project the libraries to wire shapes | The projection test builds a real library and reads it back |
| The projection is not the storage record | The endpoint maps entries to views; the client never sees stored payloads | Lexicon forms and senses survive the round trip; grammar counters and statuses are asserted |
| Candidates awaiting a decision are shown, not hidden | The grammar listing carries `pending` with its candidates and resolution state | The ambiguous topic yields one open candidate with two names, and no fourth entry |
| The panel does not pretend to decide | The pending block says decisions currently go through the tool's `resolve` | Message string; no fake buttons |
| A missing endpoint is reported | Same explicit pattern as preview and selection | `knowledgeUnavailable` names the reason and the likely restart |

## G2 · Phrase anchors from the panel

| Requirement | Implementation | Evidence |
|---|---|---|
| The reader can select a phrase while reading | Sentences render as `role="button"` spans, not real buttons, so text can be dragged across them | The factory test exercises the rendered component path; a real button would intercept the drag |
| A selection becomes a reusable anchor | `createSelection` is a Remote endpoint; the panel sends the range it measured and makes the returned anchor current | Remote test: `created`, then `already-existed` with the same id, `range-out-of-bounds` refused, empty ranges a bad request |
| The offsets are the paragraph's own | Offsets are counted in rendered text, which is the paragraph text, then added to the paragraph's absolute start | The row is a contiguous range; discontinuous structures stay a tool feature and are documented as such |
| Coming back to the keyboard | Sentences are focusable with Enter/Space activation and a visible focus ring | `:focus-visible` outline in the stylesheet; `onKeyDown` handler |
| Narrow screens stay readable | Reading view padding, font size, branch indentation and the preview header adapt under 900px | Media query added for `.fr-read`, `.fr-paraText`, `.fr-branch`, `.fr-preview-head` |
| A missing endpoint is reported, not hidden | Same explicit pattern as the preview: the failure names the reason and the likely restart | `selectionUnavailable` message string |

**Client-only changes take effect on a page reload**; the four new Remote endpoints
(`createSelection`, `previewImport`, `listLexicon`, `listGrammar`) need the Host
restarted, and the panel says so when a call fails. The reading panel now has
knowledge tabs and can decide a pending candidate; the schema is versioned so the
client never has to guess.

## G2 · Import confirmation in the panel

| Requirement | Implementation | Evidence |
|---|---|---|
| The reader confirms before anything is stored | `previewImport` is a Remote endpoint, so the panel can show what `save` would store | The Remote preview writes nothing and matches the tool preview |
| The text the reader saw is the text saved | The confirming press reuses the preview it was shown, keyed on the title and source | The panel re-previews whenever either changes |
| The confirmation step never fails open | If the preview call fails — a Host that predates the endpoint — the panel reports it and offers an explicit "save without preview" on the next press | The panel's face is asserted to expose the call; the fallback is a named button, not a silent bypass |

This is the first capability reachable from the panel rather than only from the
tool; it still needs one Host restart to answer, which the panel says out loud
instead of pretending the preview succeeded.

## Verified live (2026-10-06 19:43, Host restarted)

The restart carried every change from the previous six rounds, so these ran on the
real library rather than on fixtures.

| Capability | Live result |
|---|---|
| `render` on the stored `cœur` entry | Noun card rendered §1 §2 §3a §3b §5 §6 §7 (no §4), with the real sense as an ordered §2, and **two named errors** for the empty §6/§7, each shown in the card as `（待补：该章节为空）` |
| `section` | Writing §6 explicitly re-ran the policy: the error list shrank to §7, then to **empty** after §7 |
| `lexiconSource` | The measured CNRTL response (200 + `Portail lexical` only) was recorded `ok: false`, `body-missing`, note `该来源未返回可用正文，按训练数据回退` |
| `select` | A discontinuous selection of `ne … point` in revision 2 became **one** anchor `sel_58e33c07ae864ab3`, excerpt `ne … point`, two stored ranges |
| Branch on a phrase anchor | Stored with span `[120,136)` at revision 2, and `analysis` reports `resolved` / `span` for it — the discontinuous re-derivation rule, live |
| Older notes after the revision | Still `relocated` / `moved`, i.e. the backfill fix holds across another restart |
| `coverage` | The real Pascal sentence with three constituents: no errors, and the derived clause split (`0–21`, `22–52`, `55–82`) returned for inspection |
| `preview` | `Le cÅ“ur…` reported a **mojibake error** plus a double-space hint, with nothing written |
| `conjugation` | `connaître` present tense: decomposition composes, ◀ marks `connaît`, and the unverified classification rendered `B 类（存疑：未核实）` |
| Client half | A live Client answered the Slots inspect provider, and this restart produced **no** boot crash log |

### G3 · Themes, verified against the live provider

The Client Theme provider lists 14 tokens, every one requiring a light and a dark
value. Checking the panel against it found two raw colours — `#fff` on the primary
button and a dark navy shadow — each of which would have broken one theme. Both
are fixed: the on-brand foreground now uses the shell's own convention
(`var(--dsw-alias-bg-base)`, confirmed against the shipped bundle) and the shadow
is derived from a token. A test now fails if any raw colour or unknown token
appears in the client.

## G2 · No clause goes unanalysed

| Rule from the plan | Implementation | Evidence |
|---|---|---|
| 逐句解析不漏从句 | `coverage` derives clause units from punctuation and a closed list of subordinators/coordinators, then requires each to be covered by a constituent range | Dropping the relative clause is named with its text and position |
| 不能只给一句概括 | One constituent spanning a multi-clause sentence is a hint, not a pass | Hint asserted; a genuinely single-clause sentence is not punished |
| Nothing is claimed without evidence | Uncovered text runs, overlaps, out-of-range ranges and nameless constituents are errors | Each asserted |
| The clause split is visible, not hidden in the verdict | The action returns the clause units it derived | The tool result carries start/end/text for each |
| A check writes nothing | No storage call on the path | Write counter unchanged |

Two corrections the tests forced, both about honesty rather than convenience:
clause ranges had to be trimmed (an untrimmed boundary reported whitespace as a
gap), and containment is now judged on the word-bearing core — covering
`…raisons` covers the clause `…raisons.`, while dropping any word still fails.

## G3 · Conjugation checks

The module does not conjugate; it checks a claim, so an incomplete rule set shows
up as "unverified" instead of being papered over with invented forms.

| Rule from the plan | Implementation | Evidence |
|---|---|---|
| The final form must be correct | Every displayed form is checked against French orthography | A form containing a digit is an error |
| A taught decomposition must compose the form | `stem + ending === form`, per person | `ouv` + `ons` ≠ `ouvrons` is named with the arithmetic in the message |
| Only the present tense and the input's own tense | Any other block is out of scope | An extra imperfect block is an error; the block matching the input's tense is allowed |
| The present is not shown twice | Duplicate present blocks are rejected | Two present blocks → "输入已是现在时的不重复输出" |
| A bare participle is not a compound tense | A compound input without an auxiliary is refused | `ouvert` as *passé composé* errors; `ai ouvert` passes |
| An ambiguous form needs an example | More than one candidate tense without evidence is an error | `établit` (present vs simple past) errors until a sentence is given |
| An unverified A–E classification is marked | `classificationVerified !== true` renders 「存疑：未核实」 | Rendered text asserted, and the hint disappears once verified |
| Irregular verbs need their exception stated | A closed list demands an explicit note | `être` without a note is a hint, never an invented paradigm |
| 三层阶梯 with the input marked | The renderer marks the input form with ◀ and shows the stem | Both identical forms of `ouvre` are marked; the stem line is present |

## G2 · Import confirmation

| Requirement | Implementation | Evidence |
|---|---|---|
| The reader confirms content before it enters the library | `preview` describes what `save` would store and writes nothing | Zero writes after a preview; a later `save` is the confirming act |
| Boundaries are shown, not assumed | The preview lists each paragraph with its id, sentence count and excerpt | A two-paragraph source previews `p1`, `p2`; the dialogue dash still counts as a sentence break |
| Encoding damage is an error | Mojibake pairs, a lone replacement character, and a BOM are `error` severity | `Le cÅ“ur…`, `Jâ€™ai dit Ã …`, `\uFEFF…` each flagged; legitimate `â`, `é`, `ç` are not |
| Typography is a judgement call, not a silent edit | Unbalanced guillemets, `oe` without the ligature, non-breaking spaces, double spaces, trailing whitespace and mixed line endings are `hint`s | All six reported for one crafted source, none of them errors |
| A truncated or unwieldy import is called out | A paragraph over 1200 characters and a last sentence without terminal punctuation are hints | Both asserted, and absent for a clean sentence |
| Nothing is stored on the reader's behalf | The tool description tells the caller to preview, read it back, then save | Preview of a damaged source leaves storage empty |

## G2 · Phrase-level anchors

| Requirement | Implementation | Evidence |
|---|---|---|
| A phrase can be an anchor | `select` stores one or more half-open ranges as a reusable anchor id (`sel_` + token) | A two-range selection yields one anchor whose excerpt joins the parts with a gap marker |
| A discontinuous structure stays one anchor | `ne … point` is two ranges under one id, and every note type accepts it | A branch and a translation anchored to it store a span covering the whole selection |
| Selecting the same words is idempotent | The token is derived from the revision and the ranges | Re-selecting returns `alreadyExisted` with the same id and one stored record; different ranges give a different id |
| Out-of-bounds or inverted ranges are refused | Validated against the source before storage | Four refusal shapes asserted, with no write |
| An unknown token is not an anchor | `resolveAnchorId` checks the selection record, its passage and its revision | `sel_0123456789abcdef` is `anchor-unknown` |
| An older selection does not silently anchor new notes | A selection only applies to the revision it was made in | After a revision the old token is refused while its record is kept |
| A discontinuous anchor is never "relocated" by guesswork | Its excerpt is a reconstruction, so it is re-derived and compared instead | Resolved when it reproduces itself, else `unresolved` with `selection-stale` |

Two defects the tests caught here: the controller's **request** validator still
rejected `sel_` ids (storage accepted them, so the failure looked like a bad
request), and the tool's analysis view dropped the anchor ref, hiding which span
a note was bound to. Both fixed; the anchor pattern is now one shared constant.

## G2 · Vocabulary card actions

| Requirement | Implementation | Evidence |
|---|---|---|
| Render through the policy, not by prompt | `render` builds the card from `sectionOrder` and reports the same policy's verdict | A verb card renders §1 §2 §4 §3a §3b §5 §6 §7; a noun card has no §4 |
| An incomplete card is called incomplete | Empty required sections are errors, and the card shows `（待补：该章节为空）` instead of a tidy heading | Fresh card → two named errors, both gaps visible in the text |
| A missing section is never fetched for you | `section` writes one section explicitly and re-runs the policy | Writing §6 then §7 clears both errors; an invented section id is refused |
| Success is not an HTTP 200 | `lexiconSource` judges the fetch through `source-gate` and stores the truthful verdict | The measured CNRTL case (200 + `Portail lexical`) is stored as `ok: false`, `body-missing`, `按训练数据回退` |
| A source supports one section only | The record keeps its section and a note claiming only that field | A real body is recorded `ok: true` with `仅支持本字段` |
| Rendering is a read | No write happens on render | Write counter unchanged after two renders |

## G2 · Library transfer

| Requirement | Implementation | Evidence |
|---|---|---|
| Export restores the whole library, not a projection | `export` returns every record with its key: sources, segments, analysis, adoptions, runs, vocabulary and its index | Round trip into an empty profile restores every record and every relationship |
| Re-import is idempotent | Identical records are skipped, not rewritten | A second import imports 0 and skips all |
| Import never overwrites local work | A differing record is reported as a conflict and left alone | A tampered bundle leaves the local title intact |
| An import cannot corrupt the library | Every record is validated against the domain schema before it is written | A malformed record is refused with `schema-invalid` and storage is untouched |
| An unusable bundle is refused outright | Wrong `schemaVersion` returns `unsupported-bundle` | The call reports not-ok and writes nothing |

## G2 · Grammar accumulation

| Rule from the plan | Implementation | Evidence |
|---|---|---|
| Accumulate automatically after answering, never ask each time | A `grammar` intent in a committed answer creates or updates the entry as part of the run | One answer with two grammar points yields two entries |
| Several grammar points are handled separately | Each intent matches, creates, or parks on its own | Two topics in one answer → two entries with their own counters |
| The automatic path may only touch the whitelist | Only `askCount`, `lastAskedAt`, `examples` and `pitfalls` are written back | After three updates `keyPoints`, `level`, `module`, `mastery` and `contentStatus` are unchanged |
| A retry is not a new question | Counting is guarded by the intent id, so re-applying a run neither counts nor duplicates the example | Same run retried plus `resume` → `askCount` 1; a genuinely new question → 2 |
| A real second question counts again | A new run over the same anchor is a new intent | `askCount` 2, `examples` 2 |
| Near matches are never merged automatically | Token-overlap matching; two or more candidates become a pending candidate with the candidate list | Two `关系代词 que …` entries plus an ambiguous topic → no merge, one pending, both counters untouched |
| New entries start at「在学」, content state kept apart | `mastery: 'learning'`, `contentStatus: 'ai-unverified'` | Asserted on creation |
| Partial failure does not lose the answer or the healthy writes | Per-intent status in the run record | An intent with an unknown anchor fails, its sibling applies, the answer stays readable |

### Closing a candidate (`resolve`)

| Rule from the plan | Implementation | Evidence |
|---|---|---|
| An ambiguous match waits for the reader | The candidate row records a resolution trace instead of being deleted | After a later unambiguous question the ambiguity is still open |
| The reader chooses which entry it belongs to | `attach` with an explicit `entryId` | The chosen entry gains the question and example; the other candidate's counter is untouched |
| Attaching does not rewrite the rule | `attach` without `keyPoints` leaves `keyPoints` byte-identical | Asserted |
| Revising a rule is its own explicit act | `attach` **with** the new wording; `contentStatus` becomes `mixed` | New wording stored, `mastery`/`level`/`module` unchanged |
| A candidate may also become its own entry | `create` makes a new entry with the pending topic | Third entry created, `askCount` 0 (a decision is not a question) |
| Or be dropped | `discard` closes it and creates nothing | Entry count unchanged, resolution recorded |
| A repeated decision changes nothing | The resolution trace makes the retry an `alreadyResolved` answer | Counter stays at 2 after a retried attach |
| An unusable decision is refused | Unknown pending or unknown target entry | Refused with a reason, candidate still open |

Two defects the tests caught while building this: the grammar path did not
validate its anchor at all (it would have stored an example pointing nowhere),
and the example did not record its span. Both fixed: an unknown anchor now fails
that intent, and every example carries the span it came from.

## G2 · Complete user loop

Verified on the running app with Pascal, *Pensées* (fragment 277):

1. source stored (`a8af1efd-…`), segmentation derived and persisted;
2. overall translation on the `passage` anchor and a separate sentence translation on `p1.s1`;
3. six branches: constituents (root) with two grammar children, two vocabulary
   branches on the exact forms `cœur` and `raisons`, and one note on the passage
   anchor for the rhetorical reading (confirmed in the panel, 2026-10-06 18:58);
4. `analysis` reads the whole tree back, including parent/child links;
5. three duplicate passages created by earlier failed retries were archived, and
   the library returned to one entry.

The semicolon case is deliberate: the source stays one sentence, so the
constituent analysis keeps the two independent clauses inside one sentence
instead of mechanically splitting them.

Not yet covered: dark/light and narrow-screen checks, keyboard and selection
behaviour,
and the panel UI for previews, selections and vocabulary cards (all of these
capabilities exist on the Host/tool side only so far). Source revisions, the commit
protocol, and the new tool actions are implemented and tested locally but not yet
exercised against the running Host (they need one restart).

## Test suite

`pnpm --filter @local/french-close-reading test` — 137 tests:

- **contracts** — Host/Client endpoints agree; 9 strict codecs; storage policy.
- **client-registry** — replica of the installed registry validation (the exact
  check that failed the boot), working `create()` validators, fail-soft mount.
- **client-bundle** — the factory resolves against the baseline module table only.
- **domain-integration** — real `DomainFacility`: durability across a close/reopen,
  write events, failed medium, invalid stored record.
- **reading-model** — segmentation persist/replay, translation versions, branch
  trees, drift, stale revision, reopen.
- **segmentation** — French rules: paragraphs, dialogue dashes, terminal runs with
  guillemets, abbreviations/initials/decimals, offsets.
- **run-commit** — one commit carries answer + intents; retried commit is one run;
  crash between writes resumes only the pending intent and duplicates nothing;
  a failing intent is reported without blocking siblings; a refused commit writes
  no run and no analysis.
- **coverage** — clause derivation, complete analyses, dropped clauses,
  summaries, overlaps, and the reported clause split.
- **lifecycle** — plugin apply/dispose, exactly-once cleanup, restart
  persistence, declared injects, and the no-core-modification guards.
- **conjugation** — decomposition arithmetic, tense scope, duplicate present,
  bare participle, ambiguity without evidence, unverified classification,
  irregular-verb notes, and the ◀ ladder.
- **import-preview** — boundary preview (tool and Remote), encoding errors (mojibake, replacement
  character, BOM), typography hints, truncation hints, and preview-writes-nothing.
- **selection** — discontinuous phrase anchors (tool and Remote), idempotent selection, refusal
  shapes, revision scoping, and phrase-anchored notes.
- **lexicon-card** — rendering through the policy, explicit section writes,
  truthful source recording, refusal paths, and render-is-a-read.
- **output-policy** — section order per type, §2/§3b formats, required-section
  errors, honest "no reliable link" statements, and the source gate including the
  measured CNRTL 200-with-chrome case.
- **grammar** — creation defaults, whitelist protection, counting idempotency,
  multi-point handling, ambiguous near matches, partial failure, and the four
  ways a reader can close a candidate.
- **library-transfer** — export/import round trip across every record kind,
  idempotent re-import, conflict without overwrite, schema validation on import.
- **anchor-backfill** — a span-less note is trusted only while the source never
  moved; after a revision it is `unresolved` rather than mis-attached; the
  explicit backfill derives spans from a named revision, relocates at the same
  granularity, and reports anchors it cannot justify.
- **translation-variants** — authored variants coexist; adoption keeps every
  variant and records the one it replaced; reconciliation names the stale overall
  translation and shows what changed; idempotency and refusal paths.
- **lexicon** — exact-Mot hit vs candidate, homograph separation, duplicate and
  concurrent creates, occurrence isolation, index rebuild, empty misses.
- **source-revision** — a note records its span; correcting a source adds an
  immutable revision; a moved sentence is relocated, an ambiguous or vanished one
  stays unresolved; legacy records still load.
- **tool** — actions/schema, deterministic ids, archive, revisions, refusals,
  idempotency.
- **manifest** — shipped files, path-safe keys, no self-external.

## Open risks

- The client registry replica is hand-written from the installed source; a future
  DSH version could validate more.
- Crash recovery (`disableAllPlugins`) resets the whole profile bundle list, so a
  client-half failure costs unrelated plugins their enablement. The client half is
  now fail-soft for exactly this reason.
- The plan's storage limits (catalogue vs document history, capacity thresholds)
  are not implemented yet; the current domain loads every record on open.

## M0 · Correctness fixes (implemented and verified locally, 154 tests green)

Every item below started as a failing test in `test/m0-fixes.test.mjs`,
`test/selection-offset.test.mjs` or `test/client-registry.test.mjs`, then the
implementation was changed until it passed. The live Host has not yet been
restarted onto this build, so the browser-facing effects are unverified in the
running app.

| Defect | Fix | Evidence |
|---|---|---|
| Two passages sharing a character range produced **one** selection record; the second passage then received the first passage's excerpt and every note it anchored was refused as `anchor-unknown` | `selectionToken` hashes passage id + revision + ranges, and a hit is re-verified against passage, revision and ranges (`selection-token-collision` otherwise) | `m0-fixes.test.mjs`: same range in two passages → two records, two anchors, and the second passage's anchor works; re-selecting in one passage still reuses its anchor |
| The panel measured a selection against the whole `<section>`, so the paragraph chip and the badges were counted as text and every stored offset landed ahead of the text it named | Offsets are counted by walking the `p[data-paragraph-text]` element's own text nodes | `selection-offset.test.mjs`: the chrome is invisible to the measurement, the span matches the paragraph slice, collapsed/reversed/outside positions are refused |
| One real question with two intents about the same grammar point counted **twice** | Counting is deduplicated on the question (the run id is the question id) against the entry, read back from the stored examples so a crash cannot double-count | `m0-fixes.test.mjs`: two intents → `askCount 1`; a new question → 2 |
| Confirming a candidate with `create` wrote the new topic index from a stale snapshot, so the next question about that topic never matched the entry | One accumulator for the whole decision; the computed store is what gets written | `m0-fixes.test.mjs`: after `create`, a follow-up question matches the created entry, no second open candidate |
| A grammar example quoted the head of the passage and recorded an empty question | `exampleTextFor` quotes the anchored sentence/paragraph, and the run's real question travels with the example and the candidate | `m0-fixes.test.mjs`: the example text equals the stored `p2.s1` text; the candidate records the real question |
| The panel's "backup" called `exportPassages`, so analysis, discussions, vocabulary and runs were **not** in the backup | New `exportLibrary` Remote endpoint (16th) carries every record with its key; the panel exports that, and a separate button exports sources only | `contracts.test.mjs` (16 endpoints, both faces agree), `client-bundle.test.mjs` (both buttons wired) |
| Reusing one `operationId` with different content silently reused the old run | Same id + same intent and nothing pending → `unchanged` (no write, no version bump); same id + different content → `operation-used` | `run-commit.test.mjs` |
| Client codecs rejected the Host's own `null`s (`entryId`, `keyPoints`, `lemma`, `level`, `lastAskedAt`, `resolution`, `resolvedEntryId`), which is a real `gateway/input-invalid` because the gateway calls `codec.create().parse()` per argument | `S.nilable` for every nullable field, on requests and results | `client-registry.test.mjs`: the panel's real payloads and the Host's real null-bearing results all parse |

Structural change made to pay for the remaining milestones: the vocabulary rules
moved out of the 2 276-line controller into `src/lexicon-store.ts`, which takes
the storage table as data. The controller kept the write chain and now delegates.

## M1 · Schemas added, not yet wired (typechecked, no behaviour yet)

`src/discussion.ts` declares discussion branches with ordered messages, the
immutable `ContextManifest` (materials, versions, exact text, character budget,
fingerprint), confirmed conclusions, and versioned content changes. They are
composed into the record union in `domain.ts`, so stored records are validated
against them on open. `src/discussion-store.ts` implements the in-memory rules
(idempotent message append, fork cut-off, status changes, superseding
conclusions, content versions) and `src/generation.ts` implements the backend
interface plus the DSH `ctx.llm` backend.

**None of these three modules has a test or a caller yet**, and no Remote
endpoint exposes them. They are the pieces M2–M5 are built from; they must not be
reported as delivered behaviour until an endpoint and a test exist for each.

## M2/M3 · Generation backends, compiled context, ask (167 tests green)

Implemented on the Host and reachable through 9 new Remote endpoints (25 total,
both faces compared name by name in `contracts.test.mjs`). **The panel UI for
these is not written yet**; the evidence below is Host-side and in-process.

### The agy CLI is verified on this machine, not assumed

| Checked | Observed |
|---|---|
| `agy models` | exits 0 and lists 14 real slugs (`gemini-3.8-flash-high`, `claude-sonnet-4-6`, `gpt-oss-120b-medium`, …) |
| `agy --help` | accepts `--model`, `--effort` (low\|medium\|high\|xhigh\|max), `--json-schema`, `--output-format`, `--sandbox`, `--mode`, `--disable-slash-commands` |

The earlier bridge never passed `--model`, so its "model" was whatever the CLI
defaulted to. This backend pins it, and an unknown model is left to fail loudly
rather than being silently replaced.

### What is enforced, and what is only reduced

- The CLI runs through the Host's own `ctx.subprocess` seam — argv, environment,
  stdio and teardown come from the same service every other capability uses. A
  private `execFile` would have given this plugin a differently-sandboxed process
  world, so that is not what it does.
- Prompt ceiling (6 000 characters) is refused **before** spawning, because the
  prompt travels as one argv entry.
- One task at a time, matching the CLI's single-session model; a second task is
  refused with `agy-busy`, not queued invisibly.
- `--print`/`--json`/`--mode plan`/`--sandbox`/`--disable-slash-commands`, plus an
  explicit no-write instruction, and `--continue` is never passed.
- **Stated limit:** `plan` plus a prompt is *not* an operating-system read-only
  guarantee. It reduces what the CLI may do; it does not prove it.
- The CLI's stderr is never forwarded into a stored message.

### Context is compiled, and isolation is asserted on the bytes sent

`test/context-isolation.test.mjs` (13 tests) uses an injectable backend that
records the exact prompt it received, so isolation is checked on the request
payload rather than on a tree the UI drew:

| Requirement | Evidence |
|---|---|
| Sibling branches never enter each other's context | Two branches on one anchor: the second prompt contains its own question and **neither** the sibling's question nor its answer |
| Another passage never enters a request | The prompt carries the current passage and not the second one |
| A fork stops history at the forked message | After forking at message 1 and talking on in the source, the fork's prompt has the source's first turn and not what the source said afterwards |
| Preview and request are one compilation | Every previewed material's excerpt appears in the sent prompt |
| A stale preview is refused | After the branch moves on, sending with the old fingerprint returns `context-changed` and **nothing is sent** |
| An over-limit context is refused, not truncated | With a 20-character ceiling: nothing reaches the backend, and the branch records the question plus why it was not sent |
| The question is durable before the model call | A failing backend still leaves both messages, the answer marked `failed` with the backend's reason |
| Every answer records its provenance | Backend, requested model, resolved model and the stored context manifest are all readable |
| A retried send is one turn | The same `operationId` does not append a second turn; different text under it is refused |
| Conclusions supersede rather than overwrite | Two confirmed conclusions on one anchor: the older becomes `superseded`, both readable |
| An unavailable backend is reported | `available: false` with its reason, and the ask is refused with nothing sent |

## M6 · The generation surface in the panel (implemented, not yet seen live)

The panel now has the turn the plan describes: choose a backend, choose a model,
write a question, **look at what the turn would send**, then send it. The chosen
fingerprint travels with the send, so content that changed after the preview is
refused rather than transmitted unseen.

| Reachable now | Evidence |
|---|---|
| Backend list with honest status | `listBackends` is called when the panel opens; an unavailable backend renders its reason and cannot be selected |
| Model list per backend | `listBackendModels` is called on backend change; an empty list is shown as "no model available", never filled in |
| Per-reading model choice | The picker is local to the reading; nothing writes a global default |
| Context preview | `previewAsk` renders each material with its reason and size before anything is sent |
| Send with the previewed fingerprint | `ask` carries `expectedFingerprint`; a mismatch is refused |
| Branch conversation | `listDiscussion` renders branches, their messages, each answer's backend/model and any failure |
| Branch state | `setBranchState` marks a branch understood / unresolved / disputed |
| History count per branch | Shown from the Host's own `historyCount`, which is the branch's fork-cut history |

`client-bundle.test.mjs` asserts each of these by **definition and use**, so a
capability cannot regress into dead strings the way the knowledge section once
did. `client-registry.test.mjs` runs the panel's real payloads through the real
codec path.

**Not verified:** no browser has opened this panel. The Host must be restarted
onto this build and the reader must actually send a turn before M6 can be called
accepted. The evidence above is bundle-level and contract-level, not a session.

## M4 · Structured per-sentence analysis (model and gate implemented)

`src/analysis.ts` declares the six parts the plan requires as data: the
translation, the backbone, clauses, constituents, morphology and explanations —
with part of speech and syntactic function as **separate fields**, so "adjective"
can never be stored as a function.

`validateSentenceAnalysis` enforces:
- every word-bearing gap between constituents is an error naming the uncovered text;
- a range past the end of the sentence is caught rather than rendered;
- one constituent spanning a multi-clause sentence is a **hint** ("this is a
  summary, not an analysis"), while a genuinely single-clause sentence is not
  punished;
- an interpretation labelled as a syntactic fact but naming authorial intent is
  flagged, so "Foucault meant this" never displays with the certainty of "the
  subject is X";
- AI content marked as reviewed is queried.

`analysisCoverage` reports covered / missing / failed / **stale** sentences, where
stale means the analysis describes text that is no longer the sentence — so "every
sentence is analysed" is a measurement, not a claim.

`test/sentence-analysis.test.mjs` (13 tests) checks each rule, with fixture ranges
derived from the real sentence text so a fixture cannot drift from what it
describes. Storage schema round-trip is asserted too.

**Superseded by M4b below:** generation, endpoints and rendering now exist. The
gate and the model are still separate concerns: this module validates, it never
generates.

## M5 · Sources and mastery (implemented; one measured negative result)

### CNRTL is measured unreachable, and nothing claims otherwise

Plain `fetch` of every CNRTL lexical path returns a **914-byte page whose entire
text is "Portail lexical"** — measured again this round:

| URL | Status | HTML | Extracted text |
|---|---|---|---|
| `/definition/ouvrir` | 200 | 914 B | `Portail lexical` (15 chars) |
| `/etymologie/ouvrir` | 200 | 914 B | `Portail lexical` (15 chars) |
| `/lexicographie/ouvrir` | 404 | 914 B | `Portail lexical` (15 chars) |

So the fetching machinery is real and tested, and **CNRTL's content cannot be
retrieved from here today**. The gate records `not-found`/`body-missing` with the
fallback note, and the card says the attempt failed instead of implying a source
was consulted. No part of the plugin claims live CNRTL data.

### What the fetch path enforces

| Rule | Evidence |
|---|---|
| Only declared sources are requestable | An invented source returns `source-unknown` without a request |
| A source cannot support a field it does not cover | `cnrtl` + `conjugation` returns `section-not-supported-by-source`, and the stub provider is **never called** |
| A 200 without the headword is a failure | The measured stub page stores `entryFound: false`, `ok: false`, with the fallback claim |
| A near-miss is not a hit | A page about `ouvroir` is not a source for `ouvrir` (word-boundary match, not substring) |
| A real body supports its own section only | `ok: true` with a claim reading 仅支持本字段 |
| Markup and script never reach a quoted body | `<script>`/`<style>` stripped, and an unclosed `<script>` is cut to the end |
| A transport failure invents no status | `httpStatus: null`, judged as a parse failure |
| An attempt is stored either way | A failed fetch is recorded on the entry; a refusal before any request is not |

### Mastery is the reader's act

`setGrammarMastery` is the only thing that may move `mastery`; the automatic
accumulation path still never touches it, which a test now asserts directly by
setting `known` and then asking another question about the same point.

| Rule | Evidence |
|---|---|
| A move is a versioned act | The change is recorded as a content version whose reason is `learning → known` |
| A stale write is refused, not applied | `expectedRevision` mismatch returns `revision-conflict` with the actual revision, and the entry is unchanged |
| A retried decision is recognised | The same `operationId` returns `already-updated` |
| Setting the current value is not a change | Returns `unchanged` with no write and no version |
| Moving mastery touches nothing else | The rule text and the ask counter are asserted unchanged |

### Found and fixed while doing this

Two producers of the grammar record key had drifted: the controller derives it
from a hash of the topic, while the store used the entry id — so a mastery write
went to a **second record that nothing read**. The derivation now lives in one
place (`grammarHash` in `lexicon-store.ts`) and both call sites use it. The panel
had the same class of latent bug: `ctx.web` is reached through `ctx.get('web')`,
so a test that merely assigns the property sees nothing.

The panel now offers the source pickers (declared sources and their supported
sections only), shows the verdict as a result — a failure rendered as an error,
not as a success — and gives each grammar entry 在学／复习中／已掌握 controls.

**Still not verified:** no browser has used any of this. The Host must be
restarted onto this build.

## M4b · Analysis generation and rendering (implemented, 218 tests green)

`src/analysis-store.ts` closes the loop the plan's M4 asked for: a sentence is
generated through the chosen backend, the reply is parsed and **validated before
anything is written**, and only then stored. A reply that fails the gate is
reported with the gate's own errors and stored nowhere — storing it would put an
unusable parse on screen next to a usable one.

| Rule | Evidence |
|---|---|
| The prompt states the JSON contract, the coverage rule and the certainty rule | Asserted on the prompt the stub backend received |
| A validated reply is stored and its coverage reported | `covered 1 / missing 0` after one sentence |
| A reply failing the gate is refused with its errors and stored nowhere | A dropped object → `analysis-rejected` naming `未被分析的原文片段`, and `readSentenceAnalysis` then reports `missing` |
| A non-JSON reply is refused as such | `model-reply-not-json` |
| A fenced JSON reply is read | Models wrap JSON in code fences; that is read, not punished |
| An unknown explanation kind degrades to `unverified` | It can never gain the standing of a stated syntactic fact |
| A clause parent index naming nothing does not silently become a main clause | Resolved to `null`, then judged |
| An unknown anchor or an unavailable backend never generates | Both assert `calls.length === 0` |
| Re-analysis replaces one sentence | One record, one row per sentence, other sentences untouched |
| A version cannot claim coverage it lacks | Publishing with no valid analysis returns `no-valid-analysis` |
| Earlier versions stay readable | `versionCount 2`, current pointer on r2 |
| A written analysis goes through the same gate | Bad JSON refused; a good one is attributed `user`, not `ai` |
| A source correction makes the old analysis **stale** | After `reviseSource`, coverage reports `stale: ['p1.s1']`, not covered |

### Rendering: colour is a rendering, and it cannot lose a word

The panel draws the sentence from the stored ranges, one span per constituent, and
the mapper decides the token **by role text**, so an analysis authored in Chinese
or French lands on the same colour and an unknown role gets the neutral token
rather than a guess. A legend lists every role, so colour is never the only way to
read the structure.

`test/analysis-rendering.test.mjs` (7 tests) asserts the rendering cannot alter the
text: the concatenated pieces equal the sentence exactly, including with
overlapping spans, an out-of-range span, a nested inner span, and a span with a
fractional or absent range. A clause whose parent is missing still renders at the
top level rather than disappearing.

**The role palette is the one declared exception to "no raw colours".** Eight
distinct hues are needed and the live alias tokens do not offer eight; reusing
error/success tokens would make two roles look identical. So the palette is
declared as plugin tokens **for both themes**, and a test now fails if any role
lacks a dark value or if a dark value is identical to its light one — which is the
requirement the live Theme provider states for its own tokens, and exactly what a
bare hex value would fail.

### Not yet done for these milestones

- The panel UI: backend picker, model picker, context preview list, branch
  conversation view, conclusion capture. The endpoints and their wire shapes
  exist and are contract-tested; the reader cannot reach them yet.
- Cancellation from the UI (the Host accepts a signal; nothing sends one).
- The agy bridge package still has its own copy of the process logic. The plan
  wanted one shared executor; the reading plugin now has its own, via
  `ctx.subprocess`. Converging them is deliberate remaining work.
- M4–M7: paragraph-wide analysis, structured per-sentence parsing, the knowledge
  UI, and live GUI acceptance.

## Round 5 · Two real defects found by auditing what the tests could not see

The plugin's own in-memory test medium **does not validate on write**, while a real
JSON or SQLite backend validates every record when the domain opens. That
difference hid two defects that would both have hit a user at the next restart.

### 1. An answer's operation id was not a UUID

`ask` used `` `${operationId}#answer` `` for the answer message, and the message
schema declares `operationId` as a UUID. On a real backend that write is refused;
on open, the whole `french_reader` domain would fail validation and the plugin
would not load. The answer id is now **derived** as a valid UUID from the ask's
own id, so a retry still maps to the same answer.

### 2. A record kind that could not survive a backup

`discussion` records failed schema validation, so:
- a whole-library backup **silently lost the discussion** on restore (measured:
  `conflicts: [{ reason: 'schema-invalid' }]`, branches 0 after restore);
- the same record would have failed the domain open.

Fixed by the UUID derivation, and the backup now restores **every** kind:
`exported kinds: analysisVersions, conclusions, contexts, discussion, passage,
segments, sentenceAnalyses` → `imported: 7, conflicts: []`, with the branch, its
two messages, the answer's provenance and the conclusion all readable afterwards.

### The guard, so this class of bug cannot hide again

`test/support/harness.mjs` now takes the **real record schema** and refuses a write
that a real backend would refuse, which is the difference between a test that
catches a shape bug and one that hides it until a restart.
`test/record-schema-audit.test.mjs` writes one record of **every** kind through the
real code paths and validates each against the real schema, and asserts that the
audit itself reaches all 17 kinds — so a new kind cannot be added without being
covered.

### The existing library was checked, not assumed

The user's live library was validated against the current schema: **19 records, 0
invalid**. No migration is needed, and no `discussion` record exists there yet
(the effect was never exercised live), so nothing is silently repaired.

### Backup coverage extended

`library-transfer.test.mjs` now asserts that `discussion_`, `contexts_`,
`conclusions_`, `sentences_`, `analysisVersions_`, `version_` and `selection_`
all travel in a backup, and that a round trip restores the relationships — the
branch with its question and answer, the answer's backend, the conclusion's
status, and the analysis version's overall translation.

**Note on the fixture:** the first version of that test's analysis reply left the
final period's word uncovered, and the gate refused it with
`未被分析的原文片段「n.」（28–30）`. That is the coverage rule doing its job on real
input rather than a test being adjusted to pass.

## Round 6 · Live acceptance on the restarted Host

The Host was restarted onto this build, so the checks below ran against the real
running plugin through its own Host face — not a fixture, not a fake medium. The
reader's library was **not** part of the test: a clearly-marked temporary passage
(`acce97a1-…`) was created, used and then removed by exact path, and the library
was verified byte-for-byte identical afterwards (19 records, 0 invalid, no dangling
references).

### What passed live

| Check | Observed |
|---|---|
| The plugin loaded after the restart | `french_reader` registered in the live Tool registry with all **42** actions; `french-close-reading:ui` active in the `main` slot |
| Both backends are real | `dsh` available (14 models listed, including `deepseek-official/deepseek-flash`); `agy` available (14 slugs listed, `maxInputCharacters: 6000`) |
| Library-first vocabulary | `mot {cœur, nom masculin}` hit the stored entry with `generated: false` — the rule the whole design rests on |
| The tool's own refusals | An invented action came back with `unknown action` and the real action list |

### A genuine defect the live run found, and the fix

`ask` failed with:

```
prepared LLM call config changed before adapter dispatch
```

The DSH runtime compares the options handed to `prepared.stream()` against the
config `prepareCall` resolved, field by field. My backend reconstructed the
dispatch options from the fields it cared about, so `temperature` and `maxTokens`
were **absent** where the adapter had resolved defaults — a mismatch the runtime
refuses, and one no unit test with a permissive stub would ever see.

The dispatch now carries the prepared config verbatim and adds the turn's messages
on top, so the two are equal by construction rather than by a list of fields kept
in step by hand. `test/dsh-backend.test.mjs` (10 tests) reproduces the runtime's own
guard — including the adapter-default case that failed — so this cannot come back
silently.

### What is left to the reader

Only the panel itself, which no agent can do in their place: open the 法语精读
panel and confirm the new sections render (逐句解析 / 分支讨论 / 来源与掌握状态).
Everything behind those buttons has now been exercised on this machine, including
the one path that was broken until this round.

## Round 6b · Two live-only defects, both fixed

Both were reported by the running plugin, not by a test — which is the point of
running against the real Host.

### 1. `prepared LLM call config changed before adapter dispatch`

The DSH runtime compares the options handed to `prepared.stream()` with the config
`prepareCall` resolved, field by field. My backend rebuilt the dispatch options from
the fields it cared about, so `temperature` and `maxTokens` were **absent** where the
adapter had resolved defaults, and the runtime refused the mismatch.

The dispatch now carries the prepared config verbatim with the turn's messages on
top, so the two are equal by construction instead of by a list of fields kept in
step by hand. `test/dsh-backend.test.mjs` (10 tests) reproduces the runtime's own
guard, including the adapter-default case that failed.

### 2. `Cannot read private member #backends from an object whose class did not declare it`

The controller had two private class fields. A decorator lowers a class into a
wrapper around the declared one, so a `#field` is brand-checked against the
wrapper's instances and the check fails — every generation call died on it.

The state now hangs off a **symbol-keyed property** (`Symbol.for`, so a duplicated
module copy finds the same key), which is inherited, non-enumerable and cannot
collide with a user field.

A `WeakMap` keyed by the instance was the first attempt and the regression test
caught that it was not enough: the call can arrive on an object that merely
*inherits* from the controller, and a WeakMap lookup on that object misses. That is
exactly the shape of the live failure, and `test/controller-brand.test.mjs` now
reaches every state-dependent method through such a wrapper — including the first
test, which reads the compiled artifact and fails if any real `#field` syntax
reappears in the decorated class.

## Open risks (updated)
- The M0 selection-token change alters anchor ids for **new** selections. Stored
  selections written by the previous build keep their old ids and still resolve,
  because resolution reads the record rather than recomputing the token; a
  re-selection of the same words now creates a new id next to the old record.

## M1 · Fork chain, preview fidelity, content fingerprints, manifest retention

Implemented 2026-10-07. **264 tests green** (`node --test test/*.test.mjs`).
Live Host behaviour after a restart is **not yet observed** — the reader's
acceptance run is that check, and nothing below claims it.

The four defects the read-only audit confirmed as current, each replaced by
behaviour that a test now fails without:

| Before | Now | Evidence |
|---|---|---|
| `branchHistory` read only the direct source's own messages, dropping everything the source had itself inherited | The whole fork chain is carried, each link cut at its own fork point; an unresolvable or looping fork keeps only what can be proven | `test/context-fidelity.test.mjs` · three-level fork: the leaf prompt carries the root turn and the middle turn, not what the root said after the first fork; `historyCount` is 6, where the old code reported 4 |
| `ask` compiled *before* appending the question, then recompiled after, so the sent prompt differed from the approved preview and quoted the question twice | One compile; the manifest the reader previewed is the manifest that is sent and stored | same file · `sent === preview.prompt` byte for byte, the question appears exactly once, and `renderPrompt(stored manifest) === sent` |
| The fingerprint hashed ids, revisions and text **lengths** — a same-length edit was invisible | SHA-256 over the whole canonical manifest plus the compiler and policy revisions | same file · two same-size contexts (`characters` equal) fingerprint differently and the old approval is refused with `context-changed`, nothing sent. `test/digest.test.mjs` checks the published vectors and compares the implementation against Node's `node:crypto` for multi-byte, astral, lone-surrogate and generated content |
| Manifests lived in one per-passage array capped at 200, so the oldest audit records were dropped silently | One record per manifest (key `context_<id>`), no cap; legacy arrays migrate at open, emptying only after every manifest is durable, and the move leaves a `storageMigration` marker | same file · the first of 205 turns is still readable; the migration reports `{ran, migrated: 2, skipped: 0, emptied: 1}`, is a no-op on a second run, and counts an already-moved manifest as skipped rather than duplicating it |
| A selection anchor resolved to *no text at all*, so the request could be sent without the words it was about | The caller resolves the selection from its record and the compiler emits it as a `selection` material; a selection that no longer reproduces itself refuses the turn with `selection-stale` | same file · the prompt contains `【选区 sel_…】` with the selected words; after the record is removed the turn is refused and no call reaches the backend |

### The domain version bump, verified against the installed backend

The new record kinds make the stored format version 2. With the `per-record`
layout, the backend **discards** a document whose stamp is outside
`[version, ...compatibleVersions]` — so a bump without a compatibility
declaration would have made every existing record read as absent. Read from the
installed implementation, not inferred from documentation:
`~/.dsh/profiles/node_modules/@deepseek-ai/dsh-storage-json/lib/index.js`
(`acceptedStamps` at :353, `parseRecord` at :287–302 — "an unaccepted version
stamp discards the record instead of migrating it").

Checked against the reader's actual store (`~/.dsh/storages/french_reader`, 22
record files, every one stamped `{"version":1,...}`):

- every stored record still satisfies the new record schema, so opening the domain
  cannot reject the library;
- every stored stamp is in the accepted set, and the test states the inverse too:
  without `compatibleVersions: [1]`, **all 22** records would be discarded;
- the records open into a working controller — passages, accumulated grammar and
  the vocabulary library all read back — and the migration correctly reports
  `ran: false` because this store has no legacy manifest arrays.

`test/production-data.test.mjs` reads that directory **read-only** and skips when
it is absent, so it cannot pass by inspecting fixtures instead of the real store.
The spec itself was also fed to the installed `defineDomain`
(`dsh-storage-domain@0.1.5-rc.2`), which accepted it.

### Version drift noticed while checking

The package declares `0.2.0-rc.2` peers and has its own `node_modules` with them;
the profile's copies are `0.1.5-rc.2`. Both accept this spec, and the **running**
Host's own contract (`cordis_inspect_query` → `storageDomain` → `DomainSpec`)
exposes `compatibleVersions`, so the declaration is verified against the runtime
that will execute it. The drift itself is pre-existing and not introduced here.

### Not verified, and therefore not claimed

- The bump and the migration take effect when the Host next opens the domain
  (restart or plugin reload). No live open has been observed since the change.
- Compiled context still carries only legacy translations for its anchor, not the
  structured sentence analysis the reader is looking at (see Open items).

## M2 · Grammar accumulated by the question that raised it

Implemented 2026-10-07. **283 tests green**. The mechanism already existed
(`commitRun`, per-question counting, examples and pitfalls, candidate parking); what
was missing was any connection between an answered turn and it — only the agent-facing
`answer` action ever called it. Now the turn files its own points, from the same
response:

| Piece | Behaviour |
|---|---|
| Prompt contract | `renderSystem` ends with the machine block a turn must emit when it raises a reusable point; `POLICY_REVISION` is now `close-reading/2`, so a preview approved under revision 1 is deliberately stale rather than silently sent with instructions the reader never saw |
| Parsing (`answer-extraction.ts`) | Every complete block is stripped from the text the reader sees, the **last** block is the one parsed, points are validated and capped at 8, and a point's `anchorId` is kept only when it matches the anchor pattern |
| Storage | The message holds the answer without the block; the run holds the verdict (`extracted`/`none`/`invalid`/`failed`, its reason, the point count); the library holds the points, still `ai-unverified`, with mastery untouched |
| Idempotency | The run's operation id is derived from the answer's, so a retried send lands on the same run: one message pair, one run, one count for the question |
| Anchors | A point may name its own anchor; a syntactically invalid one falls back to the branch anchor, while a syntactically valid but unknown one fails **that point** with `anchor-unknown` instead of inventing evidence. `commitRun` now validates through `resolveAnchorId`, so a branch anchored on a reader selection can file points too |

Evidence: `test/answer-extraction.test.mjs` (parser edge cases — quoted formats,
unterminated blocks, non-JSON, bare arrays, the point cap, partial validity) and
`test/ask-extraction.test.mjs` (the real turn through `ask`: the reader's text, the
run, the entry, the retry, both anchor cases, and the selection-anchored branch).

### Deliberate decisions worth stating

- **An extraction failure never costs the answer.** The message is durable before the
  grammar path runs, and every outcome — including "the reply proposed nothing" and
  "the block was unusable" — is recorded on the run rather than dropped.
- **No re-parse of a stored answer.** The block is a transport detail and is removed
  before storage, so extraction is a function of the reply, applied once. A reader
  whose turn extracted nothing retries by asking again (a new turn) — the gesture they
  already have — and the run says what the previous attempt found. A dedicated
  re-extraction endpoint would have to re-answer the question, which the plan rules out.
- **The panel does not render the verdict yet.** It is returned on `AskResult`
  (`extraction`) and in every run description, and the client codec ignores unknown
  fields, so the data is already available; drawing it is a UI change, not a backend gap.

## M3 · A generation has a life, and it is written down (Host side)

Implemented 2026-10-07. **293 tests green**. A model call was the one thing the
plugin did without leaving a record of the attempt, so a cancel, a crash, or a
provider failure all looked the same afterwards: a question, no answer, no
explanation.

| Piece | Behaviour |
|---|---|
| Record | `generationJob`, key `job_<kind>_<operationId>` (the caller's own operation id, so a retry finds its own job): status, attempt, partial text, finish reason, failure, resolved model, usage, the message and context it produced, and its timestamps |
| Start | Written **before** the provider is called, so an interruption has something to land on |
| Progress | The backend now reports each delta (`GenerateRequest.onDelta`, called from the DSH route's chunk loop) and the Host persists what it received at most twice a second — a durable write per delta would be worse than the problem |
| Settle | Every ending is recorded: `succeeded`, `failed`, `cancelled`, or `interrupted`. The message's `attempt` comes from the job, so a retry is visible in the answer itself |
| Retry | A settled job is **replayed** from its own record — no second provider call, and the returned result says `replayed: true`. The replay is refused when the same operation id carries different words, so the existing `operation-used` guard still fires (a test caught that this guard was the first thing the short-circuit swallowed) |
| Restart | `settleInterruptedJobs()` runs at open: a job still `running` becomes `interrupted` with its partial text kept. Nothing is inferred as complete |
| Length stop | `finish: 'max-tokens'` now stores the message as `partial` instead of `complete` — a new status in the stored enum, accepted by the panel codec — and the job keeps the unfinished text |

Evidence: `test/generation-lifecycle.test.mjs` (10 tests: the settled record and its
durability across a reopen, the replayed retry, the refused reuse, a cancel that keeps
its partial text, a length stop, a failure, restart reconciliation and its
idempotency, a refusal that creates no job, the delta sink, and listing order).

### Not done, and why it is not claimed

**Incremental tokens are not yet transported to the panel.** They are captured and
persisted Host-side; the panel still receives the answer when the turn settles. The
agreed carrier exists — the installed protocol supports `@Remote({ mode: 'stream' })`
(`dsh-typert-protocol/lib/types/index.d.ts:45–52`, read from the package the plugin
resolves) — but adding the endpoint is not a one-line change on the Host:

- `test/contracts.test.mjs` requires the client's inlined descriptors to match the
  Host's endpoints **exactly**, and `client.js` hand-writes its codecs rather than
  importing the generated contract, so a new endpoint must be added in both places;
- the panel needs streaming state per turn (accumulate deltas, reconcile them with
  the stored answer when it arrives).

Half-wiring that — an endpoint nothing consumes, or a panel that renders a stream it
cannot reconcile — would be worse than the current honest behaviour: the reader gets
the answer when it is complete, and a cancelled or interrupted turn now has a record
that says so. This is the remaining piece of M3 and it needs a UI pass to be worth
anything.

## M4 · Phonetic bases: the source question, measured

Started 2026-10-07. **302 tests green**. The plan named Larousse/CNRTL as the runtime
source. Before writing a parser for either, three sources were measured from this
machine — and the measurement changes the plan:

| Source | Reachable | Carries per-form pronunciation? |
|---|---|---|
| `larousse.fr/conjugaison/francais/venir/8231` | yes, HTTP 200, 54 KB | **No.** The page is a spelling table: `grep -oE "\[[^]]{2,30}\]\|/[^/]{2,30}/\|ˈ\|ɛ\|ɑ̃\|ɔ̃\|ʁ"` finds nothing but markup. A phonetic-base card cannot be built from it |
| `fr.wiktionary.org/wiki/venir` | yes, HTTP 200, 452 KB | **Lemma only.** `\və.niʁ\` is present; the conjugation table rows carry no IPA (`<td>…viens…</td>` has no pronunciation beside it) |
| `lexique.org/databases/Lexique383/Lexique383.tsv` | yes, HTTP 200, 27 MB in ~20 s | **Yes.** One row per inflected form: `ortho`, `phon` (pronunciation), `lemme`, `cgram`, `infover` (`ind:pre:2p` …) |

That third row is the only one of the three that can support the feature at all:
"how many distinct stems is this tense pronounced with, and which persons share each"
is a question about pronunciation, and Larousse does not publish pronunciation.
CNRTL was already measured unreachable from here (`source-fetch.ts`, 2026-10-06).

### What is implemented, and how it was checked

`src/conjugation-data.ts` derives bases from **source rows**, not from a bundled
answer, so the only source-specific code left is the fetch:

- **Alphabet.** Lexique's phonology alphabet mapped to IPA, every entry verified
  against a word whose pronunciation is not in question (`chanter` → `S@te`,
  `chien` → `Sj5`, `montagne` → `m§taN`, `jeudi` → `Z2di`, `fleur` → `fl9R`,
  `huit` → `8it`, `brun` → `bR1`). The character set was enumerated from the corpus,
  and an unknown symbol makes a form unmapped rather than silently dropped.
- **Inflection tags.** `ind:pre:2p` → mood/tense/person, including the many tags one
  row can carry (`imp:pre:2s;ind:pre:1s;ind:pre:2s;inf;`).
- **The ending table**, read off a regular `-er` verb's own rows (`parler` présent
  1p `parl§` → `§`, 2p `parle` → `e`; imparfait 1p `parlj§` → `j§`; futur 2s
  `paRl°Ra` → `a`) instead of being asserted.
- **The derivation**: a base is a stem (the form's pronunciation with its tense's
  ending removed), and persons with identical stems share it. A form that does not end
  the way its tense requires is reported as underivable rather than forced; a cell the
  source gives two pronunciations for is left unassigned **and named** (Lexique files
  `étaient` under présent 3p as well as imparfait, where `sont` is the real form).

**The decisive test:** deriving from real Lexique rows reproduces the five mappings
the interface prototype carried by hand — `venir` → /vjɛ̃/ (je,tu,il), /vən/ (nous,vous),
/vjɛn/ (ils); `prendre` → /pʁɑ̃/, /pʁən/, /pʁɛn/; `finir` → /fini/, /finis/;
`tracer` → /tʁas/ ×6; `écarter` → /ekaʁt/ ×6. Evidence:
`test/conjugation-data.test.mjs` (9 tests) against
`test/fixtures/lexique-verbs.tsv` (340 real rows, provenance and CC BY-SA attribution
in `test/fixtures/README.md`).

### What remains in M4

1. **Ingestion**: fetch the distribution, parse it once, cache it Host-side, and keep
   only what the reader's lemmas need. The distribution is 27 MB, so this needs a
   bounded pipeline (and the Host's own fetch limits measured) rather than one eager
   `fetch`.
2. **Store + answer path**: a per-lemma dataset record with its provenance and fetch
   state, and an honest `no-data` answer for a lemma that was never ingested —
   never a generated conjugation.
3. **Checker upgrade**: `src/conjugation.ts` currently accepts the caller's own
   `classificationVerified` flag. It must validate against the stored dataset instead,
   which is the point of having a dataset at all.
4. **Panel rendering** of the derived bases.

### The decision this needs

The plan's chosen sources cannot supply pronunciation, and the reader's model is
explicitly phonetic. Lexique is the source that carries it — but the next section
measures the Host's fetch service and shows a 27 MB distribution cannot be ingested
through it either. **Read the two sections together**: the question stopped being
"which site has the data" and became "which source can be read through the API the
Host actually offers". The derivation core is source-independent, so that answer
changes one adapter rather than the design.

## M4 continued · The ingestion route, and why it changed twice

**310 tests green.** Two further measurements decided the ingestion design, and the
first one rules out the route the previous section recommended.

### The Host's fetch cannot ingest a bulk distribution

`cordis_inspect_query` → `host` / `Service` / `web` (the running Host) returns:

```ts
export type WebFetchRequest = { readonly url: string }        // no headers, no Range
export type WebFetchResult  = { url, statusCode, body: { kind: 'html' | 'text'; content: string }, truncated }
```

There is no byte-range facility, so a 27 MB TSV cannot be streamed in bounded pieces,
and the body is handed over as **one string** with a truncation flag. Ingesting
Lexique through this service therefore means either a truncated file or a 27 MB string
in the Host — neither is acceptable. A bulk distribution would have to be placed on
disk by the reader, which is a different feature (and a different consent) than "fetch
it at runtime".

### Wikimedia rate limits are real, and are part of the contract

A burst of ten API requests answered
`429 You are making too many requests to the API` (with a `request-id`). So any
per-form route must space its requests, treat 429 as its own outcome, and never retry
in a loop. `src/conjugation-source.ts` does exactly that
(`REQUEST_SPACING_MS`, `rate-limited` as a first-class status).

### The route that works: one small page per form

`fr.wiktionary.org/wiki/venons` — 77 KB of HTML, but through the API its **wikitext is
1.4 KB** and carries everything the derivation needs:

```
{{fr-verbe-flexion|grp=3|venir|ind.p.1p=oui|imp.p.1p=oui}} '''venons''' {{pron|və.nɔ̃|fr}}
```

- `{{pron|və.nɔ̃|fr}}` → the pronunciation (IPA, with syllable dots);
- `ind.p.1p=oui` → the inflection slots, in Wiktionary's own codes;
- the lemma, in the same template.

A form page therefore declares both its pronunciation and where it belongs, which is
why no separate conjugation-table fetch is needed for the paradigm's spelling: **the
forms are fetched by name and each one says which slot it fills**. Variants
(`{{pron|və.niʁ|vniʁ|fr}}`) are kept with the first as canonical and the rest reported.

### What is implemented

- `src/conjugation-source.ts` — closed endpoint (`WIKTIONARY_API` only), form-page and
  section URLs, `decodeWiktionarySlot` for `ind.p.1p`/`ind.ps.3p`/`cnd.p.1s`/`sub.i.2s`/
  `par.p`, `parseFormPage`, `formPageToRow`, `variantPronunciations`, and
  `requestWikitext`, whose outcomes are `ok` / `rate-limited` / `http-error` /
  `truncated` / `unreadable` — **none of which may look like an empty paradigm**.
- `src/conjugation-data.ts` refactored so the derivation reads **IPA directly**, with
  the Lexique alphabet demoted to a source adapter (`lexiqueRowToSourceRow`). Two
  sources, one derivation, comparable results.
- Evidence: `test/conjugation-source.test.mjs` (8 tests) parses **really fetched**
  pages from `test/fixtures/wiktionary/` (attribution and licence in that directory's
  README) and derives a real paradigm — `viens` + `venons` + `viennent` produce
  /vjɛ̃/ (1s, 2s), /və.n/ (1p), /vjɛn/ (3p), the mapping the interface carried.
  `test/conjugation-data.test.mjs` still passes against the Lexique fixture (9 tests),
  so both adapters feed one derivation.

### M4 · Store and the data-backed checker (2026-10-07, second pass)

**321 tests green.** The two pieces that must exist whatever the fetch strategy turns
out to be are now in place, both fully tested offline:

- **`src/conjugation-store.ts`** — one record per lemma (`conj_<hex of the normalised
  lemma>`), carrying the dataset, its source and its **fetch state**:
  `ok` / `partial` / `rate-limited` / `failed` / `no-forms`. `answerForLemma` returns
  `dataset`, `pending` (with the reason) or **`no-data`** — a first-class answer, so a
  card with nothing fetched says so instead of conjugating from memory. A second fetch
  **merges** tenses rather than discarding the first, and `missingPersons` names the
  cells a partial paradigm lacks.
- **The record is validated**, not trusted: `ConjugationDatasetSchema` lives beside the
  types it mirrors and the domain union uses it, so a malformed dataset fails at the
  domain open rather than inside a card. (The first draft used `z.unknown()`, which
  would have let exactly that through; the record-schema audit now exercises the kind
  too.)
- **`checkConjugation(claim, { dataset })`** — the checker no longer takes a claim's
  word for it:
  - a displayed form the dataset spells differently is an **error**;
  - a displayed form the dataset does not list is an error **only when the dataset is
    complete for that lemma**, and a hint otherwise: a partially fetched paradigm must
    not manufacture contradictions;
  - a taught single stem is refused when the data shows those persons do not share one
    base (venir cannot be taught with one stem, and the report says so);
  - a claimed base list is compared person-for-person, and a wrong base count is named;
  - the author's `classificationVerified: true` stops being sufficient once data is
    present.

Evidence: `test/conjugation-dataset.test.mjs` (11 tests) drives the store, the domain
validation, and the checker against the real fixtures; `test/record-schema-audit.test.mjs`
now covers the new kind.

### M4 · Assembly, and a live walk that found a real defect (2026-10-07, third pass)

**332 tests green.** The walk is implemented and was then run against the live source,
which is where the interesting result came from.

**Two requests per paradigm, measured.** `generator=links` was the wrong discovery
route — one request returned **230 pages** and only **one** was a form of the verb. The
form list lives on `Conjugaison:français/<lemma>`: its rendered table (52 KB) links
**44 forms** (`venais`, `viendrai`, `vins`, `vinsse`, `vîntes` …) in one request, and
the API accepts fifty titles per query, so every form page's wikitext arrives in one
more. `src/conjugation-fetch.ts` walks that; a form page states its own pronunciation
and slots, so nothing needs the table's internal structure.

**The live walk (2 requests per verb, from this machine):**

| verb | status | présent bases derived |
|---|---|---|
| `parler` | partial | `/paʁl/` 1s,2s,3s,1p,2p,3p |
| `finir` | partial | `/fini/` 1s,2s,3s · `/finis/` 1p,2p,3p |
| `venir` | partial | `/vjɛ̃/` 1s,2s,3s · `/vən/` 1p,2p · `/vjɛn/` 3p |

Those are the three mappings the interface prototype carried by hand, derived here from
the source over the network.

**A real defect, found only by running it.** The first live walk reported `parler` as
having *two* present stems (`/paʁl/` and `/paʁ.l/`) and `finir` as having *three*. The
cause is notation, not sound: Wiktionary writes `paʁ.lɔ̃` beside `paʁl`, and
`fi.ni.sɔ̃` beside `fi.nis`, and the derivation had been grouping on the dotted string.
Syllable dots are now ignored when a stem is compared and absent from the base that is
displayed, while each **form** keeps its own dotted pronunciation. `parler` collapses to
one stem and `finir` to two, which is what the model says they are.
`test/conjugation-data.test.mjs` pins the case with both spellings.

**Status vocabulary, all four outcomes reachable:** `ok`, `partial` (a budget, an
unreadable page, or a form the source has no page for), `rate-limited` (never retried
in a loop), `no-forms` / `failed` for a table that lists nothing or does not answer. A
missing page and an unreadable page are counted separately, because only the second
makes a walk look unreliable.

**The reader's own entry point:** tool action `conjugationData` with
`conjugationMode: fetch | read | list`. `fetch` walks the source, `read` reports state
without touching the network, `list` shows which verbs have data. It is the reader's
action — nothing fetches on its own and no model triggers it.

### M4 · The panel tab (2026-10-07, fourth pass)

**335 tests green.** The feature is now reachable by the reader rather than only by a
test.

- **Two Host endpoints**: `readConjugation` (state only, never fetches) and
  `fetchConjugation` (the reader's own act), both with strict request schemas and named
  value types in `types.ts` — the three states travel as three shapes, so a panel cannot
  render "no data" as an empty paradigm by accident.
- **Two client descriptors** in `client.js`, hand-written like the other 34 because the
  browser half inlines its codecs rather than importing the generated contract.
  `test/contracts.test.mjs` and `test/client-registry.test.mjs` both moved to 36
  endpoints and pass, which is the evidence that Host and Client still agree exactly.
- **A third tab in the knowledge library** (`变位` / `Conjugation`): a verb field, a
  read button and a fetch button, then the bases with the persons that share each one,
  the per-person forms with their own pronunciations, the persons the data does not
  cover, and the tense's own notes. `no-data` and `pending` render as themselves with
  their reasons.
- **Nothing fetches by itself.** The fetch is a button; no model triggers it, and no
  effect runs it on mount. Reading is a separate call that never touches the network.

**Tests for the client half** (`test/client-conjugation.test.mjs`): the panel's label
keys are read out of the panel's own source and checked against **both** dictionaries,
because `t()` falls back to the key and a missing entry renders as `conjugationFetched`
in front of the reader; the descriptors are checked for the field names the Host
declares; and the panel is checked to render all three states separately.

**Not verified**: how the tab looks. The structure is tested, the rendering is not
observed — that is the reader's acceptance run, and the honest summary is "structurally
tested, visually unverified".

## M3 · The streamed turn (2026-10-07)

**345 tests green.** The last named piece of M3: incremental text on its way to the
panel, over the carrier the plan chose.

| Piece | Behaviour |
|---|---|
| Host endpoint | `@Remote({ mode: 'stream' }) streamAsk(request, signal)` yields `AskFrame`s: `{kind:'delta', text}` while the answer is written, then exactly one `{kind:'done', result}` |
| Same turn, one code path | It wraps `ask()` and forwards what `ask` reports; the stored message, the run, the job and the grammar extraction are the ones the unary call produces. A test asserts all four are identical, including that a retry of a settled turn answers from its record instead of streaming again |
| Terminal frame on every path | A refusal (`backend-unavailable`), a malformed request, and a failed generation each end the stream with a `done` frame carrying the reason. A stream that simply stopped would leave the reader unable to tell "still arriving" from "failed" |
| Durable progress | The deltas also feed the generation job's partial text (throttled), so an abandoned stream still has a record — `test/stream-ask.test.mjs`, six tests |
| Client descriptor | Hand-written like the other 36, with `mode: 'stream'` and a strict `AskFrame` codec that reuses the unary call's result shape. Host and Client both moved to **37** endpoints and the contract tests pass |
| Panel | `sendTurn` streams when the Host offers it and falls back to the unary call when it does not; the arriving text is rendered in a `pre` above the composer, cleared when the turn settles so the stored message stays authoritative. A stream that ends without a terminal frame throws `streamEndedEarly` rather than showing an empty answer |

**Not verified**: the stream as the reader sees it. The structure is tested, the
rendering is not — the reader's acceptance run is that check.

### M4 · Per-cell gaps, and the honest states in the panel (2026-10-07, fifth pass)

- A tense's gaps are now shown **where the row would be** — one muted line per person
  (`vous · 本次数据未覆盖这一格`) instead of a count, because the reader needs to know
  *which* person the fetched data does not cover.
- A length stop renders as `（因长度截断，未完成）` and a cancel as `（已取消）` on the
  message: `complete` now means complete on screen as well as in the record.
- The grammar verdict **reaches the panel**: the extraction verdict is written on the
  message in the same turn that produced it (`extraction: {status, points, detail}`),
  rather than only on the run. The run remains the journal of intents and their
  application; the message carries the sentence the reader reads. Resolving it from the
  run would need the run's derived operation id, which is async — that would have turned
  every discussion read into a promise, which is why the two records share one schema
  and are written from one value. `test/ask-extraction.test.mjs` asserts the view
  carries it, for an answer that filed a point and for one that proposed none.

## M5 · Frontend port begins: the two missing endpoints (2026-10-07)

**350 tests green.** The previous handoff wrongly excluded UI work; the corrected plan is
`/Users/hao/New-Of-DSH/french-frontend-port-handoff-2026-10-07.md` (the app renders the
plugin's own `client.js`, the redesign lives only in the prototype, and nothing was
cached — measured).

First step of that plan, because the reading surface cannot work without them: two
capabilities existed in the controller and were reachable only by the agent tool.

| Endpoint | Host | Why it was needed |
|---|---|---|
| `lookupMot` | `@Remote` over the existing `controller.lookupMot` | The prototype's 查词 shows a word **without collecting it**; only the tool action `mot` could look one up |
| `adoptTranslation` | `@Remote` over the existing `controller.adoptTranslation` | Choosing which translation variant a sentence uses had no panel path |

Both follow the established pattern: a strict request schema, a named value type in
`types.ts` (typert requires boundary types to be exported from the `./types` subpath), a
hand-written strict client codec, and regenerated contracts. **Host and Client are now at
39 endpoints** (`test/contracts.test.mjs`, `test/client-registry.test.mjs`).

One client-side tidy-up on the way: the vocabulary-entry codec was inlined in the
`listLexicon` descriptor, so a second copy would have had to be written for `lookupMot`.
There is now one `lexiconViewShape` constant, and it was corrected against the
authoritative `LexiconView` type — the shape I first wrote from memory used the *stored*
entry's fields (`mastery`, `contentStatus`, …) rather than the view's, which the
contract tests would have caught only at the wire.

Evidence: `test/remote-lookup-adopt.test.mjs` — a hit is the stored Mot, a declared
inflected form is a **candidate** and never a hit, a part-of-speech hint narrows without
turning a miss into a hit, malformed requests are refused with `gateway/bad-request`
before any lookup runs, and adoption reports what it replaced (`previousId` names the
replaced *adoption*, not the mere existence of another variant).

## M5.1a · The reading frame (2026-10-07)

**356 tests green.** First slice of the frontend port: the reading surface's frame,
ported from the accepted prototype into the plugin's own client half.

| Before | Now |
|---|---|
| Tall header (`.fr-top` + brand block) | One **sticky 46px** `.fr-topbar`: back · title · revision/chars · close. The reader had already objected to a top bar that took too much room |
| Two floating cards (`.fr-readGrid` + `.fr-textPane` / `.fr-bench` card) | Two **panes separated by hairlines** (`.fr-workspace`, `.fr-pane`, `.fr-paneHead`), the detail pane carrying the anchor label in its head |
| A paragraph was a bordered card with a 14px radius | A paragraph is **a column of text with a rule** (`.fr-para{border:0;border-left:2px solid}`), brand-coloured when it is the anchor |
| Source at 16px/1.9 | Source at **20px/2** Georgia, with an eyebrow, chapter line and meta line above it |
| One long scroll region | The reading page owns its height (`.fr-readingPage`), so **each column scrolls on its own** |
| — | A shorthand-window rule (`@media(max-height:500px)`) turns the page back into a single scroll container, which is the behaviour the reader measured at 844×390 / 800×350 |

**A real defect caught by reading, not by testing:** the first version of this frame kept
the page's own `overflow:auto` while giving the columns `overflow:auto` too — two nested
scroll regions and columns that could never scroll independently. The page class now
separates the two behaviours (`.fr-readingPage` vs the library's plain `.fr-page`), and
the test asserts it.

Evidence: `test/client-reading-frame.test.mjs` (6 tests) pins the frame's shape — the
compact bar, the hairline panes, the paragraph rule, the 20px reading size, the frame the
markup actually builds, both dictionaries' labels, the short-window rule, and that the
new CSS uses live theme tokens and no raw colour. The existing capability and label tests
still pass, so nothing the panel could do before is gone.

**Not verified: how it looks.** I could not see the panel from here. I launched an
isolated Chromium (the driver's own, not the reader's) and tried three times to navigate
it to `http://127.0.0.1:19387`; the address bar would not commit a typed URL and the last
attempt turned into a Google search, so I stopped rather than spend the round on browser
plumbing. A fresh isolated profile may also have failed the app's own authorisation. So
the appearance of this frame is the reader's acceptance run — refresh the page and open a
passage; the structure is tested, the pixels are not.

## M5.1a · Seen, not only tested (2026-10-07)

The appearance of the new frame is no longer unverified. Since the running app cannot be
driven from this session, a **development preview renderer** was built at
`/Users/hao/New-Of-DSH/.work/panel-preview/` (documented in its own README): it loads the
real `client.js`, applies the plugin to a fake Host context, captures the component the
`main` slot registration provides, injects the state `PassagePage` would hold, and
serializes the result to static HTML for a headless-Chrome screenshot.

Rendered and inspected: the compact 46px bar (`← 段落库 · Pascal · Pensées (fragment 277)
原文修订 1 · 83 字符 · ×`), the two panes with their hairline, pane heads (`原文`,
`锚点工作台`, `当前锚点: p1.s1`), the eyebrow/chapter/meta block, the paragraph as a
rule-marked column with the active sentence highlighted, and the detail column scrolling
on its own. The frame does what the port intended.

**Two harness bugs were found by looking at the output** rather than trusting the tool,
which is the point of building it: `className` was emitted verbatim instead of `class`
(so nothing was styled at all), and the fake `t()` interpolated placeholders with an empty
values object, so every label lost its number (`原文修订 · 字符`) before the plugin's own
`format()` could substitute it.

**What the preview does not prove:** the shell's `--dsw-alias-*` tokens are stand-ins, so
colour and spacing read approximately; nothing is interactive; and the app's own layout
around the panel is absent. The reader's refresh is still the acceptance run — but the
frame itself has now been seen.

## M5.1b · The reading pane follows the prototype (2026-10-07)

The reader's rule for this track: **a frontend that does not reproduce the prototype's
interaction model is not accepted.** So the prototype was extracted into a checklist —
`/Users/hao/New-Of-DSH/french-frontend-port-spec.md`, 12 sections, element by element
(element → prototype behaviour → plugin data source → status), with §12 recording the
interaction model as the accept/reject criteria (state, every flow, and eight global
invariants) and §11 recording every deviation from the prototype.

This round moved the source pane onto that checklist:

| Prototype | Now |
|---|---|
| `.paraLabel` = `段落 01` + `当前 · 第 1 句` | `段落 NN` + `当前 · 第 N 句`, and the mark appears **only** in the paragraph that holds the focus |
| Sentence click guarded by `window.getSelection()` | Same guard: a drag-select across sentences no longer collapses the selection |
| `role="button" tabindex="0"`, `Enter`/`Space` with `preventDefault` | Same |
| `.inlineActions` = `解析这句` / `查看解析` | Same wording, decided by whether the current anchor already has an analysis |
| `.paneHead` = `原文` (a strong label) | Same; the hint text I had invented there is gone |
| — | The paragraph anchor stays reachable through the `段落 NN` label, which looks like the prototype's plain span |

**A real defect the preview caught:** `findIndex` returns -1 for "not this paragraph", so
the second paragraph rendered `当前 · 第 0 句`. The preview fixture now carries two
paragraphs precisely so this class of bug is visible rather than hidden by the
prototype's single-paragraph case.

Also removed: a duplicate key block in the English dictionary (my own earlier artefact),
now guarded by a test that counts duplicate keys in both dictionaries.

Evidence: `test/client-reader-pane.test.mjs` (5 tests) and the rendered preview
(`.work/panel-preview/reader.png`). 361 tests green. Registered as staged rather than
skipped: `收起 ↗` ships with the navigation pane (M5.3), `＋ 另开问题` and the paragraph
translation toggle ship with the discussion/translation path (M5.2) — a control that
cannot do what it says has no place in the panel.

## M5-A · The prototype's stylesheet, transplanted (2026-10-07)

The reader looked at the rendered prototype beside the rendered panel and rejected the
panel: **"差的太远了"**. The measurement agrees — the prototype's stylesheet is
**47,458 characters, 719 rules, 246 class names**, while the panel carried 147 hand-written
rules under 117 invented `fr-` names, with **213 prototype class names having no
counterpart at all**. The method was wrong: I had been reading the prototype and writing a
thinner design of my own instead of moving the prototype.

So the design was moved. `.work/panel-preview/transplant-css.mjs` (kept in the repo, so
the transform is reviewable) does exactly two things and nothing else:

1. **Scope**: every selector is prefixed with the panel root `.fr-root`; `:root`/`html`/`body`
   become that root, so the prototype's own custom properties stay inside the panel and
   generic names (`.top`, `.pane`, `.message`) cannot leak into the DSH shell.
2. **Nothing else** — class names, values and the prototype's exact colours are kept, so the
   light theme looks like the prototype. Colour tokenisation is deliberately *not* smuggled
   in: it only becomes meaningful when dark mode is addressed.

| Check | Result |
|---|---|
| Braces before → after | **719 → 719** (scoping adds no structure) |
| Rules | **694** = 496 top-level + 198 inside `@media` |
| Selectors | 761, with only report artefacts outside `.fr-root` (comments, keyframe percentages) |
| Characters | 47,458 → 54,296 (the added prefixes) |

**Two real bugs the transform had, both caught by counting rather than trusting it:**
`@media` bodies were interpolated as the recursion's *result object*, so 198 nested rules
silently became `[object Object]` (719 → 521 braces, first run); and the `@keyframes`
rebuild dropped its opening brace.

**Fidelity evidence:** `.work/panel-preview/transplant-check.html` re-renders the
prototype's *own rendered DOM* (dumped after its scripts ran) with the transplanted
stylesheet under `.fr-root`. Screenshot: the top bar and the whole detail pane —
`← 1/3 →`, `定位 ↘`, the crumb, `＋ 分支`, the actions row with `未接入`, the syntax legend,
the large syntax-coloured sentence, the dark-green `解析` — are identical to the prototype.

**One finding that belongs to M5-B, not to the stylesheet:** the navigation pane collapsed
to a sliver. The rules are present and correct; the prototype simply uses `body` as its
layout root (`100vh`, viewport-absolute insets such as `right:834px`), and the extra
`.fr-root` wrapper perturbs that geometry. The panel is not a document root, so M5-B must
make `.fr-root` the layout root (`position:relative`, container-relative heights, and the
prototype's own grid instead of viewport insets) rather than trusting `vh` units.

## M5-B · The transplanted stylesheet is in the panel (2026-10-07)

The 54 KB stylesheet from M5-A is now part of the client bundle, emitted ahead of the
hand-written block, plus a short **panel adaptation** layer: the prototype assumed it *was*
the document (`vh`/`dvh` heights, viewport-derived insets like `right:834px`), while the
panel is a box inside the shell, so those few rules are re-expressed against the panel box
(`.fr-root{position:relative;height:100%}`, workspace height = remaining space, and the
navigation never squeezed below 380px).

**Three real bugs, all mine, all caught by running rather than reading:**

1. `@media` bodies were interpolated as the recursion's result *object* — 198 nested rules
   silently became `[object Object]`.
2. The `@keyframes` rebuild dropped its opening brace.
3. Embedding the CSS as a template literal: my own adaptation **comment** contained
   backticks, which closed the literal early and left the CSS to be parsed as JavaScript.
   Found by running the suite, not by inspection; the block is now asserted to contain no
   backtick at all.

**Test policy narrowed, deliberately:** the "no raw colours" rule now protects the
hand-written stylesheet (with the constituent-role palette as its one documented
exception) and exempts the transplanted block, which carries the prototype's exact 204
colours. The consequence is recorded rather than hidden: **the panel is light-only until
the prototype's palette is mapped to the shell's dark theme** (handoff M5-G).

**Finding that changes the next milestones** (spec §11a): the prototype writes
`workspace.dataset.view` exactly once and always to `focus`; in that view the CSS hides
`readerPane` and `graphPane` and shows the navigation canvas beside the detail pane. So the
reading surface the reader sees is **paragraph cards inside the navigation canvas**, and
the `readerPane` I ported in M5.1b is dead markup in the prototype — the sentence-focus,
selection-suppression and keyboard behaviour belongs on the cards, while the paragraph
label and sentence ordinal are the card head and the per-sentence markers.

361 tests green.

## M5-B/C · The prototype's shell is in the panel (2026-10-07)

The interim frame I had invented is gone; the panel now builds the prototype's own
structure — and, following spec §11a, **only the parts the prototype actually shows**.

| Prototype | Panel now |
|---|---|
| `header.top.compactTop`: `f.` logo, `法语精读`, `原文 · 路线 ↙` ／ progress, `知识库`, `解析` | Same markup and wording; the title is the passage switcher (the reader's decision) and a close button is the one allowed addition |
| `main.workspace[data-view="focus"]` | Same, with `data-view` fixed to `focus` exactly as the prototype's `setView` does |
| `aside.navigation` + `navHead` (`− 100% ＋ ↗`) + `navStage/navWorld` + `navFoot` (`双指滑动平移 · 捏合缩放`, `全览`) | Same; zoom buttons, wheel/pinch zoom, pointer-drag pan, `全览` fit, and a drag never selects a sentence |
| paragraphs as **cards** inside the canvas, each row carrying its sentence ordinal and per-sentence audio controls | `navCard`: card head `段落 N` + `¶`, rows with `01`/`02`, constituent colours for the focused sentence, and audio controls that are present, disabled and say `接口尚未接入` |
| `readerPane` and `graphPane` hidden in `focus` view | **Not rendered at all** — rendering them would be a departure, and the test now asserts their absence |

**Two defects the render caught, not the tests:** the `知识库` button rendered the raw key
`knowledgeLibrary` (the dictionary's key is `tabKnowledge`), and the card slice in my own
test was empty because a blind rename had left `slice(X, X)` — both fixed.

361 tests green. The two tests that asserted the interim frame were re-targeted to the
prototype's structure rather than deleted, so the port cannot drift back.

**Still to do on the canvas (M5-D):** the cards are rendered in document order, but the
prototype positions them at computed coordinates and draws connectors between them
(`renderGraph()`), so the card *internals* are right while the *layout* is not yet the
prototype's. That work needs the prototype's card markup and node geometry copied exactly.

## M5-D/C · The canvas and the detail pane (2026-10-07)

Both halves of the prototype's reading surface are now built from its own constants and
markup, and checked by rendering side by side with the prototype screenshot.

**Canvas**: `renderGraph()`'s geometry, copied rather than estimated — `rowHeight 215`,
cards at `left:30px` with `height = 56 + n*215`, chapter headings 85px above the first
card, 65px between cards, connector paths `M 240 <from> L 240 <to>` in `#b7c8a7`, and the
`PARCOURS` caption at `570/55`. Card markup uses the prototype's class names
(`paragraphHeading`, `paragraphSentenceRow`, `paragraphSentence`, `lineNumber`,
`sourceText`, `sentenceAudioMini`) with the honest `接口预留` label beside the two audio
controls, and a **toast** (the prototype's 2.6s message) so those controls say what they
are instead of doing nothing.

**Detail pane**: `← 1 / 3 →` and `定位 ↘`, the crumb
(`章节 1 / 段落 1 / 1 · 句子解析`), the branch strip, the actions row
(`查词` · `句法配色` with `aria-pressed` · `▷ 发音` `↻ 重新生成` `未接入`), the **syntax
legend** copied verbatim (`颜色：功能 · 下划线：从句范围` plus the eight role chips), and
`renderDetail()`'s two reading branches: the empty state (sentence + `解析` + `＋ 分支`) and
the analysed state (`句子解析` + status tag + the coloured sentence + `句子译文` + `主干` +
`结构与说明` + actions).

The Host's role labels are mapped onto the prototype's eight names (`subject`, `verb`,
`object`, `predicative`, `adverbial`, `infinitive`, `modifier`, `clause`), so the colouring
comes from the transplanted stylesheet rather than a second palette — and the prototype's
own invariant is kept: the marked-up sentence must still read exactly like the source.

**Two wording mismatches the screenshot caught:** I had kept my own `句译` / `逐句解析`
where the prototype says `句子译文` / `句子解析`; both now use the prototype's words.

361 tests green.

## M5-E(1) · The detail pane follows the selected node (2026-10-07)

`renderDetail()`'s branch structure, driven by the node the reader picked rather than by
whatever sections the panel happens to have:

| Prototype branch | Now |
|---|---|
| No node | legend + the sentence + `解析` / `＋ 分支` |
| `type === 'analysis'` | legend + `句子解析` + status tag + coloured sentence + `句子译文` + `主干` + `结构与说明` + actions |
| `type === 'knowledge'` | `已确认的学习结论` + the answer + `来源：…` + `返回来源讨论` |
| discussion | the quote, the fork hint (`从「…」分出 · 固定至第 N 条消息。兄弟分支不进入本次讨论。`), every message with its label and receipt, `⑂ 分叉` / `提炼结论`, and `✓ 我已理解` / `↺ 标记待查证` |

Selection follows the prototype's own rule (`selectSentence`): clicking a sentence selects
its analysis node **only when that sentence has been analysed**, and nothing otherwise.

**The composer belongs to a discussion node and to nothing else**, exactly as the prototype
toggles it — `composeTarget`, the `上下文` fold, the `draft` textarea, and a foot carrying
the real `backend · model` (or an honest "no model connected") beside the send control.

Three wiring details that had to be got right: my first version called the `setBranchState`
*remote* where it meant the panel's `markBranch` helper; `⑂ 分叉` now records the parent and
the cut on the branch it creates instead of dropping them, with the dialog itself still to
come; and `提炼结论` prefills a knowledge node with the answer text, never rewriting it.

**One documented difference, kept deliberately:** the prototype sends in one press, while
this panel compiles the context first and sends on the confirming press. The reader asked
for "what I saw is what is sent", and that guarantee needs the preview.

Rendered and inspected in the discussion branch (`.work/panel-preview/discussion.png`).
361 tests green.

## M5-E(2) · The three dialogs (2026-10-07)

The prototype's dialogs, markup for markup — no native `prompt`/`confirm` anywhere, which
is exactly what a sandboxed iframe intercepts (and what broke this panel once before).

| Prototype | Now |
|---|---|
| `#modal` `NEW BRANCH` / `新分支` / hint / `标题` / `分支标题` / `取消`·`创建` | Same markup; the hint names the fork's source branch, or `第 N 句` when the branch starts from the sentence |
| `#lookupModal` `查词` / `原文词形或短语` / `取消`·`查阅` | Same; a selected word is offered inside, and the answer comes from the `lookupMot` endpoint — a hit is the stored entry, a miss says how many related forms exist and that they are **never merged automatically** |
| `#actionModal` `提炼结论` + the description 「编辑后确认，生成独立结论，不改写原回答。Ctrl / ⌘ + Enter 确认。」 | Same; it prefills the answer, stores the conclusion as its own record, and never rewrites the message |

Interaction details taken from the prototype's own code:

- `dialogValue()` — trim, refuse empty, refuse over the limit (`最多输入 {max} 个字符`), and
  report either through the toast.
- `handleDialogEnter()` — Enter submits, **but never while an input method is composing**
  (`isComposing` or `keyCode === 229`) and never on a key repeat. A Chinese IME's Enter
  must stay the IME's.
- Ctrl / ⌘ + Enter confirms the conclusion dialog; plain Enter stays a newline.
- `closeActionDialog(restoreFocus)` — focus returns to whatever opened the dialog.

**Three defects the render caught:** `branchTitle` was already a state field (the old branch
composer), so my second declaration was a parse error; the `face` did not expose the
`lookupMot` / `recordConclusion` / `adoptTranslation` endpoints the dialogs need; and my
placeholder edit initially landed on the old composer's input instead of the dialog's, so
the dialog showed `例如：无人称句 il faut` where the prototype says `分支标题`.

Rendered and inspected (`.work/panel-preview/branch-dialog.png`), 361 tests green.

## M5-E(3) · The write receipt (2026-10-07)

The prototype's `receiptHTML()` puts what a model answer changed in the knowledge base
directly under that answer, labelled `本次知识库改动`. The panel now does the same, in the
same markup (`.writeReceipt` / `.knowledgeChangesLabel`), reading the per-message extraction
verdict the Host already records: how many grammar points were filed, or that none were
proposed, or **why the block could not be read** — silence there would make "no reusable
rule" and "unreadable reply" look identical.

The old workbench rendered the same verdict in its own second copy; that copy is gone, so
there is one place for it to live. 361 tests green.

## M5-F · Gestures, anchored zoom and stage resizing (2026-10-07)

The canvas interactions the prototype implements in its own code, now in the panel:

| Prototype | Now |
|---|---|
| `zoomNavigation(factor, cx, cy)` — zoom about a point, `0.2–2.4` | Same formula: the point under the cursor (or the stage centre for the `−`/`＋` buttons) stays still |
| `onNavigationWheel` — ctrl/meta wheel is a pinch | Same, anchored at the pointer rather than the centre |
| `gesturestart/change/end` — Safari's trackpad pinch, anchored where the fingers are, carrying `scale` cumulatively | Same, bound directly on the stage (React has no synthetic `gesture*`), with the two-finger movement panning alongside |
| `ignoreWheelUntil = Date.now() + 100` after a gesture | Same: a pinch is never applied twice by the wheel events it synthesises |
| `syncStageSize()` — move the world by **half** the size difference | Same, driven by a `ResizeObserver`, and skipped while the navigation is closed or the stage has no size |

Tests: `test/client-reading-frame.test.mjs` now pins the clamp, the anchor arithmetic, the
100ms window, the three bound/unbound gesture listeners, and the half-difference rule.
**362 tests green.**

## M5-G(1) · The knowledge library lists in the prototype's shape (2026-10-07)

`renderLibraryList()`, rebuilt in the panel's knowledge surface: the `kbBar` with its
`← 返回解析`, the `知识库` title, the two **counted** tabs (`词汇 N` / `语法 N`), the search
row (`kbSearch` input plus the mastery and scope selects, with the prototype's own option
labels), one `kbRow` per entry (`name` / `subline` / `N 条例句` / mastery), the
`没有匹配条目` empty state, and the `policyNote` line. `kbUI.mode` is modelled: the entry
opens on top of the list and the bar walks back to it.

**Deliberately not rebuilt yet:** the entry card itself still uses the panel's existing
renderer (the prototype's `renderKnowledgeEntry` sections, `entryIndex` chapter nav,
`morphSteps`/`timeline`/`contrastPair` and the conjugation view are the rest of this
milestone).

**A defect in my own preview harness, recorded rather than hidden:** rendering the
knowledge view through `.work/panel-preview` throws
`Cannot access 'navOpen' before initialization`. The cause is the harness's state
injection — it seeds state by *index* for the root component, and `KnowledgeLibrary` is a
nested component whose own `useState` calls land in the same counter. The panel itself is
unaffected (the Host renders it with real hooks), so this milestone is verified by
structural assertions instead: `test/client-reading-frame.test.mjs` pins the library's
class names, both counted tabs, both filters and the mode switch. **363 tests green.**

## M5-H · The short-window scroll container (2026-10-07)

`shortReadingQuery` + `readingScroller()`, as the prototype implements them: below 500px of
height the **whole detail pane** scrolls instead of the inner column, and when the layout
switches the reader's offset **moves to the new container while the old one is reset** — so
nothing jumps and nothing ends up scrolled twice. The short layout is also exposed as a
class on the pane, so the prototype's own `@media(max-height:500px)` rules (transplanted with
the rest of the stylesheet) act on it.

Both containers are addressed by ref rather than by `querySelector`, and the listener is
removed on unmount. **364 tests green.**

## M5-I · The panel is rendered, not only pattern-matched (2026-10-07)

**A real defect, found by the preview harness and by nothing else:** a gesture
`useEffect` had been placed above the state declarations, so its `[navOpen]` dependency
threw `Cannot access 'navOpen' before initialization` on **every** render. In the app that
is the failure card; the 362 string-based tests said nothing, because they read `client.js`
as text and never execute the component.

Two consequences, both fixed here:

1. The effect now sits after the state it reads, and its listeners bind once (the stage is
   hidden with a class rather than unmounted, so the binding stays valid).
2. **`test/client-render-smoke.test.mjs`** — the panel is actually rendered: the bundle is
   loaded, the plugin applied, the component the `main` slot receives is called with a hook
   shim, and three states are exercised (the reading shell, the knowledge view, and a
   discussion node with its composer). A hook-order or temporal-dead-zone bug now fails the
   suite instead of the reader's panel.

The knowledge view, whose nested component had exposed the bug, now renders in the preview
as well. **367 tests green.**

## M5-J · The interim stylesheet and its dead tests are gone (2026-10-07)

The hand-written stylesheet was carrying the frame I invented before the transplant:
`fr-topbar*`, `fr-workspace`, `fr-pane*`, `fr-readingPage`, `fr-detailBody`,
`fr-readerBody`, `fr-chapter`, `fr-eyebrow`, `fr-meta`, `fr-inlineActions`, `fr-paraHead`,
`fr-chip*`, `fr-badge*`, `fr-benchHead/Title`, `fr-buttonSmall` — **26 classes with no
markup left**, and two functions nobody called (`paragraphBlock`, `textNodeBefore`).

Measured before deleting, so nothing live went with them: of 113 classes the hand-written
block defines, 26 were dead and **no rule mixed a dead class with a live one**. 32 rules
removed (16,873 → 13,868 characters), and three tests that asserted only the deleted frame
went with them.

**A real regression the cleanup exposed:** `paragraphBlock` was the only element carrying
`data-paragraph-text`, which the panel's selection measurement walked — so deleting it
removed the selection path. The prototype does not measure from the canvas at all: its
`captureReadingSelection()` reads the selection **inside the detail pane's `.quote`**, is
strict about it (inside a quote, non-empty, at most 100 characters), and `openLookup()`
looks a selected word up **immediately** rather than opening the dialog. All three are now
implemented that way, and the capability list asserts the new markers instead of the old
element. Drag-to-anchor (`createSelection`) now has no canvas source; it is registered as
the next thing to restore on the prototype's own terms.

**364 tests green.**

## M5-K · The transplanted palette is tokenised (2026-10-07)

Step one of item ⑦, and it had to come first: a dark value cannot be written for a colour
that exists only as a literal inside a rule.

`.work/panel-preview/tokenise-colours.mjs` finds every distinct colour in the transplanted
block (204 of them), declares each once as `--fr-cNN` on the panel root with **the
prototype's own light value**, and rewrites the 220 literal uses to `var(...)`. The light
theme is therefore pixel-identical, while every colour is now addressable — which is what a
dark half needs.

Verified in the file itself: **204 declarations, 220 `var()` uses, 0 literals left in the
rules**, and a test now asserts exactly that so a future edit cannot reintroduce a stray
colour. **365 tests green.**

Not done, and not guessed at: the dark values. Flipping luminance mechanically would be a
guess dressed as a mapping — which surfaces invert and how far the role hues move for
legibility on a dark ground are decisions, not arithmetic.

## M5-L · The dark half of the transplanted palette (2026-10-07)

204 dark values, one per token, mapped **by category with the hue preserved** — the rules
are written down in `.work/panel-preview/tokenise-colours.mjs`, not hidden in a formula:

- very light (L ≥ 0.90) → the dark **surface** ramp, keeping their order so depth still reads;
- light-to-mid (0.70–0.90) → the dark **hairline** ramp;
- dark **and near-neutral** (L ≤ 0.45, chroma < 0.10) → **ink**, inverted to a light ink ramp;
- everything else → **accents and role hues**, moved to a lightness that reads on a dark ground;
- saturation is damped per category (a dark ground needs less of it), and near-neutral
  colours keep no cast at all.

**Two real defects in the mapper, both caught by looking at the output:**

1. Near-neutral colours have an ill-conditioned HUE and SATURATION in HSL — a tiny chroma
   divides by almost nothing, so `#fffefa` reads as *fully saturated* and mapped to a
   saturated dark yellow. The chroma now decides: below 0.06 there is no cast to preserve.
2. Classifying every dark colour as "ink" turned `#4d6942` — the **primary button** — into a
   near-white. Dark *and* colourful is an accent, so the chroma splits the two again.

Rendered and inspected (`dark.png`): dark surfaces, light ink, readable role hues in the
legend and the sentence, and the primary button legible as a light green with dark text.
One preview-side mistake worth recording: the first dark screenshot came out light because
the check page had put `data-theme="dark"` on the panel root itself, while the selector
expects it on an ancestor — the stylesheet was right, the fixture was wrong.

**365 tests green**, including an assertion that every token has a dark value and that none
of them is a copy of its light value.

## M5-M · The anchoring question, settled by reading the prototype (2026-10-07)

The leftover from the cleanup — where does drag-select anchoring live now — is answered by
the prototype's own code, and the answer is: **it does not live in the surface the
prototype actually shows.**

The prototype's phrase anchoring is `#selection`: its `mouseup` handler requires the
selection to sit inside `$('source')`, then shows `选中：…` with
`＋ 从这个词组发起问题`. `#source` is the **legacy `readerPane`**, and spec §11a established
that the prototype writes `workspace.dataset.view` exactly once and always to `focus`,
where that pane is `display:none!important`. So the path exists in the markup and is
unreachable in the running prototype.

What the panel therefore does, in the prototype's own terms:

| Prototype mechanism | Reachable? | Panel |
|---|---|---|
| `captureReadingSelection()` — detail pane `.quote`, ≤ 100 chars → 查词 | yes | **implemented** |
| `#selection` → `＋ 从这个词组发起问题` on `#source` | **no** (hidden pane) | **not ported**, per the iron rule against inventing surfaces the prototype does not show |
| The `createSelection` endpoint | — | stays on the Host: the agent tool still anchors phrases; the panel simply has no UI for it |

**Dead subtree recorded rather than deleted blind:** `workbench()` is defined and never
called, and it is the only caller of `analysisSection`, `discussionSection`,
`translationSection` and `branchSection` — each is now called exactly once, from inside it.
Deleting that subtree means deleting ~800 lines, and it *shares helpers with live code*
(`clauseRows` renders the `结构与说明` section, `versionCount`/`branchCount` feed the card
labels), so it must be done with the same measurement discipline as the stylesheet cleanup
rather than by a blind cascade at the end of a round.

## M5-N · The old workbench is gone (2026-10-07)

Deleted by measurement, not by eye: `workbench()` was never called, and a **transitive
closure** over call sites showed it was the only caller of `analysisSection`,
`discussionSection`, `translationSection`, `branchSection`, `paragraphOfAnchor`,
`latestTranslation`, `versionCount`, `branchRows` and `branchFor` — **10 functions, about
23 KB**, with a check asserting that no function in the set still had a live caller.

The inert selection path went with it: the card's `mouseup`/`keyup` handlers fed
`readSelection()`, which measured an element (`data-paragraph-text`) that no longer exists —
so the path could only ever return null. `readSelection` and `anchorSelection` are gone, per
the M5-M finding that the prototype's own anchoring lives in a pane it never displays.

**Two defects my own deletion introduced, both caught by running rather than reading:** the
`async ` keyword of a deleted `async function` was left behind as a bare expression
(`ReferenceError: async is not defined` — the render smoke test caught it, which is exactly
why that test exists), and a comment block was left pointing at a function that no longer
existed. Both fixed.

Five tests and six capability markers described the deleted surface; they were re-pointed at
what the panel actually does (`captureReadingSelection`, the live certainty labels, the
prototype's `.streamText`) rather than deleted wholesale. Two markers described panel
features that no longer have an entry point — whole-paragraph batch analysis and the
backend-availability line — and were removed with that noted here rather than left asserting
nothing.

`client.js`: 315,796 → 295,532 characters. **365 tests green**, and the preview renders.

## M5-O · The knowledge entry header (2026-10-07)

`renderKnowledgeEntry()`'s header, built from what this Host actually stores:
`kbWord`/`detailTitle` for the word or the rule, the `kbIntro` line
(`lemma · part of speech`, or the module), and the `kbMeta` row.

**A model difference handled honestly rather than papered over:** the prototype's
`setMastery` covers words *and* rules, but this Host's model has `mastery`, `askCount`,
`level` and `module` **only on grammar entries** (`GrammarEntryView`; `LexiconView` has no
mastery field at all — checked in `src/types.ts`). So the mastery select, the question count
and the level/module line render **for rules only**, and a word's header shows what a word
actually has. The tab now travels with the entry id so the header knows which it is.

Rendered and inspected in the preview (`.work/panel-preview/knowledge-entry.html`): the
`kbBar` with `条目列表` / `← 返回解析`, the word title, the intro line and the meta row.
**365 tests green.**

Still to come for ③: the card's own sections (`entryIndex` chapter navigation,
`entrySection`/`sectionHeading`, `morphSteps`, `timeline`, `contrastPair`, `entryFold`,
`missingSection`) and the conjugation view — the existing card renderer sits inside this
header unchanged for now.

## M5-P · The card is rebuilt from the Host's headings (2026-10-07)

The panel used to show a card as one `<pre>` blob. It now shows the prototype's structure,
and the sections are recovered from **the Host's own rendering** rather than from a guess:
`renderCard()` emits `§1 词条总览` before each section and `（待补：该章节为空）` for a
required section that is empty, and returns the section list alongside. So:

- `entryIndex` navigation is built from the Host's `sections` — **the order stays the output
  policy's**, never the panel's;
- each section becomes an `entrySection` with the prototype's `entryHeading` and its `num`;
- the Host's gap line becomes the prototype's `missingSection`, so a required-but-empty
  section still shows as a gap instead of vanishing;
- `entryJump()` scrolls the section into view and honours `prefers-reduced-motion`.

A heading is only treated as a section boundary when the Host listed that number, and text
that arrives before any heading is not dropped.

**Verification, stated precisely:** `test/client-reading-frame.test.mjs` asserts the parsing
and the structure. The preview shows the entry *header* but **not the card body**, because
the body is loaded in an effect and the static renderer runs none — so this milestone is
covered by assertions, not by a screenshot, and the next preview improvement is either
running effects or seeding nested component state. **366 tests green.**

## M5-Q · The conjugation view: attempted, reverted, still open (2026-10-07)

I wrote `ConjugationView` — the prototype's `conjugationViewBody()` in React: the person
names, the `BASE 01` rail with `/ipa/` and its persons, `口语 / 对照 / 书写` with
`aria-pressed`, per-row expansion, the honest `发音未接入` state, and a fetch button that is
**the only thing that calls `fetchConjugation`**. The data shapes were read first
(`PhoneticBase{ipa,persons,writtenStem}`, `ConjugationForm{person,written,ipa,baseIndex}`).

**It did not parse, and I reverted it rather than leave the panel broken.** The failure was
in my own JSX: a hand-built `h()` tree with a mismatched closing paren in the base rail and
then in the rows block. I fixed one, introduced another, and ran out of the round's budget
with the file still broken — so the whole insertion was removed, along with the labels it had
brought in (which had also duplicated the pre-existing `conjugationNoData`, caught by the
dictionary test).

Two things this says plainly:

1. The panel is **back to the last green state** — 366 tests, the preview renders — and the
   conjugation view remains the outstanding part of ③.
2. The lesson is mechanical, not conceptual: a 5 KB nested `h()` tree cannot be written and
   corrected by hand-counting parentheses at the end of a long session. It wants either
   smaller pieces (rail first, rows second, each parse-checked) or JSX-shaped helpers
   (`div(props, ...children)`) that make the structure visible — and that is how the next
   attempt should be built.

## M5-R · The conjugation view, rebuilt in small steps (2026-10-07)

Last round this failed and was reverted. This time it went in as four parse-checked pieces,
each one small enough to read:

1. **`conjTop`** — the tense (`PRÉSENT`), the Host's tense label, the phonetic-base count, the
   honest `未接入` audio state, and the `口语 / 对照 / 书写` group with `aria-pressed`.
2. **`conjBaseRail`** — one button per pronounced base: `BASE 01`, `/ipa/`, the persons that
   share it, `aria-pressed`, and `isMuted` on the bases the reader did not choose.
3. **`conjRow`** — one row per person with the prototype's person names, the mode deciding
   whether the pronunciation, the spelling or both are shown, and an opened row repeating
   them in full. A form the Host could not attribute to a base says so (`conjCellMissing`)
   instead of guessing.
4. **The wiring** — the view renders inside the entry's **own conjugation section**, chosen
   from the Host's section list rather than a fixed `§` number, through an explicit
   `extraForSection` slot on the card.

**`fetchConjugation` is called from exactly one place: the reader's button.** Nothing loads
from the network on its own, which is the rule this feature has carried since M4.

Verified by `test/client-render-smoke.test.mjs`, which now also renders the path that composes
the entry header, the Host-split card and the conjugation slot — the same test that caught the
temporal-dead-zone bug two rounds ago. The static preview still cannot show it (the data
arrives in an effect), so this is assertion coverage, stated as such. **367 tests green.**

## M5-S · The interaction model, reviewed line by line (2026-10-07)

The acceptance criteria are §12's checklist and §11's deviation table, so this round audited
the checklist against the code instead of assuming progress.

**The review turned three more items from "not done" into "not applicable", on evidence:**
`#scope` (the 本句/全段 control) lives in `graphPane`, and `#translationToggle`,
`#translationText`, `#source` and `#sentenceMark` live in `readerPane` — and spec §11a already
established that the prototype writes `dataset.view` exactly once and always to `focus`, where
both panes are `display:none!important`. So `toggleScope`, `toggleTranslation` and
`backToSource()` are **unreachable in the running prototype**, exactly like the phrase
anchoring settled earlier. They are registered as legacy-not-ported rather than quietly
dropped or falsely implemented.

**What the review says is genuinely still missing** (reachable, and the prototype really shows
it): entry notes (`saveEntryNote`) — which need a Host endpoint that does not exist, so it is a
wiring gap, not a UI task; the knowledge round-trip restoring sentence and **scroll** position;
`adaptLayout`'s focus move on a compact switch; the translation colouring (`syntaxChinese`),
where the legend button exists but the Host provides no per-constituent translation to colour —
a data gap, not a wiring one; and the card's finer elements (`entryMetaGrid`, `morphSteps`,
`timeline`, `contrastPair`, `entryFold`, the examples area).

Recorded in `french-frontend-port-spec.md` §12.0 (item by item) and §11 rows 13–15. **367 tests
green.**

## M5-T · The knowledge round-trip (2026-10-07)

§12.0's item 2, restored on the prototype's terms: `saveReadingPoint()` keeps the sentence,
**the node the reader had selected**, and the scroll offset of whichever container
`readingScroller()` names; `returnToReading()` puts all three back, applying the offset after
the reading pane is visible again (`requestAnimationFrame`), because setting `scrollTop` on a
hidden element does nothing.

Both directions go through these two functions — the 知识库 button enters and leaves through
them, and so does every `← 返回解析` in the knowledge views — so no path can skip the restore.

`test/client-reading-frame.test.mjs` pins the saved shape, the restored three, the scroller
choice and both entry points. **368 tests green.**

## M5-U · Compact layout and the focus it must not lose (2026-10-07)

§12.0's item 3, plus the rest of the semantics that came with it in the prototype's
`adaptLayout()` / `toggleNavigation()` / `updateNavigationVisibility()`:

| Prototype | Now |
|---|---|
| `compactQuery = (max-width: 1120px), (max-aspect-ratio: 1/1)` | same query, same breakpoint |
| `wideNavPreference` remembers the wide layout's choice | same, and the drawer closes when compact |
| focus inside the navigation at the switch → `navToggle.focus({preventScroll})` | same |
| opening the drawer in compact mode → `navStage.focus({preventScroll})` | same |
| `updateNavigationVisibility()`: `readingPane.inert` in the compact drawer | same, so a tap cannot reach the text behind the overlay |
| `workspace.dataset.navigation = open|closed` | same (`data-navigation`) |

**369 tests green.**

## M5-V · The entry field grid, and what this Host does not have (2026-10-07)

`entryMetaGrid`, the `dl` the prototype puts at the top of a word entry's first section —
built from `LexiconView`, which is what the Host actually stores: `Mot`, `Lemme`, part of
speech, form count, and the content source (`ai-unverified` / `user` / `mixed`).

**IPA and register/frequency do not exist in this Host's lexicon model**, and the honest row
turns out to be the faithful one: the prototype itself renders `未记录` and `未评级` in exactly
those two rows when it has nothing, so the panel says the same thing rather than dropping the
rows or inventing values.

The card's validation errors and hints also moved onto the prototype's vocabulary — errors as
an `entryErrors` list, hints folded into an `entryFold` (the prototype's `details` idiom with
its `policyNote` body) instead of the ad-hoc flag list.

**A wiring mistake of mine, caught by the render smoke test:** I first passed `entry` from
`detailContent()` into `KnowledgeSection`, where that variable does not exist — a
`ReferenceError` on the entry path. The entry is only known inside `KnowledgeEntry`, so the
card is now rendered through a function that receives it, which also removes the stale-capture
problem the `key` hack was working around. **370 tests green.**

## M5-W · The teaching blocks are demo content, and grammar detail is not (2026-10-07)

Item 5b was `morphSteps` / `timeline` / `contrastPair`. Rather than port them and hope, they
were traced to their source:

- `morphSteps` renders `detailedWords[mot].nominal` — a **hand-written demo dictionary** keyed
  by literal words (`'écarte'`), whose own footer labels the senses
  `义项为内置教学示例`;
- `timeline` and `contrastPair` appear only inside `pastInfinitiveDetail()`, a **hard-coded
  lesson** the prototype attaches to one grammar entry id (`g-past`).

So they are renderers for demo *content*, not UI driven by a data model, and this Host stores
no structured equivalent. Porting the markup would mean **fabricating a lesson for the
reader's own entries**, which the iron rules forbid — registered as a data gap instead.

**One thing in the same area was portable, and is now ported:** `renderGrammarDetail()` — a
rule's stored content, its pitfalls, and the prototype's own closing line for an entry with no
extended breakdown. This Host really does store `keyPoints` and a pitfall count, so a grammar
entry now shows `已存规则`, `限制与易混点`, and that sentence verbatim — including when there is
nothing to show, which is the honest and the faithful answer at once.

**370 tests green.**

## M5-X · Verification snapshot, and a regression the snapshot caught (2026-10-07)

**371 tests green.** The reading surface, rendered from the real components:

`f. 法语精读` · `原文 · 路线 ↙` · `1 / 3 句` · `知识库` · `解析` on the bar; the canvas with
`01 章节 1`, the `段落 1` card (`01` numbered, constituent-coloured sentence, `▷ 发音` /
`↻ 重生成` / `接口预留`, the connector, `段落 2`); the detail pane with `← 1 / 3 →`, `定位 ↘`,
the crumb `章节 1 / 段落 1 / 1 · 句子解析`, the branch strip, the actions row, **the syntax
legend** (`颜色：功能 · 下划线：从句范围` and its eight role chips), `句子解析` with its status
tag, the large coloured sentence, `句子译文`, `主干`, `结构与说明` with its certainty tags, and
`重新生成解析` / `＋ 分支`.

**The snapshot caught a real regression:** the legend had disappeared from the analysis and
empty branches. `syntaxLegend()` was still called in the knowledge and discussion branches —
the two I had touched later — but not in `detailReading()`, where the round-15 revert had taken
it out. The prototype opens **every** branch with the legend, so the fix is a wrapper
(`detailReading()` renders the legend, then the body) and the test now pins the legend in all
four branches instead of only in the two that happened to keep it.

This is the case for the side-by-side rendering the acceptance criteria ask for: 370 tests were
green while the panel was missing a piece of the prototype's own composition.

## M5-Y · The knowledge entry never rendered, and the preview found it (2026-10-07)

Working on the preview harness turned up a **panel defect that all 371 tests were happy with**:
in the knowledge entry branch, the `kbBar` was passed to `KnowledgeEntry` as a *second child*
next to the render function, so `typeof children === 'function'` was false and **the entire
body — the card, its sections, the grammar detail, the conjugation slot — never rendered**.
The bar appeared, which is why it looked plausible. Both are now inside the single render
function, which is also the only place that knows the entry.

That is the third time this session that *rendering* found what pattern-matching could not
(the `className` bug, the missing legend, and now this), which is the strongest argument for
the acceptance criterion the reader wrote: render it and look.

**Harness improvements, both earned the hard way:**

- state can now be seeded **per component name**, not only by index for the root, so views
  whose data arrives in an effect can be rendered at all;
- every view declares a **marker its markup must contain**, and a view that renders without it
  exits non-zero — after the knowledge views silently rendered the *reading* view for several
  rounds because my indices had drifted. A fixture that lies now fails loudly instead of
  producing a plausible page.

**Still not screenshot-verified:** the card body inside the entry view. The seeded `card` state
does not take effect yet, so that surface stays assertion-covered — recorded here rather than
claimed as rendered. **371 tests green.**

## M5-Z · The card body still cannot be rendered, and what the probe proved (2026-10-07)

Round 25 was spent on the one verification gap left: the entry view's card body has never been
seen, only asserted. The probe added to the harness prints each `KnowledgeSection` state **after
overrides**, and it settled two things:

- the seed **is** applied — `KnowledgeSection[6]` resolves to the card fixture, with
  `value.kind === 'card'` and its three sections;
- the card's markup still does not reach the page: `fr-nestedCard` / `cardTitle` /
  `§1 词条总览` are absent from the output, while `écarter` (from the entry header, seeded the
  same way) is present.

So the override mechanism works and the card block is not being reached with that value. Two
candidates remain, both cheap to test next time: the component may be rendered in a second pass
where a different override set is active, or a local of the same name may shadow the state. The
component's own source shows **no early return** guarding the card block, so the guard is not a
loading branch.

**Recorded as an open tooling gap, not fixed:** the card body stays assertion-covered, and the
entry view is screenshot-verified only as far as its header. **371 tests green** — the panel
itself is unaffected; this is about how much of it can be *looked at*.

## M5-AA · A crash-on-open, found by seeding far enough (2026-10-07)

The open question from M5-Z is answered, and the answer was not a harness artefact:

```
ReferenceError: extraForSection is not defined      (client.js, the LexiconCard call)
```

Round 20 added `extraForSection` to `LexiconCard` and passed it from `KnowledgeSection` — and
**never added it to `KnowledgeSection`'s own destructuring**. The line only runs once a card is
loaded, so:

- in the app, a reader opening a word entry whose card loads would hit a `ReferenceError`;
- the 371-test suite was green, because the render smoke test only ever called the *root*
  component and never executed `KnowledgeSection` at all.

Fixed by adding the parameter. With the card seeded, the entry view now finally renders end to
end — `§1` / `§2` / `§4` sections, `entryIndex`, `entryMetaGrid`, and the honest
`未记录` / `未评级` placeholders.

**The suite does not guard this yet, and I am not pretending it does.** The smoke test now walks
the tree (so nested components do run), but a control experiment — deliberately breaking the
card line to `LexiconCardX` — still passes, which proves that line is not reached. That test is
kept for what it does (it walks the entry path) with that limitation written into it, and the
gap is recorded here: **the preview harness found this defect; the suite does not yet.**

**372 tests green.**

## M5-AB · The conjugation view, and the route, both seen at last (2026-10-07)

Seeding by component name made two surfaces visible for the first time, and each was worth
looking at:

**The conjugation view renders** (`--view knowledge-entry-full`): `PRÉSENT`, `口语 / 对照 /
书写` with their `aria-pressed`, `2 个语音基底`, the `BASE 01` / `BASE 02` rail with `/e.kaʁt/`
and the persons sharing each base, the rows (`écartons` among them), and `未接入` where the
audio would be.

**Two fidelity defects the seeding exposed, both now fixed:**

1. The head printed the Host's tense *code* in capitals (`PRE`) where the prototype shows the
   French name. A tense code is named, not invented: `ind:pre → PRÉSENT`, and an unknown code
   falls back to itself.
2. `conjBaseCount` / `conjModeOral` / `conjModeBoth` / `conjModeWritten` / `conjBaseLabel` had
   gone with the round-15 revert, so the base count and the mode group were rendering their raw
   keys. They are back in both dictionaries.

**A design problem removed on the way:** the conjugation slot took its lemma from a
**module-level `let`** filled in by an effect. That is both a staler read and shared state
between panel instances; it now comes from the entry the render already holds.

**And the screenshot showed the route:** the portrait window (1400×1400) matches
`max-aspect-ratio: 1/1`, so the compact drawer opened over an inert reading pane — and inside
it, for the first time, `PARCOURS` with its nodes (`句子解析 · 草稿`, `ne … pas · 待理解`) and
their connectors, drawn by the geometry ported in M5-D.

**372 tests green.**

## M5-AC · The duplicate library chrome, and a leaked key (2026-10-07)

A wide-window screenshot of the entry view (`--view knowledge-entry-full`, 1600×1000 so the
compact drawer stays closed) made two more things visible that assertions had not:

1. **`内容来源: contentUser`** — a raw label key on the page. The two `contentUser` /
   `contentMixed` entries I meant to add in round 20 never reached the dictionaries, so the
   field grid printed the key. Both dictionaries have them now, and the grid reads
   `读者填写`.
2. **The old library chrome was still rendering inside the entry view** — its own title
   (`词汇库与语法库`), hint, count line, and the `词汇库 / 语法库 / 变位` tab group. All of it
   duplicates what the port provides: the list has `kbTabs`, the entry has `kbWord`/`kbIntro`,
   and the conjugation lives inside the entry's own `变位` section. The title/hint/count block
   is deleted; the tab group is hidden pending its removal together with the tab-driven code
   paths it belongs to, which is a smaller job than deleting the JSX and leaving dead state.

The screenshot also confirms what was ported: the crumb (`知识库 / 词汇`), `écarter` with its
`écarter · 动词` line, `条目列表` / `← 返回解析`, the card (`écarter · 词卡（按输出规范渲染）`,
`§1 §2 §4`, `收起`), the `entryIndex` navigation, and the field grid with the honest
`未记录` / `未评级` rows.

**372 tests green.**

## M5-AD · A destructive edit that went wrong, and what it cost (2026-10-07)

Round 29 set out to delete the old `conjugationPanel` and its tab-driven paths — the last
duplicate chrome in the knowledge surface. **The deletion cut the wrong span and left the file
unparseable.**

Why: I located the function's end by **counting braces**. That is unsafe in this file, because
braces also appear inside template literals, strings and regular expressions — exactly what a
panel renderer is full of. The matcher stopped in the wrong place, removed a fragment, and left
an orphaned expression behind.

What I did about it, in order:

1. Tried a surgical repair (removing the dangling parenthesis) — the parse error simply moved to
   the next line, which is the signature of a wrongly-bounded cut rather than one stray token.
2. **Restored the last known-good copy** (`/tmp/keep2.js`, taken before the round-26 control
   experiment, 372 tests green) rather than keep editing a broken file.
3. **Replayed rounds 27 and 28** from the patches in this record: the tense-name mapping,
   `conjBaseCount` / `conjMode*` / `conjBaseLabel` labels, the closure-based lemma (replacing the
   module-level `let`), and the `contentUser` / `contentMixed` labels.
4. Re-verified: **372 tests green**, and the preview shows `PRÉSENT`, `口语`, `个语音基底`,
   `BASE 01`, `读者填写`, no raw key, and `conjugationView` rendering.

**What is still not done as a result:** the removal of the old library chrome (title / hint /
count / `词汇库 · 语法库 · 变位` tabs) and of `conjugationPanel` — the round-29 goal itself. It is
reverted to the state where the title/hint/count block is removed and the tab group is hidden;
the tab group and the dead panel still exist in the source.

**The method change that must go with it:** locate a function's end by **indentation** (the next
line at the same indent that starts a declaration) rather than by brace counting, and take a
snapshot before any destructive edit. A snapshot existed this time only by accident, which is why
the cost was two rounds of replay instead of more.

## M5-AE · The old panel is gone from the entry, and where the rest of it lives (2026-10-07)

Round 30 finished the removal that round 29 botched, this time **with a snapshot taken first and
the spans found by indentation rather than by counting braces**:

| Removed | How it was located |
|---|---|
| `conjugationPanel` and its helpers (80 lines) | the next line at the same indent starting a declaration |
| the old `词汇库 / 语法库 / 变位` tab group (17 lines) | the nav element's own indent and its closing `),` |
| the dead `tab === 'conjugation' ? conjugationPanel() : null` call site | exact line |
| the old title / hint / count block | the `fr-anchorRow` element's indent and its closing `),` |

`conjugationPanel` no longer exists anywhere. The internal `tab` state became a **prop** (the
library list owns that choice), and the same pass **restored two behaviours the new
`ConjugationView` had dropped**: the `pending` state (a previous fetch that never finished — the
Host distinguishes it from "no data") and the per-person `missingPersons` gaps. Two tests that
had been written against the old inline panel were re-pointed at the new renderer's behaviour
rather than deleted, and one of them had a real weakness worth recording: its "does this label
have a value" regex required the key to start a line, so a key sharing a line with another read
as missing.

**Where the remaining old panel lives — measured, not guessed:**

- `libraryShell` (around line 3370) still renders the old `段落库 / 知识库` page, with its own
  `fr-tabs` group and its own `libraryTab` state;
- its 知识库 tab renders `KnowledgeSection` (line 3391) — the same component the new entry view
  uses, but without the entry props it now expects;
- that is why `词汇库与语法库` still appears once in the rendered page even after this round's
  removals: it comes from the **library page**, not from the entry view.

Deleting `libraryShell` is a larger job than this round could take — it also means deciding where
the passage list, new-passage form, import and export go (the reader's decision was the header
title as a switcher). It is recorded here with its anchors so the next attempt starts from facts.

**372 tests green**, and the knowledge surface reachable from the entry view is now only the
prototype's.

## M5-AF · The passage switcher, in the prototype's own clothes (2026-10-07)

The reader's decision (plan §7 item 5) was that the brand title opens the passage list, and that
the old `段落库 / 知识库` page goes away. This round built the first half.

**The prototype has no passage list** — it reads one demo text — so this is one of the allowed
extra capabilities, and the rule for those is that it must not invent a look. It therefore uses
only vocabulary the prototype already has: `modalBackdrop` / `modal` / `modalFoot` for the
overlay, `kbBar` / `kbReturn` for its mode switch, `kbRows` / `kbRow` / `name` / `subline` /
`kbStatus` for the list, and `kbField` for the new-passage form. Not one new class name.

It also reuses the panel's own machinery instead of duplicating it: `openPassage(id)` to switch,
`submit` for the new-passage form (which keeps the preview-then-save guarantee), `exportBackup`
and `exportSources` for the backup buttons.

**Three defects of my own, all caught by running:** I called a handler that does not exist under
that name (`exportAll` is the *label*; the function is `exportBackup`), and I added
`titlePlaceholder` / `sourcePlaceholder` / `sourceTextLabel` to the dictionaries where the
first two already existed — the duplicate-key test caught both the zh and the en leftovers.

**Still to do for the plan's item 5:** deleting `libraryShell` itself (the old page with its own
`fr-tabs` and `libraryTab`), and deciding where its remaining jobs live. The switcher now
provides the passage list, new-passage form and both exports; **archiving** is the one job it
does not yet carry.

**372 tests green**, with the switcher's vocabulary and handler reuse pinned by a test.

## M5-AG · Archiving was unreachable (2026-10-07)

Planning the `libraryShell` deletion meant listing what that page alone provided — and the
measurement turned up something else: **`archivePassage` had no caller anywhere in the panel.**
The endpoint is declared in the contract and the Host implements it; the face never exposed it,
`PassagePage` never took it as a prop, and no button ever invoked it. Archiving a passage was
simply not possible from the reader's side.

It is now reachable from the passage switcher, on the prototype's own vocabulary (the row gains a
`small quiet` button rather than a new class), and it passes **`expectedSourceRevision`** — the
revision the reader was looking at — so archiving a passage that changed underneath is *refused*
and reported, instead of applied to work the reader never saw.

The handler reuses the panel's existing machinery: `refreshList` to update the list, and clearing
the active passage when the reader archives the one they are reading.

**373 tests green**, with the new path pinned: the handler's shape, the revision guard, the
conflict branch, the face exposure, and that the switcher is the only place that calls it.

## M5-AH · The library page cannot be deleted as a span, and why (2026-10-07)

Round 33 set out to delete `libraryShell` / `brandBlock` / `passageListCard` / `composerCard`,
and **reverted it**. The deletion parsed, but five tests went red in a way that named the reason:
`the backend list is read`, `the model list is read`, `the stream reader exists`.

Those two helpers — `loadBackends()` and `loadModels()` — are **defined inside that region**, not
next to it. They are called from an effect (line 3170) and serve the composer the port kept, so
deleting the old page's JSX by span took the machinery with it. Archiving had the same shape two
rounds ago: the endpoint existed, nothing called it.

**So the rule for this particular deletion is not "cut fewer lines", it is "move what lives
inside first".** The next attempt must, in order:

1. lift `loadBackends` / `loadModels` (and anything else shared) out of the region and verify the
   composer still works;
2. delete the four JSX functions only then;
3. re-run the suite after **each** of those steps rather than at the end.

A snapshot existed (`.work-snapshot-r33.js`), so the cost was one round, and the panel is back at
**374 tests green** with the preview rendering. The old page is still there — registered, not
silently kept.

## M5-AI · The third attempt at the same deletion, and the tool that keeps failing (2026-10-07)

Round 34 followed round 33's own instruction — move the shared machinery out first — and
**reverted again**. The measurement was right this time: eight helpers
(`loadBackends`, `loadModels`, `loadDiscussion`, `previewTurn`, `sendTurn`, `receiveStream`,
`startBranch`, `markBranch`) really do live inside `composerCard`'s span.

But moving them as a **block** by line spans took 825 lines instead of the eight functions,
because each span's end was decided by a heuristic — "the next line at this indent that starts a
declaration" — and **comments, blank lines and continuations defeat it**. Three tests went red,
naming code that has nothing to do with the old page (`clauseRows` among them).

**Three attempts, three different mechanical failures, all mine:**

| attempt | tool | what went wrong |
|---|---|---|
| round 29 | brace counting | braces inside template literals stopped the matcher in the wrong place |
| round 33 | indentation span delete | took shared helpers that live inside the region |
| round 34 | indentation span move | the span-end heuristic over-reached and moved neighbours |

**What that says is that this is not a line-surgery job at all.** The next attempt should be a
refactor: move **one** helper per step, run the suite after each, and stop treating "find the end
of a function" as a text problem when the file is JavaScript — where the only reliable answer is
a parser, or a human-sized step with a test after it.

The panel is back at **374 tests green** from the snapshot (`.work-snapshot-r34.js`), the old page
is still present and registered, and two rounds of budget have gone into reverts. If the deletion
is to continue, it should be with the step-per-helper method above, not another span.

## M5-AJ · The switcher is the front door, and the old page is unreferenced (2026-10-07)

The `libraryShell` deletion failed three times as line surgery, so this round did the part that
actually changes what the reader sees, **without deleting anything**:

- the root render is now `frontDoor()`: `readingShell(activePassage)` when a passage is open, and
  otherwise the brand bar plus the passage switcher. The old `段落库 / 知识库` page is **no longer
  what the reader lands on**;
- `libraryShell(` now appears exactly once in the file — its own definition. It is unreferenced
  dead code, registered as such, and removing it stays a refactor for a later round.

Rendered and inspected: the front door shows the brand bar over the backdrop and the switcher
with its mode toggle (`新建段落`), the passage row (`Pascal · Pensées (fragment 277)`, `83 字符`,
date), the per-row `归档`, and the foot (`导出完整备份` / `仅导出原文` / `取消`).

**Two defects the screenshot caught:**

1. **Nested buttons.** `kbRow` is a `<button>` in the prototype, and I had put the archive
   `<button>` inside it — invalid HTML, which the browser resolves by hoisting the inner one out
   (the render showed `归档` below the title). The row is now a `kbRow` button beside its own
   archive button, inside a flex wrapper carrying only an inline style: **no new class**.
2. **The harness's own self-check was too weak.** Its markers were bare class names, so
   `library: 'fr-shell'` matched the *stylesheet* and the old view kept passing after its page
   stopped being rendered. Markers are now markup (`class="..."`), and the `library` view — which
   no longer has a page to render — was removed rather than re-pointed.

**374 tests green.**

## M5-AK · The old page is gone — the method that worked (2026-10-07)

Three span-based attempts failed (M5-AD / M5-AH / M5-AI). This round used the method those
failures prescribed, and it worked first time:

**One change per step, a parse check and the full suite after every one, and an automatic
rollback of that single step if anything failed.**

| step | result |
|---|---|
| move `loadBackends` | ✓ tests green |
| move `loadModels` | ✓ |
| move `loadDiscussion` | ✓ |
| move `previewTurn` | ✓ |
| move `sendTurn` | ✓ |
| move `receiveStream` | ✓ |
| move `startBranch` | ✓ |
| move `markBranch` | ✓ |
| delete `brandBlock` (9 lines) | ✓ |
| delete `passageListCard` (41) | ✓ |
| delete `composerCard` (71) | ✓ |
| delete `libraryShell` (49) | ✓ |

**`libraryShell` / `brandBlock` / `passageListCard` / `composerCard` no longer exist in the file**
— zero references — and the eight helpers that lived inside them are preserved outside. **374
tests green**, and both the front door and the reading surface still render in the preview.

Why the earlier attempts failed and this one did not is worth stating plainly: the difference was
never the span arithmetic, it was **step size and verification frequency**. A 825-line block move
had one chance to be right; eight single moves each had a test that could say no.

**This closes the last of the registered dead code**, and with it spec §0's rule that the old
`段落库 / 知识库` panel is deleted rather than kept alongside.

## M5-AL · A full sweep of every view, and what it caught (2026-10-07)

All seven preview views are now rendered and each passes its markup marker:

| view | output |
|---|---|
| `reading` | 86,311 bytes |
| `discussion` | 86,295 |
| `branch-dialog` | 86,771 |
| `front-door` | 80,614 |
| `knowledge` | 85,426 |
| `knowledge-entry` | 85,099 |
| `knowledge-entry-full` | 88,101 |

The sweep was not a formality — **it caught four fixture defects, all mine, all silent before**:

1. `discussion` and `branch-dialog` had stopped rendering: adding `switcherOpen` / `switcherMode`
   shifted `selectedNode` (46 → 50), `branchDialog` (47 → 51) and `branchHint` (49 → 53), so the
   maps were seeding booleans with node objects. Their markers failed **loudly**, which is the
   whole point of the marker check added in M5-Y.
2. `KnowledgeSection`'s own indices moved down one when its `tab` state became a prop; the seeds
   still pointed at the old positions.
3. The card fixture lacked `sources` / `drafts`, so the source picker called `.map` on nothing.
4. My cleanup of (2) and (3) deleted the `ConjugationView` seed along with them, which is how
   `PRÉSENT` / `BASE 01` disappeared — noticed only because the sweep compares what each view is
   *supposed* to contain.

**The lesson is the same one this session keeps teaching**: index-based seeding is fragile, and a
view that renders *something* is not a view that renders the right thing. Markers plus a full
sweep are what make the difference visible.

**374 tests green.**

## M5-AM · The reader opened the panel and saw nothing (2026-10-07)

The first look at the real app showed the bug this record had not caught: **the side panel was
empty below the top bar** — brand, title, close button, and then nothing.

Cause, and it was mine: when the switcher became the front door (M5-AJ), it was mounted as
, and  starts  and is only set by a
click. The reading shell always has a passage to render, so **the empty case had no content at
all**: no passage open, and no switcher either. The preview had been passing this path only
because its fixture seeded  — a fixture doing the work the component should
do.

Two fixes, both verified:

1. the front door renders  **unconditionally** (with a passage open, the
   switcher still appears only when the title is clicked, which is the reader's decision);
2. the harness **no longer seeds ** for that view, so the marker check now proves
   the front door renders the switcher by itself. A fixture that props up the component hides
   exactly this class of bug.

**And a second one from the same screenshot:** the per-row  wrapped to two lines ( /
) once the title took the width; the button is now  with 
(inline style, no new class).

**374 tests green.**

## M5-AM · The reader opened the panel and saw nothing (2026-10-07)

The first look at the real app showed the bug this record had not caught: **the panel was empty
below the top bar** — brand, title, close button, and then nothing.

Cause, and it was mine: when the switcher became the front door (M5-AJ), it was mounted as
`switcherOpen ? passageSwitcher() : null`, and `switcherOpen` starts `false` and is only set by a
click. The reading shell always has a passage to render, so **the empty case had no content at
all**: no passage open, and no switcher either. The preview had been "passing" this path only
because its fixture seeded `switcherOpen = true` — a fixture doing the work the component should
have done.

Two fixes, both verified:

1. the front door renders `passageSwitcher()` **unconditionally** (with a passage open, the
   switcher still appears only when the title is clicked, which is the reader's decision);
2. the harness **no longer seeds `switcherOpen`** for that view, so the marker check now proves
   the front door renders the switcher by itself. A fixture that props up the component hides
   exactly this class of bug.

**And a second one from the same screenshot:** the per-row `归档` wrapped to two lines once the
title took the width; the button is now `flex: 0 0 auto` with `white-space: nowrap` (inline
style, no new class).

**374 tests green.**

## Objective audit (2026-10-07)

Everything the handoff names, with the evidence that it exists. **346 tests green.**

| Handoff item | Status | Evidence |
|---|---|---|
| M1 fork-chain history | done | `context-fidelity.test.mjs` — three-level fork, `historyCount` 6 where the old code gave 4 |
| M1 preview = sent, byte for byte | done | same file — `sent === preview.prompt`, question quoted once |
| M1 content fingerprint | done | same file + `digest.test.mjs` (SHA-256 vs `node:crypto`) |
| M1 sentContext retention + migration | done | same file — 205 turns, oldest readable; migration with marker |
| M2 single-turn extraction closes the loop | done | `answer-extraction.test.mjs`, `ask-extraction.test.mjs` |
| M2 idempotent per question | done | same file — one message pair, one run, one count |
| M2 failure visible and retryable | done | verdict on the message and in the panel; a retry re-asks, which the plan rules is the retry |
| M3 durable job, idempotent retry, cancel, restart recovery | done | `generation-lifecycle.test.mjs` (10 tests) |
| M3 `typertGateway.stream` streaming | done | `stream-ask.test.mjs` (Host), `client-stream.test.mjs` (client) |
| M4 phonetic bases from real data | done | `conjugation-data.test.mjs`, `conjugation-fetch.test.mjs`, and a **live walk**: `parler` → `/paʁl/`×6, `finir` → `/fini/`+`/finis/`, `venir` → `/vjɛ̃/`+`/vən/`+`/vjɛn/` |
| M4 caching and honest failure states | done | `conjugation-store.test.mjs` — `ok`/`partial`/`rate-limited`/`failed`/`no-forms`, and `no-data` as a first-class answer |
| M4 audit trail for a fetch | done | provenance + fetch state per lemma; `fetchStatus` in the panel |
| Every milestone ran tests and updated this file | done | the sections above |

### Verified deviations from the plan, stated plainly

1. **The pronunciation source is French Wiktionary, not Larousse/CNRTL.** Measured:
   Larousse's conjugation pages carry no IPA at all, CNRTL was already unreachable from
   here, and Wiktionary's form pages carry both the pronunciation and the inflection
   slots. The intent — runtime-fetched, cached, attributed pronunciation data with
   honest failure — is met; the named sites could not meet it. This was reported when it
   was found.
2. **Lexique 3.83 is used as test fixtures, not as the runtime source**, because the
   Host's `web` service takes a URL and nothing else (no headers, no Range), so a 27 MB
   distribution cannot be ingested through it.

### Live open at version 2 (2026-10-07, after the reader restarted the Host)

The restart happened, so the open at version 2 is no longer a claim:

| Check | Observation |
|---|---|
| The Host loaded the plugin | `cordis_inspect_query` → host / `Tool` / `listTools` returns **`french_reader`**. A failed `apply()` would have thrown and registered nothing, so the domain opened |
| The client half activated | client / `Slots` / `listSubTree {root: 'main'}` lists the occupant **`french-close-reading:ui`, key `french-close-reading`, `active: true`** beside `conversation` and `paper-reader` |
| The stored library survived the version bump | `~/.dsh/storages/french_reader/records/` still holds **22 records**, and every file's mtime is still 2026-10-06 22:32 — opening at version 2 neither rewrote, discarded nor re-stamped anything |
| No load failure this time | `~/Library/Logs/DeepSeek Harness/` has **no file newer than 2026-10-06**. The `missed the module table` / `failed` lines that are present belong to the 2026-10-06 boot failures already recorded above, not to this restart |

**Still not proven from here:** that the panel *reads* those records back rather than
showing an empty library. A discarded record reads as absent, not as an error, so
`compatibleVersions: [1]` is doing the work — verified against the installed backend's
own source (`acceptedStamps`/`parseRecord`) and against the real files in
`test/production-data.test.mjs`, but the live read is something only the reader can see.
Opening the library is that check.

### Not verified by me, and therefore not claimed
- **No visual check of anything built in the last two rounds**: the conjugation tab, the
  streamed text, the per-cell gaps, the extraction verdict. The structure is tested; the
  appearance is not.
- The panel renders the grammar verdict, the partial status and the stream; whether they
  read well is a judgement only the reader can make.






## M6 · Canvas rows are measured, and the canvas opens at the prototype's 65% (2026-10-07)

Two layout defects on the navigation canvas, both confirmed by rendering before they were
touched, both fixed in `client.js` only:

1. **Long sentences overlapped.** `renderGraph()`'s `rowHeight 215` fits the prototype's
   demo sentences; a real sentence (the Hacking passage, ~300 characters) wraps to nine
   lines and overflowed its fixed 215px row into the next one — the "缩放排版" defect the
   reader reported. The pitch is now the **minimum**: rows render with `min-height`,
   a layout effect measures every `.paragraphSentenceRow`'s real height, and
   `navGeometry()` lays cards, connectors and route origins out at the measured heights.
   The measurement converges in one pass (a row's natural height does not depend on the
   pitch it was rendered with) and is skipped while the navigation is closed
   (`display:none` reports zeros). Verified against real Chrome with the real component
   mounted (`.work/panel-preview/live.mjs`, LONG_SENTENCES fixture): before, the rows
   overlapped exactly as in the reader's screenshot; after, the card grows around the
   text at 100% and at 64%.
2. **The canvas opened at 100%, the prototype opens at 65%.** A deviation found while
   chasing defect 1: the prototype's initial camera is `{x:20, y:20, scale:.65}`, which
   keeps the whole card column inside a navigation narrower than 450px. The panel had
   `{x:24, y:28, scale:1}`, so at panel widths where the navigation is 380–450px the
   stage clipped the cards mid-glyph. The initial camera is the prototype's own now.

Evidence: `node --test test/*.test.mjs` → **374/374**; `french-prototype-verification.cjs`
and `french-prototype-sandbox-regression.cjs` both PASS; live-app check after re-enabling
the plugin (plugins page toggle, which re-reads the client bundle): canvas opens at 65%,
sentence rows no longer overlap, sentence click still focuses.

**Preview harness note:** `navRowHeights` is declared **last** among `PassagePage`'s
states on purpose — `render.mjs` seeds state by index, and inserting it anywhere else
shifts every seeded index after it (caught when the `discussion` view lost its marker).

## M7 · Panel-relative layout, camera that cannot lose the text, wired backend, and a real start page (2026-10-08)

Four defects, all first reproduced in the running app (reader's report: "缩放条件下不行",
plus the start page being "不好看也不好用"):

1. **The two panes overlapped.** The stylesheet's breakpoints measured the *window*
   (`@media (max-width:1120px)`, `100vw`), but the panel lives in a shell whose sidebar is
   not part of that arithmetic: at a 1280px window the workspace is ~998px, so the 380px
   navigation and the 780px detail pane overlapped by ~190px and the detail text was cut
   mid-glyph. **Fix:** width breakpoints are container queries on `.fr-root`
   (`container-type:inline-size`), pane widths use `100cqw`, and the JS compact check
   measures the root element with a ResizeObserver. The compact breakpoint is 1190px of
   *panel* width — the overlap-free bound is nav(380) + detail(780) + margin(30), not the
   prototype's window-based 1120. Verified in the live harness with a fake 282px shell
   sidebar: compact sheet at 998px, wide columns at 1600px, portrait sheet at 700×900.
   Caught while doing this: a pre-existing **unclosed `@media(max-width:960px)`** block in
   the plugin's own styles had silently swallowed the two rules after it; it is closed now.
2. **Button zoom ran the camera off the content.** `zoomNavBy` zoomed about the stage
   centre, so zooming in pushed the card column past the stage's left edge (ordinals,
   borders and headings clipped; the reader lost the text). **Fix:** the buttons anchor on
   the reading column — the card column's left edge (world x = 30) keeps its screen
   position, and the line near the top stays near the top — and every camera move (buttons,
   wheel, pinch, drag, stage resize, locate) is clamped so the world can never leave the
   stage entirely (`clampNavCamera`). Verified in-app: two zoom-in presses to 102% keep
   the whole card on screen.
3. **「后端没有接好」was literal.** `loadBackends()` picked the first available backend but
   nothing ever called `loadModels()`, so `model` stayed `''` and every generation button
   (`解析`) was permanently disabled. The fix is one line of wiring: picking the backend
   loads its models (`void loadModels(first.backend)`).
4. **The start page was a cramped modal.** The front door is now a page: eyebrow +
   `开始一段精读` + the immutable-source hint, the new-passage composer already open in a
   card, and the saved passages below with excerpts (a list of bare titles was not
   recognisable). The composer and the rows are shared with the switcher dialog
   (`passageComposer()` / `passageRows()`), so the two never drift apart. New locale key:
   `startTitle` (zh/en). The switcher dialog itself is unchanged in behaviour.

Evidence: `node --test test/*.test.mjs` → **374/374** (the compact-breakpoint test now
asserts the ResizeObserver + container-query wiring; one assertion updated, none dropped).
Live harness (`.work/panel-preview/live.mjs`, real React mount, effects running):
front door `?stay`, compact sheet `?nav`, button zoom `?nav+zoomin`, wide `1600px`,
portrait `700×900`. In-app after the reader's restart: front door, compact sheet, and the
anchored 102% zoom all confirmed by driving the window directly.

**M7 补遗（同一轮）**：解析的反馈渲染也断了——`analysisError` / `analysisStatus` 被 set 后在阅读视图**没有任何渲染点**（`error` 也只在起始页渲染），一次失败的生成对读者完全无声。现在这三者渲染在 `detailScroll` 顶部。实测发现过程：修复接线后点击解析，生成跑了约 75 秒但没有写入（coverage 仍 0/2），而读者端什么都看不到——拒绝原因（门禁/模型/解析）只有显示出来才能继续诊断。

## M8 · Mouse click on canvas rows was swallowed; empty-state messaging lied (2026-10-08, Codex 实机验收 FR-01/FR-02)

Codex reproduced both against the live plugin:

- **FR-01**: tapping a sentence row with the mouse never selected it (detail stayed on the
  passage, 解析 stayed disabled), while keyboard activation of the same button worked.
  Cause: `onNavPointerDown` called `setPointerCapture` on the stage unconditionally, which
  retargets the derived `click` to the stage — every child button (sentence, paragraph
  heading, audio controls) lost its tap. Fix: the press only records; once the pointer
  actually travels past the 3px threshold a real drag is declared and capture is taken
  then, so panning still works outside the stage and only a genuine drag suppresses
  sentence selection.
- **FR-02a**: with a sentence selected but not yet analysed, the detail pane hid the
  sentence and showed 「选中一句话再生成解析」 — instructing the reader to do what they had
  just done. The empty branch now keys on the anchor alone: a sentence anchor always shows
  the sentence quote plus an explicit 尚未解析 line; the hint text belongs to
  paragraph/passage anchors only.
- **FR-02b**: 下一句 from the passage anchor was a dead control (`at === -1` returned
  early). It now enters the first sentence; 上一句 at the very start still stays put.

`node --test test/*.test.mjs` → 374/374 after the edits. 实机复验由 Codex 执行。

## M9 · 解析运行全程可见、可取消、有界（2026-10-08，Codex 实机 FR：解析卡死）

Codex 实测：点解析后「解析中…」持续 3 分钟以上无任何反馈，覆盖仍 0/2。按层核对请求链
（面板 → typert RPC → Host controller → DshLlmBackend.generate → provider 流）：

- **模型路由**：`splitRoute(providerId/modelId)` → `llm.prepareCall`；路由解析失败会快
  速返回 `finish:'error'`，不是卡死层。
- **流结束**：`generate` 的 `for await` 在等 provider 的终帧；provider 思考时间长（解析
  发给的是注册表第一个模型，可能带长思考）且**没有超时**时，整条链就停在这一层——
  unary RPC 永不返回，面板永远「解析中」。另发现静默结束（无终帧）会被误当 `stop`。
- **请求超时**：改造前**各层均无**。取消通道其实存在——typert 调用桩把**可选末参**当
  caller AbortSignal（`cancellation: { parameter: 'signal' }`），abort 一路传到 provider
  流，但面板从未传过。
- **保存返回**：parse/store 快速且只在生成返回后执行，从未到达。

改造（client.js + src/generation.ts + src/controller.ts）：

1. **运行面板**：等待期间显示「等待模型返回 · 已用时 N 秒」+「取消」按钮；计时每秒
   跳动。解析按钮与运行状态不再可能永久悬停。
2. **超时**：单句 180 秒（ANALYSIS_TIMEOUT_MS），段落运行按缺句数成比例放大；超时走
   同一 abort 通道，提示可重试。
3. **取消/生命周期**：AbortSignal 经 face 透传到 RPC（桩的可选末参），取消即断整条
   链、不写入任何内容；运行绑定其篇目与句子——切换篇目/句子即取消；面板关闭即取消；
   运行中拒绝第二次启动（同步锁，防双跑）；过期运行的 UI 更新一律丢弃（isCurrent 守卫）。
4. **诚实标注**（Host）：`cancelled` 不再伪装成 model-reply-not-json；`max-tokens` 截断
   回复标为 `model-truncated`；**流无终帧即失败**（`stream-ended-without-finish`），
   对齐问答流自己的规则——静默永远不算成功。质量校验一条未放宽。
5. **模型可见可选**：阅读操作行新增「模型」下拉（当前后端全部模型，运行中禁用）——
   生成接线此前完全隐式（第一个可用后端、注册表第一个模型），用户既看不到也改不了。

附带发现并记录：`analyseParagraphRun`（段落级）至今没有任何按钮调用（死接线，与旧
libraryShell 同类），本轮给它套上同一套有界机制但未新增入口。

374/374 全绿（一处源码字面量按测试锚点还原）。运行产物：client.js + lib/*.js（tsc -b
重建并核对含新标记）。重载：插件关→开或重启应用。实机复验由 Codex 执行。

## M10 · 证据落地：管线其实通了；开关重载不覆盖宿主；取消语义存疑（2026-10-08，Codex FR：180s 空等取证）

本轮不再做代码推断，直接查真实存储（`~/.dsh/storages/french_reader/records/`）：

1. **解析管线端到端可用（实证）**：`sentences_e427820d-…json` 里有一条 **2026-10-08T04:24:59Z
   成功存入的 p1.s2 解析**——完整译文（"具体而言，我将援引「社会医学的诞生」作为参照。"）、
   1 从句、11 成分（带完整功能标注），门禁通过。Codex 观察到的 0/2 是写入之前的读数。
2. **客户端显示「取消」的运行在后台完成并写入了**（即上面这条）——与「取消即写入不了」的
   M9 承诺不符。客户端中止是否到达宿主一时尚不能证（见 3），UI 文案已改为诚实表述：
   「已停止等待这次解析。后台运行若自行完成，重新选中本句即可读到。」
3. **插件关→开只重载客户端，不重载宿主 lib**（实证）：整库**零 generationJob 记录**——
   M9 的宿主留痕（begin/phase/progress/finish）在 Codex 那轮根本没执行，运行的仍是旧宿主
   代码。**更正 M9 的重载指引：宿主侧改动必须重启应用**，关→开只换客户端。
4. **p1.s1 的 180s 空等仍无层证据**：留痕未生效，无从判定停在 prepareCall 还是 provider
   流。M9 的"流结束根因"保持"代码推断、待证"标注。重启后下一次运行的 job（phase /
   partialText / 时间戳）即给出答案；`runs` 动作已能读出 job（新增 jobs 字段）。
5. **顺带修掉两个测试暴露的真实回归**：job schema 新字段的 `default(null)` 注入 +
   schema/写入器键序不一致，导致重导入不再字节幂等（二次 import 报 content-differs）——
   改为 optional 无默认、键序与写入器对齐，实测新旧两种形状均字节恒等；production-store
   快照断言按新事实改写（库已合法混入当前版本记录，守卫改为"前代语料全数在保护之内"）。
6. 两项 UX 落地：**模型选择持久化**（localStorage→sessionStorage 回退；保存的模型失效时
   toast 明示回退）；**反馈绑定篇目/句子**（超时/取消回执只显示在它所属的锚点，篇目级
   反馈（如发布结果）在本篇任意锚点可见，跨锚/跨篇一律不显示）。

374/374 全绿。产物：client.js（免构建）+ lib/*.js（tsc -b 重建）。**重载：客户端关→开即可；
宿主侧（job 留痕、cancelled/model-truncated/stream-ended-without-finish 标注）必须重启
应用才生效。** 真实库数据未动（p1.s2 那条解析保留）。实机复验由 Codex 执行。

## M11 · 解析按钮点击无反应：TDZ 回归修复（2026-10-08，Codex 最高优先级回归）

Codex 定位准确：M9/M10 的机械改名把两个运行函数的**启动清屏调用**（`reportError('')` /
`reportStatus('')`）放在了同函数 `const` 包装声明**之前**——同一函数作用域的暂时性死区
ReferenceError，且发生在 try 之外，onClick 不接住异常 → **点击静默死亡、无任何反馈、
请求不能启动**。`analyseParagraphRun` 同病（无按钮可达，一并修复）。

修复：`passageId` 与两个反馈包装的声明移到首次调用之前；自守卫之后的**全部启动段**
（清屏、`beginAnalysisRun`、置忙）纳入 try/catch/finally（`run` 可空收尾）——启动期任何
异常都走 `generationUnavailable` 反馈显示给读者，不再可能静默死亡。逐函数静态扫描确认
声明先于使用。

**必要验证（实际执行入口，非语法/旧单测）**：活体预览器（真 React、真实 onClick）驱动
真实「解析」按钮，DOM 转储取证三景：
1. 点击解析：`analyseCalled=1 runPanel=true errors=0`，运行面板「等待模型返回 · 已用时 7
   秒」+ 取消按钮在场，按钮转「解析中…」——点击确实发起了运行（此前 TDZ 版的特征是
   errors=1 且 analyseCalled=0）。
2. 点击取消：`runPanel=false`、反馈「已停止等待这次解析。后台运行若自行完成，重新选中
   本句即可读到。」、解析恢复可用、errors=0。
3. 反馈绑定：第一句取消后切到第二句，反馈**不跟随**（ABSENT），面包屑为 段落 1 / 2。

374/374 全绿（含被钉住的读取字面量完好）。产物：**仅 client.js**（客户端修复）。
加载方式：**插件关→开即可**（宿主 lib 已随用户两次重启生效，无需再重启）。
jobs 留痕 / 阶段证据 / 取消传播等待验项就此解封——下一次真实运行即可取证。


## 2026-10-08 前端路线与段落接续

本轮修改客户端与对应测试。沿用原有段落创建和读取接口，未修改宿主实现。

| 功能 | 实现与验证 |
|---|---|
| 路线入口 | 打开路线与收起路线随状态切换，展开时显示绿色背景；面板内显示缩小、放大、收起路线及百分比。DSH 实测 65% → 81% → 65%，收起后保留已选句子。 |
| 录入下一段 | 阅读区常驻入口，默认标题追加段落 02，此后递增为 03、04。保留章节编号，检查全部段落列表页以避开同名编号。标题允许手动修改。 |
| 保存与切换 | 先预览切分，保存后仍停留在当前段。开始下一段按钮执行切换。DSH 实测保存、返回原段、面板关闭重开、切换下一段及自动生成段落 03。 |
| 本地接续关系 | localStorage 仅保存前后段的标识与标题。面板重开后恢复按钮；归档关联段落时移除链接。链接不属于宿主备份或跨设备数据；本地存储不可用时，仅在当前面板保留。原文仍交给宿主保存。 |
| 输入与错误 | 返回当前段后，再次打开可继续当前面板内的草稿。输入框在预览或保存期间禁用；窗口支持 Escape 和 Tab 焦点限制。预览失败时在窗口内显示错误，重试预览，禁止直接保存。 |
| 预览计数 | 修正数字计数当作数组读取的问题；DSH 实测显示 1 段、1 句。 |
| 自动验证 | 全套 378 项测试通过，其中新增 4 项执行实际组件处理函数，覆盖跨页编号、草稿返回、保存不切换、失败预览及路线控制。 |

实际验收使用自建的前端接续验收段落，完成后已归档。原有两个学习段落仍在活动列表中。真实模型生成与审计报告中的后端修复不属于本轮验证范围。

## 2026-10-08 书籍目录与阅读页布局

本轮继续修改前端，沿用现有段落接口，未修改宿主、数据库及模型调用实现。

| 功能 | 实现与验证 |
|---|---|
| 入口与目录 | 左侧展示书籍、章节、段落三级树，可展开和收起；既有段落保留在未归类中。入口改为书架，新建段落表单改用独立窗口。读取全部列表分页。 |
| 归类与排序 | 可建立书籍、章节，归类现有段落，设置章节内段落序号；拒绝重复序号。DSH 实测建立临时书籍及章节、归类、展开目录、选择段落和面包屑显示一致。 |
| 段落接续 | 下一段继承当前书籍、章节，自动递增可用序号及标题。DSH 实测第 1 段接续到第 2 段，保留当前阅读位置。 |
| 阅读布局 | 顶部保留目录、书架、路线、知识库。段落标题旁放置归类和接续入口；原文全文默认折叠。上一句、下一句、解析、查词、句法配色、模型与讨论集中在句子学习区。移除重复解析按钮，未接通的发音功能保持禁用。 |
| 实机复验 | DSH 实测关闭重开后归类恢复，上一句与下一句可切换，目录展开收起可用。临时归类与空书籍已撤回，原有两个学习段落仍在未归类中。 |
| 尺寸验证 | 使用真实 React 和当前 client.js，在 390×844、320×568、844×390、800×350 的本地预览中检查布局，均无横向溢出，页面错误为零。窄屏目录改为抽屉，低高度窗口压缩标题区；解析按钮实际启动等待与取消界面。预览使用替代接口，未调用真实模型。 |
| 自动验证 | 381 项测试全部通过。新增组件交互测试覆盖本地书籍章节创建、归类、面包屑、接续继承、移出书籍和工具位置；调整旧布局断言，使句法图例仅在已有解析时显示。client.js 语法检查与差异格式检查通过。 |
| 数据范围 | 书籍、章节、排序与接续关系保存在 localStorage，关闭面板后保留。它们不属于宿主备份或跨设备同步数据，原文仍交给既有宿主接口保存。 |

## 2026-10-08 路线裁切与遮挡回归

用户截图暴露目录与路线同时展开时的裁切。上轮四尺寸验收主要检查阅读区，未充分覆盖路线展开状态；381 项单元测试未检查浏览器实际布局，不能证明该状态正常。

根因是新版路线定位到阅读区左侧，仍继承旧布局的 `translateX(-50%)`，使左半边移出阅读区。路线的层级 7 也低于遮罩的层级 8。修正为取消平移、占据阅读区内的可用高度、宽度不超过阅读区、层级 10，工具栏支持换行。

| 验证 | 结果 |
|---|---|
| 浏览器回归检查 | 新增 `test/browser/route-layout-check.js`，检查实际面板边界、工具栏按钮范围、画布高度与点击命中层级。对旧客户端执行时报告路线越出阅读区，确认检查能够捕获本次回归。 |
| 五种尺寸 | 使用真实 React 与当前 client.js，检查 1000×750、320×568、390×844、844×390、800×350 的路线展开状态；控制按钮均在面板内，画布未坍缩，遮罩不拦截路线。 |
| DSH 实机 | 书籍目录与路线同时展开时完整显示。点击路线第二句，收起后阅读区显示第 2 句及对应已存解析；重开路线，放大 65% → 81% → 缩小 65%。未发起模型生成，未改写原文。 |
| 单元测试 | 381 项继续全部通过。浏览器检查单独执行，不计入该数量。 |

本轮继续仅修改前端样式，并补充验收脚本和文档。

## 2026-10-08 继续检测：导航、输入窗口与键盘操作

本轮沿用实际组件进行浏览器操作，并在 DSH 重载后复验。没有保存验收段落、改变既有归类或发起真实模型生成。

| 发现的问题 | 修正与复验 |
|---|---|
| 路线展开后切换知识库，路线仍遮住知识库 | 进入知识库时关闭路线。浏览器实测从第 2 句进入知识库，再返回解析，仍显示第 2 句。 |
| 路线的方向键、加减键提示没有对应处理函数 | 补充方向键平移、加减键缩放、Escape 收起与焦点恢复。浏览器实测 65% → 81% 和横向平移，Escape 后焦点回到打开路线。DSH 实测等号键缩放到 81%、方向键操作及 Escape 返回。 |
| 窄屏目录与路线可以互相遮挡 | 窄屏打开路线时收起目录，打开目录时收起路线；宽屏仍允许同时展开。浏览器实测两种方向的切换。路线 Tab 与 Shift+Tab 在可操作控件之间循环。 |
| 下一段输入窗口按整个应用窗口定位，越出窄面板 | 所有阅读窗口改为在插件区域内定位，宽高受插件区域限制，内容可滚动。旧版 320×568 面板中，窗口横向范围为 420～860，完全越出面板；修正后为 17～305。320×568、390×844、800×350 验证输入窗口边界与内部滚动，返回按钮可用。 |
| 归类窗口没有接收焦点，Escape 无法直接关闭 | 打开窗口时聚焦书名输入框，Tab 限制在窗口内，关闭后回到入口。浏览器及 DSH 实测打开、Escape 关闭与焦点恢复，未提交归类数据。 |
| 路线内的发音入口可点击，但接口未接通 | 路线内发音与重新生成发音按钮改为禁用，与阅读区一致。DSH 可访问性状态确认禁用。 |
| 输入草稿 | 浏览器录入临时文本，Escape 返回后重开，草稿仍在；不执行预览或保存。 |
| 回归检查 | 383 项 Node 测试全部通过，新增 2 项执行路线键盘与知识库切换的组件处理函数。新增 `test/browser/modal-layout-check.js` 检查窗口实际边界与横向溢出，独立于 Node 测试。浏览器控制台未报告页面错误。 |

本轮仍只修改前端。浏览器预览使用替代接口；后端质量、取消传播及跨设备数据一致性不属于此次检测结论。

## 2026-10-08：快速切换与迟到读取

本轮只修正客户端。真实 React 浏览器预览把 A 的指定读取延迟至 3.5 秒，B 的读取约 20 毫秒。先选择 A，再选择 B，分别检查段落、原文切分、解析覆盖和讨论列表。该预览使用替代接口；DSH 实机检查读取现有段落，没有启动模型或保存验收内容。

| 检测范围 | 结果及证据范围 |
|---|---|
| 修正前段落读取 | 新增执行测试失败：最后显示 slow，预期 fast。 |
| 修正前原文切分 | 浏览器出现 B 的标题与 A 的正文同时显示。 |
| 修正后段落、切分、覆盖、讨论 | 等待 A 的延迟响应返回后，浏览器仍显示 B 的正文、0/1 覆盖，未出现 A 的讨论按钮。 |
| 快速选择 A、B、A | 执行测试确认首次 A 与 B 的迟到结果均不能覆盖最后一次 A。 |
| 旧读取失败 | 执行测试确认新段落保留、错误为空、加载状态正常。 |
| 返回书架 | 执行测试确认未完成读取不能重新打开段落。 |
| DSH 实机 | 社会医学段落显示 1/2，Pascal 显示 0/2，原文匹配。路线放大至 81% 后切换，下一篇路线恢复至 65%，节点内容匹配。 |
| 归类输入恢复 | 实机空书名保存显示请填写书名；Escape 关闭后恢复归类入口焦点，没有保存归类。 |
| 自动检查 | 388 项 Node 测试全部通过，TypeScript 检查通过。 |

重开插件面板即可加载客户端修正。本轮没有验证真实宿主的迟到请求取消，也没有修改后端；生成与保存接口继续使用现有行为。

讨论窗口另补齐自动输入焦点、Tab 正反向循环、Escape 关闭和入口焦点恢复。DSH 实机确认 Shift+Tab 从标题输入移至创建，Tab 返回标题输入，Escape 关闭后焦点回到讨论入口。执行测试确认输入法组合状态下 Escape 不关闭窗口。切换段落时关闭旧讨论窗口，避免把旧分支入口留到新段落。

## 2026-10-08：最终前端复验

在上一轮修正基础上，继续检查查词窗口、接续录入、预览后编辑和五组尺寸。先复现，再修改，最后重新执行完整测试和布局检查。

| 发现与修正 | 验证 |
|---|---|
| 查词没有输入焦点，Escape 不关闭 | DSH 实机复现。修正后 Shift+Tab 从输入框至查阅，Tab 返回输入框，Escape 关闭并恢复查词入口。 |
| 查词或接续准备迟到 | 执行测试覆盖切换段落、切换句子及连续两次查词。旧结果不能覆盖新页面，旧编号准备不能打开错误段落的录入窗口。 |
| 预览完成后焦点落在宿主 | DSH 实机复现。修正后有效原文显示 1 段、2 句，焦点仍在录入窗口。 |
| 预览后编辑仍显示旧成功信息与保存按钮 | 浏览器及执行测试确认编辑后移除旧预览与提示，恢复预览切分；未调用创建接口。 |
| 路线与窗口布局 | 320×568、390×844、844×390、800×350、1000×750 全部通过路线与窗口检查，最终浏览器错误日志为空。1000×750 同时展开目录与路线，其余尺寸检查窄屏路线。 |
| 完整回归 | 394 项 Node 测试全部通过，TypeScript 检查通过。 |

本轮修改只涉及客户端。查词、预览、创建等 Remote 接口不变，迟到结果检查只控制前端显示，不代表宿主请求取消。结论窗口补齐键盘及焦点管理，本轮没有真实创建讨论或保存结论；触控板捏合没有实机复验。有效切分预览使用真实 DSH 读取接口，浏览器尺寸检查使用替代接口，两者证据分别记录。

当前测试范围内，全部已复现前端故障均已修正，最终回归没有发现新故障。后端审计问题仍按用户要求搁置。

## 2026-10-08：再次独立复验

从已推送的 d7e4674 开始重新检测，发现并修正取消接续录入时的错误残留和入口焦点丢失。

| 检测 | 结果 |
|---|---|
| 修正前实机 | 空原文预览后按 Escape，阅读区仍显示请粘贴法语原文。 |
| 修正后实机 | 输入错误只在录入窗口显示，Escape 关闭后阅读区无错误，焦点回到录入下一段。没有创建测试段落。 |
| 执行回归 | 新测试覆盖返回当前段按钮及 Escape，两种取消方式均清理错误并保留当前阅读。窗口内仅有一个错误提示。 |
| 阅读和路线 | 真实应用读取第二句已存解析正常；路线键盘缩放至 81%，选回未解析第一句后没有解析残留。 |
| 五组尺寸 | 320×568、390×844、844×390、800×350、1000×750 均通过路线及录入窗口边界检查。取消错误录入后 alerts=0，焦点为录入下一段；浏览器错误日志为空。 |
| 完整测试 | 395 项 Node 测试全部通过。 |

本次仅修改客户端和回归测试，未改动 Remote 接口或宿主数据。上述浏览器尺寸检查仍使用替代接口，不构成后端可靠性验证。

## 2026-10-08：最后一轮充分验收

验收从 7e75764 开始，复现并修正查词结果误用已确认学习结论标题和来源讨论返回按钮的问题。修正后重新完成全套测试与六组尺寸检查。

| 范围 | 最终结果 |
|---|---|
| 实机查词 | 输入 cœur 按 Enter，读取已有词条。修正后显示词条名称、已有词条状态和释义，返回解析成功。 |
| 切句 | 查词后切到下一句，旧释义清除，原文匹配。 |
| 目录三级归类 | 替代接口预览中归类到最终验收书籍、第一章、段落 03，树与面包屑一致，刷新后恢复。验收归类已撤回，空书籍已移除。 |
| 接续继承 | 书籍与章节继承，默认序号 04，标题末尾段落 04。改为已有序号 03 时拒绝预览；取消后错误清除并恢复入口焦点。 |
| 布局 | 320×568、390×844、844×390、800×350、1000×750、1280×900，路线边界、按钮点击层级、查词及接续窗口边界检查全部通过。 |
| 页面异常 | 最终浏览器错误日志为空。 |
| 自动回归 | 396 项 Node 测试全部通过，类型检查通过。新增查词结果显示与返回操作的执行测试。 |

本轮没有启动真实模型生成，也没有创建真实段落、讨论或结论。书籍刷新恢复和布局检查来自真实 React 预览，预览使用替代接口；实机查词来自真实宿主的已有词条读取。后端审计、跨设备同步及真实触控板捏合仍未纳入验收。

截至本轮结束，已复现的前端问题均已修正，最终检查没有再发现故障。该结论限于本文记录的测试范围。

## 2026-10-08：后端开发前补充动态窗口验收

此前不同尺寸的验收分别加载页面，未覆盖同一页面内连续改变尺寸。这轮使用随视口变化的真实 React 预览，并重开 DSH 插件读取现有段落。

| 检测 | 结果 |
|---|---|
| 修正前动态窗口 | 1280×900 路线展开，缩到 390×844，再缩到 320×568，回宽屏时路线未恢复。 |
| 修正后偏好恢复 | 展开、收起两种宽屏偏好均能在连续窄屏调整后恢复。 |
| 窄屏路线 | 320×568 打开后改到 844×390，再回 1280×900，路线边界及控件点击层级检查通过。 |
| 打开的录入窗口 | 1280×900 → 320×568 → 844×390 → 1280×900，窗口边界通过，原文和输入焦点保留。 |
| 实机重开 | 现有社会医学段落读取正常，覆盖 1/2，Flash 模型偏好保留。没有启动生成或保存测试内容。 |
| 回归 | 397 项测试通过，类型检查通过；新增测试执行实际尺寸观察回调，最终浏览器错误日志为空。 |

动态窗口预览的调试条曾遮住路线全览按钮，属于验收工具自身覆盖。移除该调试条后重新执行点击层级检查并通过，没有据此修改产品布局。

本轮只修正前端布局状态，没有改动 Remote 接口和宿主实现。现有后端审计问题依然待修；以本次提交及完整验收记录作为后端开发的回归基线。


## 2026-10-08：新增段落等待状态复验

从 8c34b1b 继续检查异步请求与窗口操作，发现普通新增段落在预览等待期间仍能切回段落列表并关闭窗口。重开后会显示迟到的预览。此前接续录入没有这一模式切换入口，因此没有覆盖该操作。

| 检测 | 结果 |
|---|---|
| 修正前复现 | 真实 React 预览使用延迟 3 秒的替代接口，预览后立即切回列表、取消，再重开新增窗口，出现迟到预览。执行测试同样确认模式切换按钮未禁用。 |
| 修正后等待状态 | 预览与保存等待期间禁用模式切换按钮，与表单取消限制一致。预览完成及保存冲突返回后恢复可用。 |
| 状态文字 | 预览期间显示正在预览切分，保存期间显示正在安全保存，避免将预览误报为保存。中英文均补齐。 |
| 完成后编辑 | 预览显示 1 段、1 句；改写原文后移除旧预览并要求重新预览，没有执行创建操作。 |
| 接续弹窗 | 320×568、390×844、844×390、800×350、1000×750、1280×900 连续调整，弹窗与字段边界通过，输入焦点保留；取消后 alerts=0，焦点回录入下一段。 |
| 路线 | 同样六组尺寸，路线边界及缩小、放大、收起、全览的点击层级通过，实际控件操作正常。验收调试条曾覆盖全览，隐藏调试条后重新执行全部尺寸检查。 |
| 完整回归 | 398 项测试全部通过，类型检查通过，浏览器错误日志为空。新增执行测试覆盖预览、保存等待及冲突返回后的按钮状态。 |

本轮只修改客户端、回归测试和文档。浏览器验收使用替代接口，不代表真实宿主保存或生成成功。未创建真实段落、调用真实模型或改动后端。请求持续不返回时的取消与超时机制仍需后续单独评估，本轮没有新增这些接口能力。最终未发现本轮覆盖范围内的其他故障。


## 2026-10-08：接续编号与保存重试复验

从 eab9485 开始检查书籍归类、标题重名与章节内编号占用的组合，发现自动编号递增后没有再次避开章节内已用序号。

| 检测 | 结果 |
|---|---|
| 修正前编号冲突 | 当前段位于第一章序号 01，库中已有相同标题前缀的段落 02，本章另有不同标题的序号 03。接续窗口自动给出 03，预览提示编号冲突。执行测试及真实 React 浏览器均复现。 |
| 修正后编号 | 标题生成同时检查已有标题与本章已用序号，自动选择 04。浏览器预览成功显示 1 段、1 句，没有执行真实创建。 |
| 保存重试 | 新执行测试模拟首次创建连接失败、重试返回已经保存。原文保留，重试使用相同 id 与 operationId，仍停留在当前段，并显示开始下一段入口。 |
| 测试等待条件 | 全套回归发现上一轮保存等待测试偶发早于指纹计算完成。改为等待创建请求真正进入，不再假定一次事件循环后请求已经开始。完整回归和单独复验均通过。 |
| 动态布局 | 320×568、390×844、844×390、800×350、1000×750、1280×900，接续窗口边界、序号、原文和焦点均正常。取消后再次检查全部尺寸的路线边界与控件点击层级，缩放、全览操作通过。 |
| 最终回归 | 400 项测试全部通过，类型检查通过，浏览器错误日志为空。 |

本轮修改只涉及客户端、测试与文档。浏览器中的书籍、标题和占用序号均为替代接口提供的验收数据，保存重试使用模拟响应；没有创建真实段落、启动真实模型或修改后端。上述结果不代表真实宿主已经具备可靠的失败恢复能力。本轮覆盖范围内未再发现其他故障。


## 2026-10-08：取消接续后切换新增入口的复验

从 6b2293e 检查组合操作，复现取消接续后从段落管理打开普通新建段落时沿用接续标题和原文的问题。修正后进入普通新增时临时保留原接续草稿，使用独立空白表单；返回原段接续入口时恢复原草稿。

| 检测 | 结果 |
|---|---|
| 修正前 | 接续输入后取消，经段落管理打开新建段落，显示原接续标题与原文。组件执行测试和真实 React 浏览器均复现。 |
| 修正后 | 普通新增标题、原文为空；写入独立内容后取消，再打开接续入口，恢复原接续标题与原文，不混用独立内容。 |
| 章节新增入口 | 新执行测试确认从章节录入入口新建时同样保留原接续草稿，返回时恢复手动标题、书籍、章节编号和切分预览。 |
| 动态弹窗 | 320×568、390×844、844×390、800×350、1000×750、1280×900，恢复草稿后的窗口与字段边界均通过，焦点保留。取消后无错误残留，焦点返回录入下一段。 |
| 路线 | 同样六组尺寸，路线边界、全部缩放与收起控件的点击层级通过，放大、缩小、全览实际操作正常。 |
| 回归 | 402 项测试全部通过，类型检查通过，最终浏览器错误日志为空。 |

接续草稿临时保留于当前面板内存，未新增草稿持久化；关闭插件或重载仍不保证恢复未保存原文。本轮浏览器使用替代接口，未执行真实保存或模型生成。Remote 接口、后端实现及本地目录存储格式均未改动。本轮覆盖范围内未再发现其他故障。


## 2026-10-08：草稿切换后的完整保存与阅读复验

从 4a8f289 检查普通新增保存、原接续草稿恢复、接续保存和进入下一段的完整流程。浏览器预览本轮采用能模拟创建并重新读取段落的替代接口，不止检查按钮与静态响应。

| 检测 | 结果 |
|---|---|
| 独立新增及接续关系 | 取消接续后普通新增使用空白表单，独立保存后进入独立段落。返回原段时接续草稿恢复，保存后保持原段阅读。新增执行测试确认两次保存的内容正确，接续关系仅指向原父段。 |
| 提示残留 | 复现接续保存成功的提示进入下一段后仍长期显示。修正为调用既有临时提示函数，浏览器验证约 2.6 秒后消失，开始下一段按钮继续可用。新增测试执行定时回调并确认提示清除。 |
| 进入下一段 | 标题、原文及 1/1 句数正确，覆盖为 0/1，显示尚未解析，没有沿用原段的解析。 |
| 目录与后续接续 | 新段归类到保存流程验收、第一章、序号 02，目录与面包屑一致；再次接续继承书籍章节，自动生成 03。 |
| 路线尺寸 | 保存后的阅读页在 320×568、844×390、1280×900 检查路线边界、缩放与收起及全览点击层级，全部通过。 |
| 最终回归 | 404 项测试通过，类型检查通过，浏览器错误日志为空。 |

本轮生产代码只修正通知的显示时长。保存、重读和目录验证来自替代接口，未创建真实宿主段落或启动真实模型；本轮没有验证重开插件的草稿持久化。Remote 接口和后端实现未改动。最终未发现本轮覆盖范围内的其他故障。


## 2026-10-08：分页、输入边界及预览失败恢复复验

从 dee5948 继续检查目录分页与表单异常路径。发现预览失败后显示将切分为 0 段、0 句，并且旧错误文案声称再次点击会直接保存，实际逻辑会重试预览。现在失败时隐藏切分摘要，中英文文案均说明保留原文、重试预览。

| 检测 | 结果 |
|---|---|
| 目录分页 | 新执行测试与真实 React 浏览器均按 offset 0、25 读取 27 段，目录显示全部记录。浏览器成功选择第二页的 Passage 26，标题、原文和 0/1 覆盖正确，没有旧解析残留。 |
| 分页失败 | 执行测试模拟第二页读取失败，保留此前完整的 27 条目录，不以部分结果替换，并显示错误。 |
| 输入边界 | 执行测试确认空白标题、空白原文及 20,001 字符均不调用预览或创建；20,000 字符可进入预览，未调用创建。 |
| 失败提示 | 浏览器模拟首次预览 offline，原文保留，没有 0 段、0 句摘要，也不再声称可以直接保存。 |
| 恢复路径 | 再次点击后第二次预览成功显示 1 段、1 句，创建接口调用数仍为 0。取消后无错误残留，焦点恢复。 |
| 动态布局 | 失败提示弹窗及路线在 320×568、844×390、1280×900 的边界、焦点和按钮点击层级通过，缩放与全览操作正常。 |
| 回归 | 407 项测试通过，类型检查通过，最终浏览器错误日志为空。 |

本轮只修改客户端显示与错误文案，另补充三项执行测试。浏览器数据和失败恢复来自替代接口，未创建真实宿主段落或启动模型。后端接口和实现未改动。最终未发现本轮覆盖范围内的其他故障。


## 2026-10-08：最近修正的交叉流程独立复验

本轮测试代码版本为 b7b8d93。没有发现新故障，没有修改客户端、测试或后端，仅追加验收记录。

| 检测 | 结果 |
|---|---|
| 完整回归 | 407 项测试全部通过，类型检查通过。 |
| 归类与错误恢复 | 浏览器先将原段归类到书籍第一章，接续输入后首次预览失败，提示要求重试且保留原文；重试成功。 |
| 普通新增与恢复 | 取消接续后普通新增的书名、标题、原文均为空。独立新增保存后回原段，接续原文、书籍、序号 02 和有效预览恢复，未额外调用预览。 |
| 保存组合 | 独立新增与接续保存共调用创建 2 次，预览共 3 次，目录从 27 段增为 29 段。接续保存后仍停留在原段。 |
| 阅读切换 | 开始下一段后原文 Nous continuons.、第一章序号 02、1/1 句数和 0/1 覆盖一致，没有旧解析；保存通知自动消失。 |
| 后续接续 | 下一次录入生成序号 03，原文为空，继承书籍章节。 |
| 六组尺寸 | 320×568、390×844、844×390、800×350、1000×750、1280×900，接续窗口与字段边界、焦点、路线边界与控件点击层级通过。执行加减键缩放、方向键、全览和 Escape，关闭后焦点回打开路线，无错误残留。 |
| 页面异常 | 最终浏览器错误日志为空。 |

上述保存与阅读验证采用真实 React 组件和替代接口，没有向真实宿主创建段落或调用真实模型。未扩大到宿主持久化、请求取消、跨设备同步或真实触控板捏合。本轮覆盖范围内未发现新问题，前端代码保持 b7b8d93 不变。
