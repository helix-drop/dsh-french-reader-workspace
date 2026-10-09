/**
 * Output policy for a vocabulary card.
 *
 * The plan's section order, formats and honesty rules are data and pure rules
 * here, not a prompt the model improvises: the same policy decides what is
 * rendered and what is validated, so a card cannot pass by being pretty.
 *
 * Sections:
 *   §1 overview · §2 current sense · §3 etymology (a: origin, b: evolution)
 *   §4 conjugation · §5 collocations · §6 cultural context · §7 set expressions
 */
export type SectionId = 'overview' | 'sense' | 'etymology' | 'semanticEvolution' | 'conjugation' | 'collocations' | 'culture' | 'fixedExpressions';
export interface SectionSpec {
    id: SectionId;
    /** The §number shown to the reader. */
    number: string;
    title: string;
    /** Must carry content; an empty required section fails validation. */
    required: boolean;
    /** How the body is written. Ordered lists carry examples; never a table. */
    format: 'overview' | 'ordered' | 'unordered-bars' | 'prose' | 'paradigm';
}
/**
 * Section order for one part of speech.
 * @param partOfSpeech - The entry's part of speech, as authored.
 * @param options - `wantsEtymology` adds §3 for the types that omit it by default.
 * @returns The ordered sections this card must follow.
 */
export declare function sectionOrder(partOfSpeech: string, options?: {
    wantsEtymology?: boolean;
}): SectionSpec[];
export type PartOfSpeechKind = 'verbe' | 'nom' | 'adjectif' | 'pronom' | 'article' | 'preposition' | 'locution' | 'autre';
/**
 * Coarse classification of an authored part of speech.
 *
 * Order matters and the patterns are anchored: `/verb/` alone matches
 * "ad**verb**e", which would hand an adverb a verb's section order — including
 * §4 conjugation. Types the plan does not route anywhere stay `autre`.
 *
 * The reading panel is Chinese-facing, so the labels the reader actually
 * types (动词, 名词, …) classify to the same kinds as their French/English
 * counterparts; otherwise a saved 动词 silently fell to `autre` and its card
 * lost §4 conjugation (F03).
 */
export declare function classify(partOfSpeech: string): PartOfSpeechKind;
/** What is known about the entry, as far as the policy cares. */
export interface PolicyInput {
    partOfSpeech: string;
    mot: string;
    lemma: string | null;
    senses: readonly {
        label: string;
        definition: string;
    }[];
    sections: Record<SectionId, string | null>;
    examples?: readonly string[];
}
export interface PolicyReport {
    sections: SectionSpec[];
    errors: string[];
    hints: string[];
}
/**
 * Validate a card against its policy.
 *
 * A required section that is empty is an error — the plan forbids "每句只有一句
 * 概括也算完成" for analysis and the same discipline applies here. A section the
 * author genuinely cannot fill must say so explicitly (`未发现可靠关联`), which
 * counts as content; silently omitting it does not.
 */
export declare function validateCard(input: PolicyInput, options?: {
    wantsEtymology?: boolean;
}): PolicyReport;
/**
 * Render a card in policy order.
 * @param input - The entry being rendered.
 * @param options - `wantsEtymology` includes §3 for types that omit it by default.
 * @returns The card text, in order, with each section's own format.
 */
export declare function renderCard(input: PolicyInput, options?: {
    wantsEtymology?: boolean;
}): string;
