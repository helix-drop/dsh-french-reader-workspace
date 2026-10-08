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
import type { StoredAnalysis, StoredContextManifest, StoredContextMaterial, StoredDiscussion, StoredDiscussionBranch, StoredPassage, StoredSegmentation } from './domain.ts';
/**
 * The output-policy revision the model is asked to follow.
 *
 * Revision 2 adds the grammar block: a turn that raises a reusable grammar point
 * must end with the machine-readable block the automatic accumulation path reads
 * (see `answer-extraction.ts`). The revision is hashed into every fingerprint, so
 * previews compiled under revision 1 are deliberately stale rather than silently
 * sent with instructions the reader never saw.
 */
export declare const POLICY_REVISION = "close-reading/2";
/**
 * The compiler's own revision, part of every fingerprint.
 *
 * The fingerprint answers "would this request contain exactly the bytes the
 * reader approved?". A change to how materials are assembled changes that answer
 * even when the inputs did not, so bumping this deliberately invalidates every
 * preview compiled by an older build instead of silently accepting it. Version 2
 * is the first content-covering fingerprint (version 1 hashed ids and lengths).
 */
export declare const COMPILER_VERSION = 2;
export interface CompileInput {
    passage: StoredPassage;
    segmentation: StoredSegmentation;
    discussion: StoredDiscussion;
    analysis: StoredAnalysis;
    branch: StoredDiscussionBranch;
    /** The reader's question for this turn. */
    question: string;
    backend: string;
    model: string;
    /** Knowledge or other conclusions the reader explicitly added to this turn. */
    extras?: readonly {
        refId: string;
        reason: string;
        text: string;
    }[];
    /**
     * The reader's selection, when the branch is anchored on one. A selection is not
     * part of the segmentation, so its text has to travel with the compile input;
     * the caller resolves it from the stored selection record and refuses the turn
     * when it cannot (see `selection-stale`), because a request that cannot quote
     * the words it is about would be asking about nothing.
     */
    selection?: {
        refId: string;
        text: string;
    } | null;
    /**
     * Hard ceiling on the compiled text. Exceeding it is a refusal, never a silent
     * truncation: dropping the sentence a question is about would be worse than
     * not asking.
     */
    maxCharacters?: number | null;
}
export interface CompileResult {
    ok: boolean;
    manifest?: StoredContextManifest;
    /** Set when the compilation was refused; the message names the reason. */
    reason?: string;
    characters?: number;
}
/** The default ceiling: agy's own limit is tighter and overrides this. */
export declare const DEFAULT_MAX_CONTEXT_CHARACTERS = 60000;
/**
 * Compile one turn's context.
 *
 * The materials are built in a fixed order so the same inputs always produce the
 * same manifest, including the fingerprint that decides whether a preview is
 * still usable.
 */
export declare function compileContext(input: CompileInput): CompileResult;
/**
 * Render the compiled manifest as the model-facing prompt.
 *
 * The prompt is a rendering of the manifest, not a second assembly: every block
 * names the material it came from, so an answer can be traced back to what it was
 * allowed to see.
 */
export declare function renderPrompt(manifest: StoredContextManifest): string;
/** The system instruction for one compiled turn. */
export declare function renderSystem(): string;
export declare function materialLabel(material: StoredContextMaterial): string;
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
export declare function fingerprintOf(parts: {
    passageId: string;
    branchId: string;
    anchorId: string;
    question: string;
    backend: string;
    model: string;
    sourceRevision: number;
    materials: readonly StoredContextMaterial[];
}): string;
