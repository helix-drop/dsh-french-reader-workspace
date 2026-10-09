import { BRANCH_KINDS } from "./domain.js";
import { checkConjugation, renderConjugation } from "./conjugation.js";
import { checkCoverage, clauseRanges } from "./coverage.js";
import { previewImport } from "./import-preview.js";
import { PASSAGE_ANCHOR_ID } from "./segmentation.js";
const DESCRIPTION = `
French close reading · store French sources, then grow a non-linear reading of them.

Workflow: preview a source and confirm what it will store, save it, read its
deterministic anchors, then attach the overall translation and per-anchor discussion
branches. Nothing here calls a model: this tool only persists what you decided.

Before saving a fresh import, run the preview action and read it back to the reader:
it names the paragraph and sentence boundaries, and flags encoding damage or
typography problems that would otherwise be analysed as if they were prose.

Anchors (stable while the source is unchanged):
- "passage"          the whole passage, used for the overall translation
- "p2"               paragraph 2
- "p2.s3"            sentence 3 of paragraph 2

Actions:
- list {offset?, limit?}                       saved passages, newest first
- coverage {sentence, constituents}             check that a sentence analysis leaves no clause unanalysed
- conjugation {claim}                           check a conjugation claim: does the decomposition compose, is the tense in scope, is a classification verified
- preview {title?, sourceText}                  what an import would store: boundaries and every flag; writes nothing
- save {title, sourceText, id?, operationId?} store one immutable source; returns its anchors. Default ids are deterministic so a retry of identical input cannot create a duplicate; supply a fresh id to intentionally save a duplicate.
- read {passageId}                             full source + anchors (use this before analysing)
- archive {passageId, expectedSourceRevision, operationId?} archive without deleting source or notes
- translate {passageId, anchorId, text, source?, note?, language?, operationId?}  append a translation variant
  (source: ai | user — keep your own wording as a 'user' variant; it is never regenerated away)
- branch {passageId, anchorId, kind, title, body?, parentId?, operationId?}  append a branch
- analysis {passageId}                         variants, adopted pointers, branches, and the reconciliation report
- answer {passageId, question, answer, intents} commit one answer with the knowledge writes it intends
  (one call is one real question: pass a fresh operationId for each new question, and reuse
  the same one only to retry that same question with the same answer and intents. Reusing it
  with different content is refused as operation-used rather than silently rewriting the run.)
- resume {passageId}                           finish intents a previous run left pending
- runs {passageId}                             per-run and per-intent completion state
- grammar                                     grammar entries plus near matches awaiting review
- resolve {pendingId, decision, entryId?, keyPoints?}  close one pending candidate: attach, create, or discard
- render {entryId, wantsEtymology?}           render a card through its output policy and report what the policy refuses
- section {entryId, section, text}            write one section explicitly (a missing section is never fetched for you)
- lexiconSource {entryId, section, kind, httpStatus?, body, entryFound?, truncated?, parseFailed?}  record a fetch, truthfully judged
- adopt {passageId, anchorId, translationId}      make one variant the sentence's current translation
- mot {mot, partOfSpeech?, create?, definition?, label?, lemma?, forms?} exact-Mot lookup first; store only when asked
- lexicon {limit?}                             stored vocabulary entries
- occurrence {entryId, passageId, anchorId, note}  append one reading's context note
- select {passageId, ranges, note?}            store a phrase selection as an anchor (ranges may be discontinuous)
- source {passageId, revision}                 the exact text of one stored source revision
- backfill {passageId, sourceRevision}         derive spans for notes written before spans existed
- export                                      the whole library as records with keys (backup)
- import {bundle}                              restore an exported library; never overwrites local work
- revise {passageId, expectedSourceRevision, sourceText, note?} correct the source as a NEW revision; nothing is overwritten and old anchors are relocated by their text

Reading with a model (nothing here calls a model for you: these actions send the turn you composed):
- backends                                     which generation backends this Host offers, and why one is unavailable
- models {backend}                            the models that backend serves
- discuss {passageId, anchorId, title}        open a discussion branch on one anchor
- discussion {passageId}                      every branch, with each answer's backend, model and failure
- context {passageId, branchId, question, backend, model}   exactly what a turn would send; writes nothing
- ask {passageId, branchId, question, backend, model, expectedFingerprint?, preview?}
  one turn: the question is stored before the model is called, the compiled context is stored with the
  answer, and a sibling branch's messages are never part of it. Pass the fingerprint from the context action to
  refuse a turn whose materials changed since you looked.
- sentContext {passageId, contextId}           the exact text one stored answer was sent with
- analyse {passageId, anchorId, backend, model}  generate one sentence's structured analysis; it is
  validated before storage, and a reply that fails the gate is reported with the gate's own errors
- sentence {passageId, anchorId}               the stored analysis: translation, backbone, clauses, constituents, morphology, explanations
- coverageReport {passageId}                   covered / missing / failed / STALE sentences, measured
- publish {passageId, overallTranslation?, cohesion?}  publish an analysis version covering what is really covered
- sources                                      the declared lexicon sources and the fields each may support
- fetchSource {entryId, source, section, mot}  fetch one declared source; the verdict is the result, not the status
- mastery {entryId, mastery, expectedRevision?}  the reader's own learning state; nothing automatic writes it

Analysis discipline: a kind labelled "syntax" carries facts only. Authorial intent belongs in "context" or
"rhetoric", and anything you are unsure of belongs in "unverified" — the gate flags the difference, and it
refuses an analysis that leaves a word-bearing part of the sentence unaccounted for.

Grammar discipline:
- One question is one count. Two intents about the same grammar point inside one
  answer count once, and a retried write never counts again; a genuinely new
  question counts once more.
- An example quotes the anchored sentence it came from, together with the real
  question, so the rule and its evidence stay separately locatable.
- A near match with several candidates is parked for the reader. Resolving it is
  the reader's act: attach names one entry, create makes the topic its own entry,
  and only naming new wording revises a rule.

Branch kinds: ${BRANCH_KINDS.join(' | ')}. Siblings under one anchor stay independent:
put each sentence's constituents, and each grammar or vocabulary note in its own branch.
Use parentId to hang a refinement under the branch it refines, and never rewrite an
existing branch — append a child instead.

Vocabulary discipline:
- Look up the exact Mot first. A hit means the stored entry is authoritative: do
  not regenerate it and do not go to the network. found:false with candidates
  is a *miss*: a lemma match is a related candidate, never the Mot itself.
- Never merge an inflected form into its lemma silently: record the form on the
  entry (its forms list) and keep the exact form the reader looked up.
- Homographs stay separate entries: same spelling with another part of speech is
  another entry, not a second sense of one card.
- A context note goes to the occurrence action, so one reading never rewrites the entry's
  general senses or sections.

Translation discipline:
- Variants are never overwritten: adopting one moves the sentence pointer and
  keeps every other variant readable.
- The overall (passage) translation is a decision, not a cache. When a sentence
  is adopted after it, the analysis action reports what changed and what it said
  before; rewrite the overall translation deliberately, never silently.

Discipline:
- One answer and its intended knowledge writes are committed together: if the
  process dies mid-way, the answer stays readable, finished writes stay valid,
  and the resume action finishes the rest instead of redoing them.
- The source is immutable: a wrong source means saving a new passage, not editing one.
- Translations are versions, not overwrites; pass the same operationId only when retrying.
- Quote the exact French form you discuss; do not silently replace a form with a lemma.
- Mark what you are unsure of in the branch body instead of guessing a classification.
`.trim();
/**
 * Build the `french_reader` tool definition.
 * @param controller - Host controller owning the storage domain.
 * @returns Tool options for `ctx.tools.register`.
 */
