import type { Context } from '@deepseek-ai/cordis';
import type { Domain } from '@deepseek-ai/dsh-storage-domain';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { SourceFetch } from './source-gate.ts';
import { type GenerationBackend } from './generation.ts';
import { FRENCH_READER_DOMAIN, type StoredContextManifest, type StoredSentenceAnalysis, type StoredDiscussionBranch, type StoredRun, type StoredRunExtraction, type StoredGenerationJob, type StoredGrammarEntry, type StoredGrammarPending } from './domain.ts';
import type { AskInput, AskPreview, AskRequest, AskFrame, AskResult, BackendModelView, BackendStatus, CreateBranchRequest, CreateBranchValue, DiscussionView, ListBackendModelsRequest, ListBackendModelsValue, ListBackendsRequest, ListBackendsValue, ListDiscussionRequest, PreviewAskRequest, PreviewAskValue, FetchLexiconSourceRequest, FetchLexiconSourceValue, ListLexiconSourcesRequest, ListLexiconSourcesValue, ReadContextRequest, ReadContextValue, AnalyseParagraphRequest, AnalyseParagraphResult, AnalyseSentenceRequest, AnalyseSentenceResult, AnalysisCoverageValue, ReadAnalysisCoverageRequest, PublishAnalysisRequest, PublishAnalysisValue, PutSentenceAnalysisRequest, PutSentenceAnalysisValue, ReadSentenceAnalysisRequest, ReadSentenceAnalysisValue, SetGrammarMasteryRequest, SetGrammarMasteryValue, RecordConclusionRequest, RecordConclusionValue, SetBranchStateRequest, SetBranchStateValue } from './generation-types.ts';
import type { AddBranchRequest, AddBranchValue, ArchivePassageRequest, ArchivePassageValue, RestorePassageRequest, RestorePassageValue, CreateSelectionRequest, CreateSelectionValue, ListGrammarRequest, ListGrammarValue, ConjugationRequest, FetchConjugationValue, ListLexiconRequest, ListLexiconValue, ReadConjugationValue, RenderLexiconRequest, RenderLexiconValue, ResolveGrammarRequest, ResolveGrammarValue, CreatePassageRequest, CreatePassageValue, ExportLibraryRequest, ExportLibraryValue, ImportLibraryRequest, ImportLibraryValue, ExportPassagesValue, GetPassageRequest, GetPassageValue, ImportPreviewValue, PreviewImportRequest, GetSegmentationRequest, GetSegmentationValue, ListAnalysisRequest, ListAnalysisValue, LexiconLookup, LookupMotRequest, AdoptTranslationRequest, AdoptTranslationValue, LexiconView, ListPassagesRequest, ListPassagesValue, SaveTranslationRequest, SaveTranslationValue } from './types.ts';
/** Host service behind the generated `ctx.remote.frenchReader` namespace. */
export declare class FrenchReaderController extends TypertRemoteService {
    private readonly domain;
    private writeTail;
    /** The one storage table this plugin owns; the store modules take it as data. */
    private table;
    constructor(ctx: Context, domain: Domain<typeof FRENCH_READER_DOMAIN>, backends?: GenerationBackend[] | null);
    listPassages(request: ListPassagesRequest, signal: AbortSignal): Promise<ListPassagesValue>;
    listArchivedPassages(request: ListPassagesRequest, signal: AbortSignal): Promise<ListPassagesValue>;
    getPassage(request: GetPassageRequest, signal: AbortSignal): Promise<GetPassageValue>;
    listBackendsRemote(request: ListBackendsRequest, signal: AbortSignal): ListBackendsValue;
    listBackendModelsRemote(request: ListBackendModelsRequest, signal: AbortSignal): Promise<ListBackendModelsValue>;
    /**
     * What a turn would send, without sending it. The panel shows this list to the
     * reader, and the same compilation is what the real ask transmits.
     */
    previewAskRemote(request: PreviewAskRequest, signal: AbortSignal): PreviewAskValue;
    /**
     * Send one turn to the chosen backend. The model is a decision, not a global:
     * the panel passes the backend and model it showed the reader.
     */
    askRemote(request: AskRequest, signal: AbortSignal): Promise<AskResult>;
    listDiscussionRemote(request: ListDiscussionRequest, signal: AbortSignal): DiscussionView;
    createBranchRemote(request: CreateBranchRequest, signal: AbortSignal): Promise<CreateBranchValue>;
    setBranchStateRemote(request: SetBranchStateRequest, signal: AbortSignal): Promise<SetBranchStateValue>;
    recordConclusionRemote(request: RecordConclusionRequest, signal: AbortSignal): Promise<RecordConclusionValue>;
    /**
     * How much of the passage is analysed, measured against the current sentences
     * rather than claimed.
     */
    readAnalysisCoverageRemote(request: ReadAnalysisCoverageRequest, signal: AbortSignal): AnalysisCoverageValue;
    /** One sentence's stored analysis, with the gate's verdict attached. */
    readSentenceAnalysisRemote(request: ReadSentenceAnalysisRequest, signal: AbortSignal): ReadSentenceAnalysisValue;
    /** Generate one sentence analysis and store it only if it passes the gate. */
    analyseSentenceRemote(request: AnalyseSentenceRequest, signal: AbortSignal): Promise<AnalyseSentenceResult>;
    /**
     * Generate the analyses one paragraph is missing, one model call per sentence.
     */
    analyseParagraphRemote(request: AnalyseParagraphRequest, signal: AbortSignal): Promise<AnalyseParagraphResult>;
    /** Write one sentence analysis supplied directly, through the same gate. */
    putSentenceAnalysisRemote_(request: PutSentenceAnalysisRequest, signal: AbortSignal): Promise<PutSentenceAnalysisValue>;
    /**
     * Publish the analysis as a version, naming the source revision it was written
     * against. Coverage is computed from what is stored.
     */
    publishAnalysisRemote(request: PublishAnalysisRequest, signal: AbortSignal): Promise<PublishAnalysisValue>;
    /**
     * Fetch one declared source for one entry. The verdict the gate reached is what
     * the caller stores; the panel shows it, and a failure is shown as a failure.
     */
    fetchLexiconSourceRemote(request: FetchLexiconSourceRequest, signal: AbortSignal): Promise<FetchLexiconSourceValue>;
    listLexiconSourcesRemote(request: ListLexiconSourcesRequest, signal: AbortSignal): ListLexiconSourcesValue;
    /**
     * The reader's own mastery decision for one grammar point. Nothing automatic
     * writes this field.
     */
    setGrammarMasteryRemote(request: SetGrammarMasteryRequest, signal: AbortSignal): Promise<SetGrammarMasteryValue>;
    /** The exact text one stored answer was sent with, so a claim can be audited. */
    readContextRemote(request: ReadContextRequest, signal: AbortSignal): ReadContextValue;
    /**
     * Archiving is the default removal path. It changes only the library index
     * state; source and analysis records remain exportable and recoverable.
     */
    archivePassage(request: ArchivePassageRequest, signal: AbortSignal): Promise<ArchivePassageValue>;
    restorePassage(request: RestorePassageRequest, signal: AbortSignal): Promise<RestorePassageValue>;
    /**
     * What an import would store. Read-only by construction: the panel shows the
     * boundaries and the flags, and nothing reaches storage until the reader
     * confirms and calls `createPassage`.
     */
    /**
     * Store a reader's phrase selection as an anchor the panel can then use for
     * translations, branches and grammar notes.
     */
    /**
     * A vocabulary card as its output policy renders it, with the policy's own
     * verdict attached: the panel shows the gaps instead of a tidy card.
     */
    renderLexiconRemote(request: RenderLexiconRequest, signal: AbortSignal): Promise<RenderLexiconValue>;
    /**
     * Close one pending candidate from the panel. The decision is the reader's:
     * attaching without new wording only adds the example, naming new wording
     * revises the rule, and neither can happen by accident.
     */
    resolveGrammarCandidateRemote(request: ResolveGrammarRequest, signal: AbortSignal): Promise<ResolveGrammarValue>;
    /**
     * The vocabulary library as the panel lists it, projected to the wire shape so
     * the client never sees storage internals.
     */
    listLexiconRemote(request: ListLexiconRequest, signal: AbortSignal): Promise<ListLexiconValue>;
    /**
     * Grammar entries and the candidates still awaiting a human decision. The
     * panel shows both; decisions themselves go through their own endpoint.
     */
    listGrammarRemote(request: ListGrammarRequest, signal: AbortSignal): Promise<ListGrammarValue>;
    createSelectionRemote(request: CreateSelectionRequest, signal: AbortSignal): Promise<CreateSelectionValue>;
    previewImport(request: PreviewImportRequest, signal: AbortSignal): Promise<ImportPreviewValue>;
    createPassage(request: CreatePassageRequest, signal: AbortSignal): Promise<CreatePassageValue>;
    exportPassages(signal: AbortSignal): Promise<ExportPassagesValue>;
    /**
     * Segmentation is derived from the immutable source, so the first call
     * persists it and every later call returns the stored anchors: anchor ids in
     * translations and branches must keep pointing at the same text.
     */
    getSegmentation(request: GetSegmentationRequest, signal: AbortSignal): Promise<GetSegmentationValue>;
    saveTranslation(request: SaveTranslationRequest, signal: AbortSignal): Promise<SaveTranslationValue>;
    addBranch(request: AddBranchRequest, signal: AbortSignal): Promise<AddBranchValue>;
    listAnalysis(request: ListAnalysisRequest, signal: AbortSignal): Promise<ListAnalysisValue>;
    /**
     * Where does a stored note sit in the current source?
     *
     * Same revisions and the stored span still carries the excerpt → resolved.
     * Otherwise the excerpt is looked up in the current text: exactly one match
     * relocates the note (the plan tolerates a deterministic move, never a guess),
     * no match or several matches leaves it unresolved with its old anchor.
     */
    private resolveAnchor;
    /**
     * Correct a stored source. The new revision is written first and the catalogue
     * pointer flips afterwards, so a crash in between leaves an unreferenced
     * revision instead of a half-updated passage. Nothing overwrites history.
     */
    reviseSource(input: {
        passageId: string;
        operationId: string;
        expectedSourceRevision: number;
        sourceText: string;
        note: string | null;
    }, signal: AbortSignal): Promise<{
        revised: boolean;
        alreadyRevised?: boolean;
        reason?: string;
        sourceRevision?: number;
    }>;
    /**
     * The text of one revision. A never-revised passage has no history row: its
     * current text *is* revision 1. History rows appear from the first correction
     * onwards, which also backfills the revision being replaced.
     */
    readSourceRevision(passageId: string, revision: number, signal: AbortSignal): Promise<{
        found: boolean;
        text?: string;
        operationId?: string;
    }>;
    private findSourceByOperation;
    /**
     * Exact-Mot lookup. No model call and no network request happens here: a hit
     * returns the stored entry, a miss returns only *candidates*. The rules live in
     * `lexicon-store`, which reads and writes the same table this controller owns.
     */
    lookupMot(mot: string, partOfSpeech: string | null, signal: AbortSignal): Promise<LexiconLookup>;
    /**
     * Create one entry for an exact Mot. An existing entry is never overwritten:
     * the caller gets `exists` with the entry id and decides whether to append an
     * occurrence or edit deliberately.
     */
    createLexiconEntry(input: {
        mot: string;
        partOfSpeech: string;
        lemma: string | null;
        forms: readonly string[];
        definition: string;
        label: string;
        provenance: 'ai' | 'user' | 'mixed';
        operationId: string;
    }, signal: AbortSignal): Promise<{
        created: boolean;
        exists?: boolean;
        entryId?: string;
        reason?: string;
    }>;
    /**
     * Append a context note for one reading. It lives in the occurrence list, so a
     * single reading never rewrites the entry's general senses or sections.
     */
    appendLexiconOccurrence(input: {
        entryId: string;
        passageId: string;
        anchorId: string;
        excerpt: string;
        note: string;
        operationId: string;
    }, signal: AbortSignal): Promise<{
        appended: boolean;
        alreadyAppended?: boolean;
        reason?: string;
        occurrenceId?: string;
    }>;
    /** Rebuild the derived index from the entries themselves. Explicit and verifiable. */
    rebuildLexiconIndex(signal: AbortSignal): Promise<{
        entries: number;
        forms: number;
        repaired: number;
    }>;
    listLexicon(signal: AbortSignal): Promise<LexiconView[]>;
    private readLexiconEntries;
    private readPassage;
    /**
     * Only a segmentation of the current source revision *and* the current rule
     * revision is reusable: a bump of `SEGMENTATION_REVISION` means stored
     * anchors were computed by different rules and must be derived again.
     */
    private readSegmentation;
    private persistSegmentation;
    /**
     * Whether an anchor id names something in this passage: the passage itself, one
     * of its paragraphs or sentences, or a stored selection.
     */
    private resolveAnchorId;
    /**
     * Store one reader selection as a reusable anchor.
     *
     * The token is derived from the revision and the ranges, so selecting the same
     * words again returns the same anchor instead of piling up duplicates. A
     * discontinuous selection keeps its ranges and joins its text with a gap
     * marker, so `ne … point` is one anchor rather than two unrelated ones.
     */
    createSelection(input: {
        passageId: string;
        ranges: readonly {
            start: number;
            end: number;
        }[];
        note: string;
        operationId: string;
    }, signal: AbortSignal): Promise<{
        created: boolean;
        alreadyExisted?: boolean;
        reason?: string;
        anchorId?: string;
        excerpt?: string;
        ranges?: {
            start: number;
            end: number;
        }[];
    }>;
    /**
     * Resolve one anchor id to the span it names, so a discussion note records the
     * text it is about rather than a sentence number that later revisions may move.
     */
    private anchorRef;
    private readAnalysis;
    /**
     * Commit one answered question together with the knowledge writes it intends.
     *
     * The answer and every intent land in a single record, so the durable state is
     * never "answer lost because the third write failed". Intents are then applied
     * one by one, each marked in the same run record: a crash mid-way leaves the
     * answer readable, the finished intents valid, and the rest pending for
     * `resumeRuns`.
     */
    commitRun(input: {
        passageId: string;
        operationId: string;
        anchorId: string;
        question: string;
        answer: string;
        intents: readonly {
            kind: 'branch' | 'translation' | 'grammar';
            anchorId: string;
            title: string;
            body: string;
            level?: string | null;
            module?: string | null;
            pitfall?: string;
        }[];
        /**
         * How the automatic grammar path read this answer. The agent path that supplies
         * its own intents leaves it out; the ask path records what it found, including
         * the honest "there was nothing usable here".
         */
        extraction?: StoredRunExtraction | null;
    }, signal: AbortSignal): Promise<{
        committed: boolean;
        reason?: string;
        unchanged?: boolean;
        run?: StoredRun;
    }>;
    /** Finish whatever a previous call left pending. Idempotent. */
    resumeRuns(passageId: string, signal: AbortSignal): Promise<{
        resumed: number;
        runs: StoredRun[];
    }>;
    /**
     * Adopt one variant for one anchor. The paragraph's overall translation is not
     * touched: adoption only moves the sentence pointer and records what it
     * replaced, so the disagreement surfaces instead of being overwritten.
     */
    adoptTranslation(input: {
        passageId: string;
        anchorId: string;
        translationId: string;
        operationId: string;
    }, signal: AbortSignal): Promise<{
        adopted: boolean;
        alreadyAdopted?: boolean;
        reason?: string;
        previousId?: string | null;
    }>;
    /** The overall translation currently on record: the latest one written. */
    private currentOverall;
    private currentOverallId;
    private readAdoptions;
    private writeAdoptions;
    /**
     * Which sentences were adopted after the current overall translation was
     * written. Derived on read, so it cannot drift from the records themselves.
     */
    private reconciliationOf;
    /**
     * Explicit migration for records written before spans existed. The caller
     * *names* the revision those records were written under, so the derived span
     * is evidence-backed rather than guessed; records whose anchor does not exist
     * in that revision are reported, never invented.
     */
    backfillAnchors(input: {
        passageId: string;
        sourceRevision: number;
    }, signal: AbortSignal): Promise<{
        backfilled: boolean;
        reason?: string;
        migrated: number;
        skipped: {
            id: string;
            anchorId: string;
        }[];
    }>;
    /** Every backend this plugin can send a turn to, with its honest status. */
    listBackends(): BackendStatus[];
    listBackendModels(backendId: string, signal: AbortSignal): Promise<{
        models: BackendModelView[];
        reason?: string;
    }>;
    /**
     * Compile a turn's context without sending it. This is the same code path the
     * real ask uses, so what the reader is shown is what would be sent.
     */
    previewAsk(input: {
        passageId: string;
        branchId: string;
        question: string;
        backend: string;
        model: string;
        extras?: readonly {
            refId: string;
            reason: string;
            text: string;
        }[];
    }, signal: AbortSignal): AskPreview;
    /**
     * Send one turn: compile, generate, and store the question and the answer as
     * branch messages.
     *
     * The question is stored before the model is called, so a timeout cannot lose
     * what was asked; the compiled manifest is stored with the answer, so "what was
     * it allowed to see" survives a restart. A failure stores a failed attempt
     * rather than an empty turn.
     */
    ask(input: AskInput, signal: AbortSignal, 
    /**
     * Called with each delta as the provider produces it. The generation job records
     * progress either way; this is how a streamed turn shows it while it arrives.
     */
    observe?: (delta: string) => void): Promise<AskResult>;
    /**
     * File one answered turn's grammar points.
     *
     * Single turn means the points arrive with the answer; this only has to write
     * them. Every outcome is recorded, including the ones with nothing to write, so
     * "this question raised no reusable rule" and "the reply was unusable" are
     * distinguishable afterwards instead of both looking like silence.
     */
    private recordTurnGrammar;
    /** Every branch of one passage, with its messages and their generation state. */
    listDiscussion(passageId: string, signal: AbortSignal): DiscussionView;
    createDiscussionBranch(input: {
        passageId: string;
        anchorId: string;
        kind: StoredDiscussionBranch['kind'];
        title: string;
        parentId?: string | null;
        forkedFrom?: {
            branchId: string;
            messageId: string;
        } | null;
        operationId: string;
    }, signal: AbortSignal): Promise<{
        created: boolean;
        alreadyCreated?: boolean;
        reason?: string;
        branchId?: string;
    }>;
    setDiscussionBranchState(input: {
        passageId: string;
        branchId: string;
        status?: StoredDiscussionBranch['status'];
        title?: string;
    }, signal: AbortSignal): Promise<{
        updated: boolean;
        reason?: string;
    }>;
    /** Record a conclusion the reader confirmed, with the message it came from. */
    recordConclusion(input: {
        passageId: string;
        branchId: string;
        anchorId: string;
        messageId: string | null;
        text: string;
        status: 'proposed' | 'confirmed';
        operationId: string;
    }, signal: AbortSignal): Promise<{
        added: boolean;
        alreadyAdded?: boolean;
        reason?: string;
        conclusionId?: string;
    }>;
    /**
     * Fetch one declared source for one entry, deliberately.
     *
     * The model never triggers this: the reader asks, the Host fetches through
     * `ctx.web`, and the response is judged and stored with what it actually
     * supports. The gate's verdict is returned, not a claim.
     */
    fetchLexiconSource(input: {
        entryId: string;
        source: string;
        section: string;
        mot: string;
    }, signal: AbortSignal): Promise<{
        fetched: boolean;
        reason?: string;
        ok?: boolean;
        outcome?: string;
        note?: string;
        stored?: boolean;
    }>;
    /**
     * Exact-Mot lookup, as the reader's own act.
     *
     * The lookup path never calls a model and never fetches: a hit is the stored entry
     * returned as is, and a miss returns related forms as *candidates* that are never
     * silently merged into the Mot. This is the endpoint the reading surface needs to
     * show a word without collecting it — lookup and collection stay separate.
     */
    lookupMotRemote(request: LookupMotRequest, signal: AbortSignal): Promise<LexiconLookup>;
    /**
     * Adopt one translation variant for one anchor.
     *
     * Adoption moves the sentence pointer and records what it replaced; the paragraph's
     * overall translation is deliberately not rewritten, so the disagreement surfaces
     * instead of being overwritten.
     */
    adoptTranslationRemote(request: AdoptTranslationRequest, signal: AbortSignal): Promise<AdoptTranslationValue>;
    readConjugationRemote(request: ConjugationRequest, signal: AbortSignal): ReadConjugationValue;
    fetchConjugationRemote(request: ConjugationRequest, signal: AbortSignal): Promise<FetchConjugationValue>;
    /** The sources this plugin may request, so a caller cannot invent one. */
    listLexiconSourceKinds(): {
        source: string;
        sections: string[];
    }[];
    /**
     * Fetch one verb's pronunciation dataset, because the reader asked for it.
     *
     * Nothing fetches on its own and no model triggers this: the reader opens a
     * conjugation card and asks for the data. What comes back is derived from the
     * source's own forms, and every ending — including "not now" — is stored, so the
     * card can say which of the three things is true: here are the bases, the paradigm
     * is incomplete, or nothing has been fetched.
     */
    fetchConjugation(input: ConjugationRequest, signal: AbortSignal): Promise<FetchConjugationValue>;
    /**
     * What is known about one verb, without fetching anything.
     *
     * The three states are reported as themselves: a dataset with its bases, a fetch
     * that did not finish with its reason, or `no-data` — which is an answer, not an
     * error, and never a paradigm generated from memory.
     */
    readConjugation(input: ConjugationRequest, signal: AbortSignal): ReadConjugationValue;
    /** Every verb with stored pronunciation data, newest first. */
    listConjugationRecords(): {
        lemma: string;
        source: string;
        fetchStatus: string;
        fetchedAt: string;
    }[];
    /**
     * Move one grammar entry's mastery, as the reader's own act.
     *
     * The automatic accumulation path may never do this; it is the one write that
     * says how well the reader knows a point, and it is recorded as a version.
     */
    setGrammarMastery(input: {
        entryId: string;
        mastery: 'learning' | 'reviewing' | 'known';
        expectedRevision: number | null;
        operationId: string;
    }, signal: AbortSignal): Promise<{
        updated: boolean;
        alreadyUpdated?: boolean;
        reason?: string;
        revision?: number;
        previous?: string;
    }>;
    /**
     * What the passage's analysis covers, measured against the current sentences.
     *
     * A sentence with no analysis is missing, one whose analysis has errors is
     * failed, and one whose analysis describes different text is stale — so "every
     * sentence is analysed" is a number rather than a claim.
     */
    readAnalysisCoverage(passageId: string, signal: AbortSignal): AnalysisCoverageValue;
    /**
     * One sentence's stored analysis, as the panel renders it.
     *
     * The analysis is read against the *current* sentence, never against the text
     * it remembers: a source correction moves the sentence, and then the stored
     * analysis is stale — reported as such, with the same text comparison
     * `analysisCoverage` uses, rather than returned as a usable analysis.
     */
    readSentenceAnalysis(passageId: string, anchorId: string, signal: AbortSignal): {
        found: boolean;
        stale?: boolean;
        analysis?: StoredSentenceAnalysis;
        errors?: string[];
        hints?: string[];
    };
    /**
     * Generate one sentence analysis through the chosen backend and store it if it
     * passes the gate.
     *
     * The reply is parsed, validated and only then written. A reply that fails is
     * reported with the gate's own errors and stored nowhere, because storing it
     * would put an unusable analysis on screen next to a usable one.
     */
    analyseSentence(input: {
        passageId: string;
        anchorId: string;
        backend: string;
        model: string;
        reasoningEffort?: string | null;
        operationId: string;
    }, signal: AbortSignal): Promise<AnalyseSentenceResult>;
    /**
     * Generate the analyses this paragraph is missing, one sentence at a time.
     *
     * The reader sees the count before pressing: this spends one model call per
     * sentence, so it is never started silently. A sentence whose reply fails the
     * gate is reported and skipped — the run continues with the others rather than
     * discarding the work that succeeded.
     */
    analyseParagraph(input: {
        passageId: string;
        paragraphId: string;
        backend: string;
        model: string;
        reasoningEffort?: string | null;
        operationId: string;
    }, signal: AbortSignal): Promise<AnalyseParagraphResult>;
    /** Write one sentence analysis a reader or an editor supplies directly. */
    putSentenceAnalysisRemote(input: {
        passageId: string;
        anchorId: string;
        analysisJson: string;
    }, signal: AbortSignal): Promise<{
        stored: boolean;
        reason?: string;
        errors?: string[];
        hints?: string[];
    }>;
    /**
     * Publish the analysis as a version.
     *
     * Publishing names the source revision and computes coverage from what is
     * stored, so a version cannot claim a sentence it does not contain, and a later
     * source correction leaves the old version readable as "about the old text".
     */
    publishAnalysis(input: {
        passageId: string;
        overallTranslation: string | null;
        cohesion: string;
    }, signal: AbortSignal): Promise<{
        published: boolean;
        reason?: string;
        versionId?: string;
        revision?: number;
        coveredCount?: number;
    }>;
    /**
     * The same turn, streamed.
     *
     * It is the *same* code path: `ask` does the work and this only forwards what it
     * reports, so a streamed turn cannot diverge from a unary one — the stored message,
     * the run, the job and the grammar extraction are identical. The stream adds
     * exactly one thing: the reader can see the answer while it is being written.
     *
     * The terminal frame always arrives, including when the turn was refused, because a
     * stream that simply stops leaves the reader unable to tell "still coming" from
     * "failed" — which is the failure this whole milestone exists to remove.
     */
    streamAsk(request: AskRequest, signal: AbortSignal): AsyncIterable<AskFrame>;
    /**
     * One settled ask, rebuilt from what it stored, with no backend involved.
     *
     * Returns null when any piece is missing, because a partial replay would be worse
     * than generating again: the caller then takes the normal path.
     */
    private replaySettledAsk;
    /**
     * Every generation job on record, newest first.
     *
     * A reader-facing answer to "what happened to my question": finished, cancelled
     * with partial text, or interrupted by a restart.
     */
    listGenerationJobs(passageId: string | null, signal: AbortSignal): StoredGenerationJob[];
    /**
     * Settle jobs a previous Host lifetime left running.
     *
     * Called once at open. Nothing is inferred as complete: an in-flight job whose
     * process is gone is `interrupted`, with whatever partial text it captured kept.
     */
    settleInterruptedJobs(signal?: AbortSignal): Promise<{
        interrupted: number;
    }>;
    /** The compiled context one stored message was sent with, for auditing. */
    readContext(passageId: string, contextId: string, signal: AbortSignal): {
        found: boolean;
        manifest?: StoredContextManifest;
    };
    /**
     * Bring stored records forward to the current shape, once, at Host open.
     *
     * The move is idempotent and never destructive-first: every manifest is durable
     * in its own record before any legacy array is emptied, so an interrupted run
     * leaves the old data readable and is simply retried on the next open. A caller
     * that cannot migrate (a read-only medium) still gets a working plugin: reads
     * fall back to the legacy arrays, and only retention is affected.
     *
     * @returns What this run moved.
     */
    migrateStoredRecords(signal?: AbortSignal): Promise<{
        ran: boolean;
        migrated: number;
        skipped: number;
        emptied: number;
    }>;
    /** Resolve everything one turn needs, or say precisely what is missing. */
    private compileTurn;
    /**
     * The selection one anchor names, when the anchor names one.
     *
     * A selection anchor is only meaningful while the stored ranges still reproduce
     * the excerpt the reader selected: the same token after a source revision would
     * quote different words, and quoting the stored excerpt on trust would send text
     * the reader never chose. `undefined` means "not a selection anchor"; `'stale'`
     * means the turn must be refused rather than sent without its object.
     */
    private selectionText;
    /** The backends, in a fixed order so a listing is stable. */
    private backends;
    /**
     * Whole-library export: raw records with their keys, so an import can restore
     * every relationship (source revisions, discussions, variants, adoptions,
     * runs, vocabulary) rather than a lossy projection.
     */
    exportLibrary(signal: AbortSignal): Promise<{
        schemaVersion: 1;
        exportedAt: string;
        records: {
            key: string;
            record: unknown;
        }[];
    }>;
    /**
     * The whole library as the panel's backup: every record with its key, so the
     * backup holds analysis, discussions, vocabulary and runs — not only sources.
     */
    exportLibraryRemote(request: ExportLibraryRequest, signal: AbortSignal): Promise<ExportLibraryValue>;
    importLibraryRemote(request: ImportLibraryRequest, signal: AbortSignal): Promise<ImportLibraryValue>;
    /**
     * Restore an exported library without ever overwriting local work.
     *
     * Every record is compared before it is written: absent → imported, identical
     * → skipped, different → reported as a conflict and left alone. A partial
     * import stays valid because each record is independent.
     */
    importLibrary(bundle: {
        schemaVersion?: unknown;
        records?: readonly {
            key?: unknown;
            record?: unknown;
        }[];
    }, signal: AbortSignal): Promise<{
        imported: number;
        skipped: number;
        conflicts: {
            key: string;
            reason: string;
        }[];
    }>;
    listRuns(passageId: string, signal: AbortSignal): Promise<StoredRun[]>;
    private readRuns;
    private writeRuns;
    /**
     * Apply every pending intent of one run, persisting after each so the run
     * record always states what actually completed. An intent whose write fails
     * is marked failed and never blocks its siblings.
     */
    private applyPendingIntents;
    /**
     * Automatic grammar accumulation, restricted by the whitelist.
     *
     * The automatic path may only touch the ask counter, the last-asked stamp, the
     * examples and the pitfalls. `keyPoints`, `level`, `module` and `mastery` are
     * never rewritten here — a rule change needs its own explicit action. A near
     * match the rules cannot decide between becomes a pending candidate instead of
     * a silent merge.
     */
    private accumulateGrammar;
    /**
     * Which grammar entries one real question has already been counted against.
     *
     * The unit of counting is the question, not the write: a question that yields
     * two intents about the same point is still one question. Reading the marker
     * off the stored examples means the record itself is the evidence, so a crash
     * or a retry cannot count twice.
     */
    private grammarIntentsAlreadyCounted;
    /** Entries whose topic shares every significant token — a near, not exact, match. */
    private nearGrammarMatches;
    /**
     * Close one pending candidate. This is the explicit human decision the plan
     * requires: the automatic path never merges an ambiguous match, and revising a
     * rule is only ever done here, by naming the new wording.
     */
    resolveGrammarPending(input: {
        pendingId: string;
        decision: 'attach' | 'create' | 'discard';
        entryId?: string | null;
        keyPoints?: string | null;
        operationId: string;
    }, signal: AbortSignal): Promise<{
        resolved: boolean;
        alreadyResolved?: boolean;
        reason?: string;
        entryId?: string | null;
        outcome?: string;
    }>;
    /**
     * Render one entry through its policy and report what the policy refuses.
     * Rendering and validation use the same sections, so a card cannot look
     * complete while the gate disagrees.
     */
    renderLexiconEntry(input: {
        entryId: string;
        wantsEtymology?: boolean;
    }, signal: AbortSignal): Promise<{
        found: boolean;
        rendered?: string;
        sections?: {
            number: string;
            title: string;
            required: boolean;
        }[];
        errors?: string[];
        hints?: string[];
    }>;
    /**
     * Record what a source fetch may be claimed for.
     *
     * The response is judged, never assumed: an HTTP 200 with only site chrome is
     * stored as a failed fetch with its reason, so the card shows the attempt
     * instead of asserting a source it does not have.
     */
    recordLexiconSource(input: SourceFetch & {
        entryId: string;
    }, signal: AbortSignal): Promise<{
        recorded: boolean;
        reason?: string;
        ok?: boolean;
        outcome?: string;
        note?: string;
    }>;
    /**
     * Write one section explicitly. A stored entry is authoritative, so a missing
     * section is filled by a deliberate act — never by fetching on the reader's
     * behalf.
     */
    setLexiconSection(input: {
        entryId: string;
        section: string;
        text: string;
    }, signal: AbortSignal): Promise<{
        updated: boolean;
        reason?: string;
        errors?: string[];
    }>;
    listGrammar(signal: AbortSignal): Promise<{
        entries: StoredGrammarEntry[];
        pending: StoredGrammarPending[];
    }>;
    private readGrammarEntries;
    private readGrammarStore;
    private writeGrammarEntry;
    private writeGrammarStore;
    private writeTranslation;
    private writeBranch;
    private writeAnalysis;
    private readPassages;
    private serialize;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Host service and Remote namespace owner for French close reading. */
        frenchReader: FrenchReaderController;
    }
}