export function buildFrenchReaderTool(controller) {
    const actions = (signal) => ({
        async list(args) {
            const offset = typeof args.offset === 'number' ? args.offset : 0;
            const limit = typeof args.limit === 'number' ? args.limit : 25;
            const value = await controller.listPassages({ offset, limit }, signal());
            return {
                offset: value.offset,
                total: value.total,
                hasMore: value.hasMore,
                passages: value.items.map((item) => ({
                    passageId: item.id,
                    title: item.title,
                    characters: item.characterCount,
                    excerpt: item.excerpt,
                    createdAt: item.createdAt,
                })),
            };
        },
        async coverage(args) {
            const sentence = requireString(args.sentence, 'sentence');
            const raw = Array.isArray(args.constituents) ? args.constituents : [];
            const constituents = raw.map((entry) => {
                const item = entry;
                if (typeof item.start !== 'number' || typeof item.end !== 'number') {
                    throw new Error('each constituent needs numeric start and end offsets into the sentence');
                }
                return {
                    label: typeof item.label === 'string' ? item.label : '',
                    start: item.start,
                    end: item.end,
                };
            });
            const report = checkCoverage(sentence, constituents);
            return {
                errors: report.errors,
                hints: report.hints,
                // The clause units the check derived, so a disagreement about where
                // clauses start is visible rather than hidden inside the verdict.
                clauses: clauseRanges(sentence).map((clause) => ({
                    start: clause.start,
                    end: clause.end,
                    text: clause.text,
                })),
                note: 'Nothing is stored: this checks an analysis you are about to present.',
            };
        },
        async conjugation(args) {
            const claim = args.claim;
            if (claim === null || typeof claim !== 'object')
                throw new Error('claim is required');
            const checked = claim;
            const report = checkConjugation(checked);
            return {
                errors: report.errors,
                hints: report.hints,
                // The ladder is rendered here so the ◀ marker and 存疑 marks cannot be
                // forgotten when the claim is quoted back.
                rendered: renderConjugation(checked),
                note: 'Nothing is stored: this checks a claim you are about to present.',
            };
        },
        /**
         * Pronunciation data for one verb: the reader's own action, never a model's.
         *
         * `fetch` walks the source (two requests: the conjugation table, then every form
         * page in one query), `read` reports what is stored without touching the network,
         * and `list` shows which verbs have data. A verb with nothing stored answers
         * `no-data` rather than a paradigm generated from memory.
         */
        async conjugationData(args) {
            const mode = typeof args.conjugationMode === 'string' ? args.conjugationMode : 'read';
            if (mode === 'list') {
                const rows = controller.listConjugationRecords();
                return { total: rows.length, records: rows };
            }
            const lemma = requireString(args.conjugationLemma ?? args.lemma, 'conjugationLemma');
            if (mode === 'fetch') {
                const value = await controller.fetchConjugation({ lemma }, signal());
                if (value.fetched === false)
                    return { refused: true, reason: value.reason };
                const read = controller.readConjugation({ lemma }, signal());
                return {
                    fetched: true,
                    status: value.status,
                    requests: value.requests,
                    tenses: value.tenses,
                    bases: value.bases,
                    missingForms: value.missingForms,
                    failure: value.failure ?? null,
                    notes: value.notes ?? [],
                    // The card reads the stored record back, so what it shows is what was stored.
                    state: read.state,
                    stored: read.state === 'dataset' ? read.tenses : null,
                };
            }
            const read = controller.readConjugation({ lemma }, signal());
            return { ...read };
        },
        async preview(args) {
            const sourceText = requireString(args.sourceText, 'sourceText');
            const preview = previewImport({
                title: typeof args.title === 'string' ? args.title : '',
                sourceText,
            });
            return {
                ...preview,
                // Errors must be resolved before saving; hints are judgement calls.
                errors: preview.flags.filter((flag) => flag.severity === 'error').length,
                hints: preview.flags.filter((flag) => flag.severity === 'hint').length,
                note: 'Nothing was stored. Confirm the boundaries, then call save with the same text.',
            };
        },
        async save(args) {
            const title = requireString(args.title, 'title');
            const sourceText = requireString(args.sourceText, 'sourceText');
            const explicitId = typeof args.id === 'string' && args.id !== '' ? args.id : undefined;
            const explicitOperation = typeof args.operationId === 'string' && args.operationId !== ''
                ? args.operationId
                : undefined;
            // Derived ids make an identical retry land on the same passage instead of
            // a duplicate. Pass an explicit id (or operationId) to save a deliberate
            // duplicate of the same source.
            const id = explicitId ?? await deterministicUuid('french-reader/passage', `${title}\u0000${sourceText}`);
            const operationId = explicitOperation
                ?? await deterministicUuid('french-reader/save', explicitId ?? `${title}\u0000${sourceText}`);
            const value = await controller.createPassage({ id, operationId, title, sourceText }, signal());
            if (value.kind === 'conflict')
                return { refused: true, saved: false, reason: value.reason, maxPassages: value.maxPassages };
            const segmentation = await controller.getSegmentation({ passageId: value.passage.id }, signal());
            return {
                saved: value.kind === 'created',
                alreadySaved: value.kind === 'already-saved',
                passageId: value.passage.id,
                title: value.passage.title,
                sourceRevision: value.passage.sourceRevision,
                segmentationRevision: segmentation.segmentation?.revision ?? null,
                paragraphs: describeAnchors(segmentation.segmentation?.paragraphs ?? []),
            };
        },
        async read(args) {
            const passageId = requireString(args.passageId, 'passageId');
            const passage = await controller.getPassage({ id: passageId }, signal());
            if (passage.passage === null)
                return { found: false, passageId };
            const segmentation = await controller.getSegmentation({ passageId }, signal());
            return {
                found: true,
                passageId,
                title: passage.passage.title,
                sourceText: passage.passage.sourceText,
                sourceRevision: passage.passage.sourceRevision,
                paragraphs: describeAnchors(segmentation.segmentation?.paragraphs ?? []),
            };
        },
        async translate(args) {
            const passageId = requireString(args.passageId, 'passageId');
            const anchorId = typeof args.anchorId === 'string' && args.anchorId !== '' ? args.anchorId : PASSAGE_ANCHOR_ID;
            const language = typeof args.language === 'string' && args.language !== '' ? args.language : 'zh-Hans';
            const text = requireString(args.text, 'text');
            const source = args.source === 'user' ? 'user' : 'ai';
            const note = typeof args.note === 'string' ? args.note : '';
            const value = await controller.saveTranslation({
                passageId,
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : await deterministicUuid('french-reader/translation', [passageId, anchorId, language, source, note, text].join('\u0000')),
                anchorId,
                source,
                note,
                language,
                text,
            }, signal());
            if (value.kind === 'conflict')
                return { refused: true, saved: false, reason: value.reason };
            return {
                saved: value.kind === 'saved',
                alreadySaved: value.kind === 'already-saved',
                translationId: value.translation.id,
                anchorId: value.translation.anchorId,
            };
        },
        async branch(args) {
            const kind = requireString(args.kind, 'kind');
            if (!BRANCH_KINDS.includes(kind)) {
                return { refused: true, saved: false, reason: 'kind-not-allowed', allowed: [...BRANCH_KINDS] };
            }
            const passageId = requireString(args.passageId, 'passageId');
            const anchorId = typeof args.anchorId === 'string' && args.anchorId !== '' ? args.anchorId : PASSAGE_ANCHOR_ID;
            const parentId = typeof args.parentId === 'string' && args.parentId !== '' ? args.parentId : null;
            const title = requireString(args.title, 'title');
            const body = typeof args.body === 'string' ? args.body : '';
            const value = await controller.addBranch({
                passageId,
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : await deterministicUuid('french-reader/branch', [passageId, anchorId, parentId ?? '', kind, title, body].join('\u0000')),
                parentId,
                anchorId,
                kind: kind,
                title,
                body,
            }, signal());
            if (value.kind === 'conflict')
                return { refused: true, saved: false, reason: value.reason, maxBranches: value.maxBranches };
            return {
                saved: value.kind === 'created',
                alreadySaved: value.kind === 'already-saved',
                branchId: value.branch.id,
                anchorId: value.branch.anchorId,
                kind: value.branch.kind,
                parentId: value.branch.parentId,
            };
        },
        async archive(args) {
            const passageId = requireString(args.passageId, 'passageId');
            const expectedSourceRevision = typeof args.expectedSourceRevision === 'number'
                ? args.expectedSourceRevision
                : 1;
            const value = await controller.archivePassage({
                passageId,
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : await deterministicUuid('french-reader/archive', passageId),
                expectedSourceRevision,
            }, signal());
            if (value.kind === 'conflict')
                return { refused: true, archived: false, reason: value.reason };
            return {
                archived: true,
                alreadyArchived: value.kind === 'already-archived',
                passageId: value.passage.id,
                archivedAt: value.passage.archivedAt,
                note: 'Archiving hides the passage from the library; source, translations, and branches are kept.',
            };
        },
        async answer(args) {
            const passageId = requireString(args.passageId, 'passageId');
            const question = requireString(args.question, 'question');
            const answer = requireString(args.answer, 'answer');
            const raw = Array.isArray(args.intents) ? args.intents : [];
            const intents = raw.map((entry) => {
                const item = entry;
                const kind = typeof item.kind === 'string' ? item.kind : 'branch';
                if (kind !== 'branch' && kind !== 'translation' && kind !== 'grammar') {
                    throw new Error(`intent kind must be branch, translation, or grammar, received ${kind}`);
                }
                return {
                    kind: kind,
                    anchorId: typeof item.anchorId === 'string' && item.anchorId !== '' ? item.anchorId : PASSAGE_ANCHOR_ID,
                    title: typeof item.title === 'string' ? item.title : '',
                    body: requireString(item.body ?? item.text, 'intent body'),
                    level: typeof item.level === 'string' && item.level !== '' ? item.level : null,
                    module: typeof item.module === 'string' && item.module !== '' ? item.module : null,
                    pitfall: typeof item.pitfall === 'string' ? item.pitfall : '',
                };
            });
            const value = await controller.commitRun({
                passageId,
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : await deterministicUuid('french-reader/run', [passageId, question, answer].join('\u0000')),
                anchorId: typeof args.anchorId === 'string' && args.anchorId !== '' ? args.anchorId : PASSAGE_ANCHOR_ID,
                question,
                answer,
                intents,
            }, signal());
            if (value.committed === false)
                return { refused: true, committed: false, reason: value.reason };
            const run = value.run;
            return describeRun(run);
        },
        async resume(args) {
            const passageId = requireString(args.passageId, 'passageId');
            const value = await controller.resumeRuns(passageId, signal());
            return { resumed: value.resumed, runs: value.runs.map(describeRun) };
        },
        async runs(args) {
            const passageId = requireString(args.passageId, 'passageId');
            const runs = await controller.listRuns(passageId, signal());
            // Generation jobs (ask + analyse) ride along: one read answers both which
            // knowledge runs settled and what each model call actually did — whether it
            // reached the provider (phase), what text arrived (partialText), and how it
            // ended. `modelCallMs` is backend execution time; `firstTextDeltaMs` marks the first visible text, not a reasoning token (null for agy).
            const jobs = controller.listGenerationJobs(passageId, signal());
            return { total: runs.length, runs: runs.map(describeRun), jobs: jobs.map(describeJob) };
        },
        async adopt(args) {
            const value = await controller.adoptTranslation({
                passageId: requireString(args.passageId, 'passageId'),
                anchorId: requireString(args.anchorId, 'anchorId'),
                translationId: requireString(args.translationId, 'translationId'),
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : await deterministicUuid('french-reader/adopt', [
                        requireString(args.passageId, 'passageId'),
                        requireString(args.translationId, 'translationId'),
                    ].join('\u0000')),
            }, signal());
            if (value.adopted === false && value.alreadyAdopted !== true) {
                return { refused: true, adopted: false, reason: value.reason };
            }
            return {
                adopted: value.adopted,
                alreadyAdopted: value.alreadyAdopted === true,
                previousId: value.previousId,
                note: 'Every variant is kept. The overall translation is untouched and is reported as needing reconciliation.',
            };
        },
        async backfill(args) {
            const value = await controller.backfillAnchors({
                passageId: requireString(args.passageId, 'passageId'),
                sourceRevision: typeof args.sourceRevision === 'number' && args.sourceRevision >= 1
                    ? args.sourceRevision
                    : 1,
            }, signal());
            if (value.backfilled === false && value.migrated === 0 && value.reason !== undefined) {
                return { refused: true, backfilled: false, reason: value.reason, migrated: 0, skipped: [] };
            }
            return {
                backfilled: value.backfilled,
                migrated: value.migrated,
                // Notes whose anchor does not exist in the named revision: reported, never invented.
                skipped: value.skipped,
            };
        },
        async grammar() {
            const value = await controller.listGrammar(signal());
            return {
                total: value.entries.length,
                entries: value.entries.map((entry) => ({
                    entryId: entry.id,
                    topic: entry.topic,
                    level: entry.level,
                    module: entry.module,
                    mastery: entry.mastery,
                    contentStatus: entry.contentStatus,
                    // The revision a caller must pin to change mastery: without it, a
                    // reader cannot make a change that is checked against what they saw.
                    revision: entry.revision,
                    askCount: entry.askCount,
                    lastAskedAt: entry.lastAskedAt,
                    examples: entry.examples.length,
                    pitfalls: entry.pitfalls.length,
                    keyPoints: entry.keyPoints,
                    // The examples themselves, each with its own sentence and question, so
                    // a rule and its evidence stay separately locatable.
                    exampleList: entry.examples.map((example) => ({
                        text: example.text,
                        anchorId: example.anchorId,
                        passageId: example.passageId,
                        question: example.question,
                    })),
                })),
                // Near matches the automatic path refused to choose between.
                pending: value.pending.map((item) => ({
                    pendingId: item.id,
                    topic: item.topic,
                    body: item.body,
                    candidates: item.candidates,
                    resolution: item.resolution,
                    resolvedEntryId: item.resolvedEntryId,
                    question: item.question,
                })),
            };
        },
        async resolve(args) {
            const decision = requireString(args.decision, 'decision');
            if (decision !== 'attach' && decision !== 'create' && decision !== 'discard') {
                throw new Error('decision must be attach, create, or discard');
            }
            const pendingId = requireString(args.pendingId, 'pendingId');
            const value = await controller.resolveGrammarPending({
                pendingId,
                decision,
                entryId: typeof args.entryId === 'string' && args.entryId !== '' ? args.entryId : null,
                // Naming the new wording is what makes a rule revision explicit.
                keyPoints: typeof args.keyPoints === 'string' && args.keyPoints.trim() !== '' ? args.keyPoints : null,
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : await deterministicUuid('french-reader/resolve', [pendingId, decision].join('\u0000')),
            }, signal());
            if (value.resolved === false && value.alreadyResolved !== true) {
                return { refused: true, resolved: false, reason: value.reason };
            }
            return {
                resolved: value.resolved,
                alreadyResolved: value.alreadyResolved === true,
                entryId: value.entryId,
                outcome: value.outcome,
            };
        },
        async render(args) {
            const value = await controller.renderLexiconEntry({
                entryId: requireString(args.entryId, 'entryId'),
                wantsEtymology: args.wantsEtymology === true,
            }, signal());
            if (value.found !== true)
                return { found: false, entryId: args.entryId };
            return {
                found: true,
                sections: value.sections,
                rendered: value.rendered,
                // Empty required sections are errors, not cosmetic notes.
                errors: value.errors,
                hints: value.hints,
            };
        },
        async section(args) {
            const value = await controller.setLexiconSection({
                entryId: requireString(args.entryId, 'entryId'),
                section: requireString(args.section, 'section'),
                text: typeof args.text === 'string' ? args.text : '',
            }, signal());
            if (value.updated === false)
                return { refused: true, updated: false, reason: value.reason };
            return { updated: true, errors: value.errors };
        },
        async lexiconSource(args) {
            const value = await controller.recordLexiconSource({
                entryId: requireString(args.entryId, 'entryId'),
                section: requireString(args.section, 'section'),
                kind: typeof args.sourceKind === 'string' && args.sourceKind !== '' ? args.sourceKind : 'cnrtl',
                url: typeof args.url === 'string' && args.url !== '' ? args.url : null,
                httpStatus: typeof args.httpStatus === 'number' ? args.httpStatus : null,
                body: typeof args.body === 'string' ? args.body : '',
                entryFound: typeof args.entryFound === 'boolean' ? args.entryFound : undefined,
                truncated: args.truncated === true,
                parseFailed: args.parseFailed === true,
                fetchedAt: new Date().toISOString(),
            }, signal());
            if (value.recorded === false)
                return { refused: true, recorded: false, reason: value.reason };
            return {
                recorded: true,
                ok: value.ok,
                outcome: value.outcome,
                note: value.note,
            };
        },
        /** The generation backends this Host offers, with why one is unavailable. */
        async backends() {
            return { backends: controller.listBackends() };
        },
        async models(args) {
            const backend = requireString(args.backend, 'backend');
            const value = await controller.listBackendModels(backend, signal());
            // A backend that cannot be listed is a refusal with its reason, not an
            // empty list that looks like "this backend has no models".
            if (value.reason !== undefined)
                return { refused: true, backend, models: [], reason: value.reason };
            return { backend, models: value.models };
        },
        /**
         * What a turn would send, without sending it.
         *
         * The materials and the character count are the whole point: a reader (or a
         * model) can see that a sibling branch is absent and that another passage is
         * absent before anything leaves the process.
         */
        async context(args) {
            const value = controller.previewAsk({
                passageId: requireString(args.passageId, 'passageId'),
                branchId: requireString(args.branchId, 'branchId'),
                question: typeof args.question === 'string' ? args.question : '',
                backend: requireString(args.backend, 'backend'),
                model: requireString(args.model, 'model'),
                extras: [],
            }, signal());
            if (value.ok !== true)
                return { refused: true, reason: value.reason };
            return {
                contextId: value.contextId,
                fingerprint: value.fingerprint,
                characters: value.characters,
                materials: value.materials,
                prompt: value.prompt,
                note: 'This is exactly what ask sends; pass this fingerprint back as expectedFingerprint.',
            };
        },
        /** Open a discussion branch on one anchor. */
        async discuss(args) {
            const value = await controller.createDiscussionBranch({
                passageId: requireString(args.passageId, 'passageId'),
                anchorId: requireString(args.anchorId, 'anchorId'),
                kind: 'discussion',
                title: requireString(args.title, 'title'),
                parentId: typeof args.parentId === 'string' && args.parentId !== '' ? args.parentId : null,
                forkedFrom: null,
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : await deterministicUuid('french-reader/discuss', [
                        requireString(args.passageId, 'passageId'),
                        requireString(args.anchorId, 'anchorId'),
                        requireString(args.title, 'title'),
                    ].join('\u0000')),
            }, signal());
            if (value.created === false && value.alreadyCreated !== true) {
                return { refused: true, created: false, reason: value.reason };
            }
            return {
                created: value.created,
                alreadyCreated: value.alreadyCreated === true,
                branchId: value.branchId,
                note: 'A branch is a conversation: ask appends to it, and its history is what a request carries.',
            };
        },
        /** Every branch of one passage, with each answer's provenance. */
        async discussion(args) {
            const value = controller.listDiscussion(requireString(args.passageId, 'passageId'), signal());
            return {
                branches: value.branches.map((branch) => ({
                    branchId: branch.branchId,
                    anchorId: branch.anchorId,
                    title: branch.title,
                    status: branch.status,
                    parentId: branch.parentId,
                    forkedFrom: branch.forkedFrom,
                    historyCount: branch.historyCount,
                    messages: branch.messages.map((message) => ({
                        messageId: message.messageId,
                        author: message.author,
                        text: message.text,
                        status: message.status,
                        backend: message.backend,
                        model: message.model,
                        resolvedModel: message.resolvedModel,
                        failure: message.failure,
                        contextId: message.contextId,
                    })),
                })),
                conclusions: value.conclusions,
            };
        },
        /**
         * Ask one question in a branch and store the turn.
         *
         * The question is durable before the model is called, and the compiled context
         * is stored with the answer, so what was sent survives a restart.
         */
        async ask(args) {
            const passageId = requireString(args.passageId, 'passageId');
            const branchId = requireString(args.branchId, 'branchId');
            const question = requireString(args.question, 'question');
            const backend = requireString(args.backend, 'backend');
            const model = requireString(args.model, 'model');
            if (args.preview === true) {
                const preview = controller.previewAsk({ passageId, branchId, question, backend, model, extras: [] }, signal());
                return { preview: true, ...preview };
            }
            const value = await controller.ask({
                passageId,
                branchId,
                question,
                backend,
                model,
                reasoningEffort: typeof args.reasoningEffort === 'string' && args.reasoningEffort !== ''
                    ? args.reasoningEffort
                    : null,
                extras: [],
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : globalThis.crypto.randomUUID(),
                expectedFingerprint: typeof args.expectedFingerprint === 'string' && args.expectedFingerprint !== ''
                    ? args.expectedFingerprint
                    : null,
            }, signal());
            if (value.ok !== true) {
                return { refused: true, reason: value.reason, failure: value.failure ?? null, contextId: value.contextId ?? null };
            }
            return {
                contextId: value.contextId,
                characters: value.characters,
                finish: value.finish,
                answer: value.answerText,
                resolvedModel: value.resolvedModel,
                messageId: value.messageId,
                usage: value.usage,
            };
        },
        /** The exact text one stored answer was sent with, so a claim can be audited. */
        async sentContext(args) {
            const value = controller.readContext(requireString(args.passageId, 'passageId'), requireString(args.contextId, 'contextId'), signal());
            if (value.found !== true || value.manifest === undefined)
                return { found: false };
            const manifest = value.manifest;
            return {
                found: true,
                contextId: manifest.id,
                fingerprint: manifest.fingerprint,
                characters: manifest.characters,
                backend: manifest.backend,
                model: manifest.model,
                materials: manifest.materials.map((material) => ({
                    kind: material.kind, refId: material.refId, reason: material.reason,
                    characters: material.text.length, excerpt: material.text.slice(0, 400),
                })),
            };
        },
        /** How much of the passage is analysed, measured rather than claimed. */
        async coverageReport(args) {
            const value = controller.readAnalysisCoverage(requireString(args.passageId, 'passageId'), signal());
            if (value.found !== true)
                return { found: false };
            return {
                found: true,
                total: value.total,
                covered: value.covered,
                missing: value.missing,
                failed: value.failed,
                stale: value.stale,
                perSentence: value.perSentence,
                currentVersion: value.currentVersion,
                versionCount: value.versionCount,
            };
        },
        /** Generate one sentence's structured analysis, gated before it is stored. */
        async analyse(args) {
            const value = await controller.analyseSentence({
                passageId: requireString(args.passageId, 'passageId'),
                anchorId: requireString(args.anchorId, 'anchorId'),
                backend: requireString(args.backend, 'backend'),
                model: requireString(args.model, 'model'),
                reasoningEffort: typeof args.reasoningEffort === 'string' && args.reasoningEffort !== ''
                    ? args.reasoningEffort
                    : null,
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : await deterministicUuid('french-reader/analyse', [
                        requireString(args.passageId, 'passageId'),
                        requireString(args.anchorId, 'anchorId'),
                    ].join('\u0000')),
            }, signal());
            if (value.ok !== true) {
                return {
                    refused: true,
                    stored: false,
                    reason: value.reason,
                    detail: value.failure ?? null,
                    hints: value.hints ?? [],
                    note: 'An analysis that fails the gate is stored nowhere: fix what it names and run again.',
                };
            }
            return {
                stored: true,
                anchorId: value.anchorId,
                replaced: value.replaced,
                hints: value.hints,
                coverage: {
                    covered: value.covered, missing: value.missing, failed: value.failed, stale: value.stale,
                },
            };
        },
        /** One sentence's stored analysis, with the gate's verdict attached. */
        async sentence(args) {
            const value = controller.readSentenceAnalysis(requireString(args.passageId, 'passageId'), requireString(args.anchorId, 'anchorId'), signal());
            if (value.found !== true || value.analysis === undefined) {
                // A stale analysis exists but describes text that is no longer the
                // sentence: say so, so the caller re-analyses instead of reading it.
                return value.stale === true ? { found: false, stale: true } : { found: false };
            }
            return {
                found: true,
                translation: value.analysis.translation,
                backbone: value.analysis.backbone,
                clauses: value.analysis.clauses,
                constituents: value.analysis.constituents,
                morphology: value.analysis.morphology,
                explanations: value.analysis.explanations,
                provenance: value.analysis.provenance,
                errors: value.errors,
                hints: value.hints,
            };
        },
        /** Publish the stored analysis as a version covering what it really covers. */
        async publish(args) {
            const value = await controller.publishAnalysis({
                passageId: requireString(args.passageId, 'passageId'),
                overallTranslation: typeof args.overallTranslation === 'string' ? args.overallTranslation : null,
                cohesion: typeof args.cohesion === 'string' ? args.cohesion : '',
            }, signal());
            if (value.published !== true)
                return { refused: true, published: false, reason: value.reason };
            return {
                published: true,
                versionId: value.versionId,
                revision: value.revision,
                coveredCount: value.coveredCount,
            };
        },
        /** The declared lexicon sources, so a caller cannot invent one. */
        async sources() {
            return { sources: controller.listLexiconSourceKinds() };
        },
        /**
         * Fetch one declared source for one entry.
         *
         * The verdict is the result: an HTTP 200 without a usable body is reported as
         * a failed fetch with its reason, and the attempt is stored on the entry.
         */
        async fetchSource(args) {
            const value = await controller.fetchLexiconSource({
                entryId: requireString(args.entryId, 'entryId'),
                source: requireString(args.source, 'source'),
                section: requireString(args.section, 'section'),
                mot: requireString(args.mot, 'mot'),
            }, signal());
            if (value.fetched !== true)
                return { refused: true, fetched: false, reason: value.reason };
            return {
                fetched: true,
                ok: value.ok,
                outcome: value.outcome,
                note: value.note,
                note2: 'ok is the gate verdict, not the HTTP status; a page of site chrome is a failure.',
            };
        },
        /** The reader's own mastery decision for one grammar point. */
        async mastery(args) {
            const mastery = requireString(args.mastery, 'mastery');
            if (mastery !== 'learning' && mastery !== 'reviewing' && mastery !== 'known') {
                throw new Error('mastery must be learning, reviewing, or known');
            }
            const value = await controller.setGrammarMastery({
                entryId: requireString(args.entryId, 'entryId'),
                mastery,
                expectedRevision: typeof args.expectedRevision === 'number' ? args.expectedRevision : null,
                // The operation id must cover the whole intent. Deriving it from the entry
                // and the new value alone made two *different* requests — one pinning the
                // revision it saw, one not — collapse into "already updated", which would
                // quietly skip the conflict check that is the point of the revision guard.
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : await deterministicUuid('french-reader/mastery', [
                        requireString(args.entryId, 'entryId'),
                        mastery,
                        String(typeof args.expectedRevision === 'number' ? args.expectedRevision : 'none'),
                    ].join('\u0000')),
            }, signal());
            if (value.reason === 'revision-conflict' || value.reason === 'entry-unknown') {
                return {
                    refused: true,
                    updated: false,
                    reason: value.reason,
                    revision: value.revision,
                    note: 'The revision you saw is not the current one: re-read the entry and decide again.',
                };
            }
            if (value.updated !== true && value.reason === 'unchanged') {
                return {
                    updated: false,
                    reason: value.reason,
                    revision: value.revision,
                    note: 'That is already its mastery: nothing was written.',
                };
            }
            return {
                updated: value.updated,
                alreadyUpdated: value.alreadyUpdated === true,
                reason: value.reason,
                revision: value.revision,
                previous: value.previous,
                note: 'Mastery is the reader\'s judgement; the automatic accumulation path never writes it.',
            };
        },
        async export() {
            const bundle = await controller.exportLibrary(signal());
            return { schemaVersion: bundle.schemaVersion, exportedAt: bundle.exportedAt, records: bundle.records.length, bundle };
        },
        async import(args) {
            const bundle = args.bundle;
            if (bundle === null || typeof bundle !== 'object')
                throw new Error('bundle is required');
            if (bundle.schemaVersion !== 1) {
                return { refused: true, imported: 0, skipped: 0, conflicts: [{ key: '', reason: 'unsupported-bundle' }] };
            }
            const value = await controller.importLibrary(bundle, signal());
            return {
                imported: value.imported,
                skipped: value.skipped,
                // Conflicting records are reported and left untouched: no silent overwrite.
                conflicts: value.conflicts,
            };
        },
        async mot(args) {
            const mot = requireString(args.mot, 'mot');
            const partOfSpeech = typeof args.partOfSpeech === 'string' && args.partOfSpeech !== ''
                ? args.partOfSpeech
                : null;
            const lookup = await controller.lookupMot(mot, partOfSpeech, signal());
            // A hit is final: the stored entry is returned as is.
            if (lookup.found)
                return { ...describeLookup(lookup), generated: false };
            if (args.create !== true) {
                return {
                    ...describeLookup(lookup),
                    generated: false,
                    hint: 'Not stored yet. Pass create: true with partOfSpeech and definition to store it, and keep the exact form.',
                };
            }
            const created = await controller.createLexiconEntry({
                mot,
                partOfSpeech: requireString(partOfSpeech, 'partOfSpeech'),
                lemma: typeof args.lemma === 'string' && args.lemma !== '' ? args.lemma : null,
                forms: Array.isArray(args.forms) ? args.forms.filter((form) => typeof form === 'string') : [],
                definition: requireString(args.definition, 'definition'),
                label: typeof args.label === 'string' ? args.label : '',
                provenance: args.provenance === 'user' || args.provenance === 'mixed' ? args.provenance : 'ai',
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : await deterministicUuid('french-reader/mot', [mot, partOfSpeech ?? ''].join('\u0000')),
            }, signal());
            if (created.created === false) {
                return created.exists === true
                    ? { found: true, entryId: created.entryId, generated: false, hint: 'The entry already existed; nothing was created.' }
                    : { refused: true, created: false, reason: created.reason };
            }
            const after = await controller.lookupMot(mot, partOfSpeech, signal());
            return { ...describeLookup(after), generated: true, entryId: created.entryId };
        },
        async lexicon(args) {
            const entries = await controller.listLexicon(signal());
            const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : 50;
            return {
                total: entries.length,
                entries: entries.slice(0, limit).map((entry) => ({
                    entryId: entry.entryId,
                    mot: entry.mot,
                    partOfSpeech: entry.partOfSpeech,
                    lemma: entry.lemma,
                    forms: entry.forms.length,
                    senses: entry.senses.length,
                    occurrences: entry.occurrences.length,
                    sources: entry.sources.length,
                    status: entry.status,
                    updatedAt: entry.updatedAt,
                })),
            };
        },
        async occurrence(args) {
            const value = await controller.appendLexiconOccurrence({
                entryId: requireString(args.entryId, 'entryId'),
                passageId: requireString(args.passageId, 'passageId'),
                anchorId: typeof args.anchorId === 'string' && args.anchorId !== '' ? args.anchorId : PASSAGE_ANCHOR_ID,
                excerpt: requireString(args.excerpt ?? args.text, 'excerpt'),
                note: typeof args.note === 'string' ? args.note : '',
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : await deterministicUuid('french-reader/occurrence', [
                        requireString(args.entryId, 'entryId'),
                        typeof args.excerpt === 'string' ? args.excerpt : '',
                        typeof args.note === 'string' ? args.note : '',
                    ].join('\u0000')),
            }, signal());
            if (value.appended === false && value.alreadyAppended !== true) {
                return { refused: true, appended: false, reason: value.reason };
            }
            return {
                appended: value.appended,
                alreadyAppended: value.alreadyAppended === true,
                occurrenceId: value.occurrenceId,
                note: 'The context note is stored with the entry but separate from its general senses.',
            };
        },
        async select(args) {
            const raw = Array.isArray(args.ranges) ? args.ranges : [];
            if (raw.length === 0)
                throw new Error('ranges is required, e.g. [{start, end}]');
            const ranges = raw.map((entry) => {
                const item = entry;
                if (typeof item.start !== 'number' || typeof item.end !== 'number') {
                    throw new Error('each range needs numeric start and end offsets into the passage source');
                }
                return { start: item.start, end: item.end };
            });
            const passageId = requireString(args.passageId, 'passageId');
            const value = await controller.createSelection({
                passageId,
                ranges,
                note: typeof args.note === 'string' ? args.note : '',
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : await deterministicUuid('french-reader/selection', [passageId, JSON.stringify(ranges)].join('\u0000')),
            }, signal());
            if (value.created === false && value.alreadyExisted !== true) {
                return { refused: true, created: false, reason: value.reason };
            }
            return {
                created: value.created,
                alreadyExisted: value.alreadyExisted === true,
                anchorId: value.anchorId,
                excerpt: value.excerpt,
                ranges: value.ranges,
                note: 'Use this anchorId with translate, branch, or grammar intents.',
            };
        },
        async source(args) {
            const passageId = requireString(args.passageId, 'passageId');
            const revision = typeof args.revision === 'number' ? args.revision : 1;
            const value = await controller.readSourceRevision(passageId, revision, signal());
            return value.found
                ? { found: true, revision, text: value.text }
                : { found: false, revision, reason: 'revision-unknown' };
        },
        async revise(args) {
            const passageId = requireString(args.passageId, 'passageId');
            const sourceText = requireString(args.sourceText, 'sourceText');
            const value = await controller.reviseSource({
                passageId,
                operationId: typeof args.operationId === 'string' && args.operationId !== ''
                    ? args.operationId
                    : await deterministicUuid('french-reader/revise', `${passageId}\u0000${sourceText}`),
                expectedSourceRevision: typeof args.expectedSourceRevision === 'number' ? args.expectedSourceRevision : 1,
                sourceText,
                note: typeof args.note === 'string' && args.note !== '' ? args.note : null,
            }, signal());
            if (value.revised === false && value.alreadyRevised !== true) {
                return { refused: true, revised: false, reason: value.reason, sourceRevision: value.sourceRevision };
            }
            return {
                revised: value.revised,
                alreadyRevised: value.alreadyRevised === true,
                sourceRevision: value.sourceRevision,
                note: 'Annotations keep their original span; read them again to see resolved, relocated, or unresolved.',
            };
        },
        async analysis(args) {
            const passageId = requireString(args.passageId, 'passageId');
            const value = await controller.listAnalysis({ passageId }, signal());
            if (value.analysis === null)
                return { found: false, passageId };
            return {
                found: true,
                passageId,
                translations: value.analysis.translations.map((entry) => ({
                    translationId: entry.id,
                    anchorId: entry.anchorId,
                    anchor: entry.anchor,
                    anchorStatus: entry.anchorStatus,
                    source: entry.source,
                    note: entry.note,
                    anchorReason: entry.anchorReason,
                    language: entry.language,
                    text: entry.text,
                    createdAt: entry.createdAt,
                })),
                adopted: value.adoptions,
                reconciliation: value.reconciliation,
                branches: value.analysis.branches.map((entry) => ({
                    branchId: entry.id,
                    parentId: entry.parentId,
                    anchorId: entry.anchorId,
                    anchor: entry.anchor,
                    anchorStatus: entry.anchorStatus,
                    anchorReason: entry.anchorReason,
                    kind: entry.kind,
                    title: entry.title,
                    body: entry.body,
                })),
            };
        },
    });
    return {
        name: 'french_reader',
        description: DESCRIPTION,
        timeoutMs: 600_000,
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: [
                        'list', 'preview', 'conjugation', 'coverage', 'save', 'read', 'archive', 'translate', 'branch', 'analysis',
                        'answer', 'resume', 'runs', 'source', 'select', 'revise', 'backfill', 'export', 'import', 'adopt', 'mot', 'lexicon', 'occurrence', 'grammar', 'resolve', 'render', 'section', 'lexiconSource',
                        'backends', 'models', 'context', 'discuss', 'discussion', 'ask', 'sentContext',
                        'coverageReport', 'analyse', 'sentence', 'publish', 'sources', 'fetchSource', 'mastery',
                        'conjugationData',
                    ],
                    description: 'Action to run',
                },
                passageId: { type: 'string', description: 'Passage id returned by save or list' },
                title: { type: 'string', description: 'Passage title (save)' },
                sourceText: { type: 'string', description: 'Exact French source, one paragraph per blank-line block (save)' },
                anchorId: { type: 'string', description: 'passage | pN | pN.sM' },
                language: { type: 'string', description: 'Target language tag, default zh-Hans' },
                body: { type: 'string', description: 'Branch body, or the text to store (branch / section)' },
                parentId: { type: 'string', description: 'Parent branch id to hang this branch under (branch)' },
                operationId: { type: 'string', description: 'Reuse only when retrying the same write' },
                id: { type: 'string', description: 'Pre-generated passage id (save)' },
                expectedSourceRevision: { type: 'number', description: 'Source revision the caller saw (archive)' },
                translationId: { type: 'string', description: 'The variant to adopt (adopt)' },
                source: { type: 'string', enum: ['ai', 'user'], description: 'translate: who authored this variant' },
                note: { type: 'string', description: 'translate: how this variant differs; revise: why the source changed' },
                mot: { type: 'string', description: 'The exact French form looked up (mot)' },
                conjugationLemma: { type: 'string', description: 'conjugationData: the verb infinitive, e.g. venir' },
                conjugationMode: { type: 'string', enum: ['fetch', 'read', 'list'], description: 'conjugationData: read stored data, fetch it from the source, or list what is stored' },
                entryId: { type: 'string', description: 'Vocabulary entry id (occurrence)' },
                excerpt: { type: 'string', description: 'The phrase this reading is about (occurrence)' },
                create: { type: 'boolean', description: 'mot: store the entry when the exact form is not stored yet' },
                definition: { type: 'string', description: 'mot: the sense for this entry (required when create is true)' },
                label: { type: 'string', description: 'mot: short sense label' },
                lemma: { type: 'string', description: 'mot: related base form (never used as the lookup key)' },
                forms: { type: 'array', items: { type: 'string' }, description: 'mot: inflected forms this entry claims' },
                provenance: { type: 'string', enum: ['ai', 'user', 'mixed'], description: 'mot: who authored the content' },
                revision: { type: 'number', description: 'Source revision to read (source)' },
                sourceRevision: { type: 'number', description: 'The revision those notes were written under (backfill)' },
                sentence: { type: 'string', description: 'coverage: the exact sentence being analysed' },
                constituents: {
                    type: 'array',
                    items: { type: 'object', properties: {}, required: [], additionalProperties: true },
                    description: 'coverage: [{label, start, end}] ranges of the sentence this analysis accounts for',
                },
                claim: {
                    type: 'object', properties: {}, required: [], additionalProperties: true,
                    description: 'conjugation: {infinitive, inputForm, inputTense, candidates?, evidence?, blocks:[{tense, rows:[{person, form}], stem?, endings?}], classification?, classificationVerified?, irregularNote?}',
                },
                ranges: {
                    type: 'array',
                    items: { type: 'object', properties: {}, required: [], additionalProperties: true },
                    description: 'select: [{start, end}] half-open character ranges into the passage source; several ranges make one discontinuous anchor',
                },
                section: { type: 'string', description: 'Card section id: overview|sense|etymology|semanticEvolution|conjugation|collocations|culture|fixedExpressions' },
                text: { type: 'string', description: 'section: the text to store' },
                kind: { type: 'string', enum: [...BRANCH_KINDS], description: 'Branch kind (branch)' },
                sourceKind: { type: 'string', description: 'lexiconSource: which source, e.g. cnrtl' },
                httpStatus: { type: 'number', description: 'lexiconSource: the HTTP status the fetch returned' },
                entryFound: { type: 'boolean', description: 'lexiconSource: whether the requested headword was on the page' },
                truncated: { type: 'boolean', description: 'lexiconSource: whether the content was cut off' },
                parseFailed: { type: 'boolean', description: 'lexiconSource: whether extraction failed' },
                url: { type: 'string', description: 'lexiconSource: where it came from' },
                wantsEtymology: { type: 'boolean', description: 'render: include §3 for types that omit it by default' },
                pendingId: { type: 'string', description: 'The pending candidate to close (resolve)' },
                decision: { type: 'string', enum: ['attach', 'create', 'discard'], description: 'resolve: how to close it' },
                keyPoints: { type: 'string', description: 'resolve/attach: the new rule wording, only when revising deliberately' },
                bundle: {
                    type: 'object', properties: {}, required: [], additionalProperties: true,
                    description: 'import: the object returned by export',
                },
                question: { type: 'string', description: 'The French question this answer responds to (answer)' },
                answer: { type: 'string', description: 'The final answer text to commit (answer)' },
                intents: {
                    type: 'array',
                    items: { type: 'object', properties: {}, required: [], additionalProperties: true },
                    description: 'answer: knowledge writes this answer intends, [{kind: branch|translation|grammar, anchorId?, title?, body, level?, module?, pitfall?}]',
                },
                offset: { type: 'number', description: 'List offset (list)' },
                limit: { type: 'number', description: 'List page size (list)' },
            },
            required: ['action'],
            additionalProperties: true,
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    ok: { type: 'boolean' },
                    action: { type: 'string' },
                    detail: { type: 'object' },
                },
                required: ['ok', 'action', 'detail'],
            },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        async execute(args, exec) {
            const action = typeof args?.action === 'string' ? args.action : '';
            const callSignal = exec?.signal ?? new AbortController().signal;
            const callActions = actions(() => callSignal);
            const run = callActions[action];
            if (run === undefined) {
                return { ok: false, action, detail: { error: 'unknown action', allowed: Object.keys(callActions) } };
            }
            try {
                const detail = await run(args);
                const failed = detail.refused === true || detail.found === false;
                return { ok: failed ? false : true, action, detail };
            }
            catch (error) {
                return { ok: false, action, detail: { error: String(error?.message ?? error) } };
            }
        },
    };
}
/** Exact-Mot lookup as the model must see it: hit, or candidates — never merged. */
function describeLookup(lookup) {
    return {
        mot: lookup.mot,
        motKey: lookup.motKey,
        found: lookup.found,
        // Exactly one hit: hand the model the id it needs without digging.
        entryId: lookup.entries.length === 1 ? lookup.entries[0].entryId : null,
        entries: lookup.entries.map((entry) => ({
            entryId: entry.entryId,
            partOfSpeech: entry.partOfSpeech,
            lemma: entry.lemma,
            senses: entry.senses.map((sense) => sense.definition),
            occurrences: entry.occurrences.length,
        })),
        // Related forms and lemmas: candidates only, never a Mot hit.
        candidates: lookup.candidates.map((entry) => ({
            entryId: entry.entryId,
            mot: entry.mot,
            partOfSpeech: entry.partOfSpeech,
            lemma: entry.lemma,
        })),
    };
}
function requireString(value, field) {
    if (typeof value !== 'string' || value.trim() === '')
        throw new Error(`${field} is required`);
    return value;
}
/**
 * Per-run completion as the model and the change card must see it: what the
 * answer was, and which intended writes actually landed.
 */
function describeRun(run) {
    const applied = run.intents.filter((intent) => intent.status === 'applied').length;
    const failed = run.intents.filter((intent) => intent.status === 'failed').length;
    const pending = run.intents.filter((intent) => intent.status === 'pending').length;
    return {
        runId: run.id,
        anchorId: run.anchorId,
        question: run.question,
        answer: run.answer,
        status: failed > 0 ? 'partial' : pending > 0 ? 'pending' : 'complete',
        total: run.intents.length,
        applied,
        failed,
        pending,
        // Null for a run whose intents were supplied by the caller; otherwise what the
        // automatic path found, including "the reply carried nothing usable".
        extraction: run.extraction === undefined || run.extraction === null
            ? null
            : { status: run.extraction.status, points: run.extraction.points, detail: run.extraction.detail },
        intents: run.intents.map((intent) => ({
            intentId: intent.id,
            kind: intent.kind,
            anchorId: intent.anchorId,
            title: intent.title,
            status: intent.status,
            appliedId: intent.appliedId,
            detail: intent.detail,
        })),
    };
}
/**
 * One generation job as evidence, not as an answer: how far the call got
 * (`phase`), what the provider actually sent (`partialText`), and how it ended.
 * This is what "where was it stuck" is answered from after the fact.
 */
function describeJob(job) {
    return {
        jobId: job.id,
        kind: job.kind,
        operationId: job.operationId,
        anchorId: job.anchorId,
        backend: job.backend,
        model: job.model,
        status: job.status,
        phase: job.phase ?? null,
        attempt: job.attempt,
        finish: job.finish,
        failure: job.failure,
        resolvedModel: job.resolvedModel,
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
        finishedAt: job.finishedAt,
        modelCallMs: job.modelCallMs ?? null,
        firstTextDeltaMs: job.firstTextDeltaMs ?? null,
        // The model's actual reply as far as it got: the evidence an unparsable or
        // rejected answer is judged against.
        partialText: job.partialText.length > 4_000 ? `${job.partialText.slice(0, 4_000)}…` : job.partialText,
    };
}
/** Compact anchor listing: ids plus the exact text the model must discuss. */
function describeAnchors(paragraphs) {
    return paragraphs.map((paragraph) => ({
        anchorId: paragraph.id,
        text: paragraph.text,
        sentences: paragraph.sentences.map((sentence) => ({ anchorId: sentence.id, text: sentence.text })),
    }));
}
/**
 * Derive a stable UUID from a namespace and value. Two identical writes produce
 * the same operation id, so a retry is recognised as the same intent instead of
 * appending a duplicate version.
 * @param namespace - Operation family, e.g. `french-reader/branch`.
 * @param value - Content that fully determines the write.
 * @returns A UUID string accepted by the storage schema.
 */
async function deterministicUuid(namespace, value) {
    const bytes = new TextEncoder().encode(`${namespace}\u0000${value}`);
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    const hex = [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    // Version 5 and the RFC 4122 variant, so the string is a valid UUID.
    const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}`;
    const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    return [
        versioned.slice(0, 8), versioned.slice(8, 12), versioned.slice(12, 16),
        `${variant}${hex.slice(17, 20)}`, hex.slice(20, 32),
    ].join('-');
}
