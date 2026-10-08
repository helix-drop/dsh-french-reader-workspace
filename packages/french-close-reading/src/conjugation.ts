/**
 * Conjugation checking.
 *
 * This module does not conjugate. It checks a *claim*: the paradigm someone
 * displays, the decomposition they teach, and the tense they assert for the
 * input form. That keeps the honest failures visible — an incomplete rule set is
 * reported as unverified instead of being papered over with invented forms.
 *
 * Rules taken from the plan: the final form must be correct; a taught
 * decomposition must actually compose the form; only the present tense and the
 * input's own tense may appear; a bare past participle is not a compound tense;
 * an ambiguous form needs an example before a tense is asserted; an unverified
 * A–E classification is marked 存疑.
 */

import {
  datasetBaseOf,
  datasetTense,
  resolvePerson,
  resolveTenseLabel,
  type ConjugationDataset,
  type Person,
} from './conjugation-data.ts'

export interface ConjugationRow {
  person: string
  form: string
}

/** One base the author claims, with the persons they say share it. */
export interface ClaimedBase {
  ipa: string
  persons: string[]
}

/** The three-tier ladder the reader sees, one block per tense. */
export interface LadderBlock {
  tense: string
  rows: ConjugationRow[]
  /** Taught decomposition for this block, when the author gives one. */
  stem?: string | null
  endings?: Record<string, string> | null
  /**
   * The phonetic bases the author claims for this tense, when they claim any.
   * Checked against the dataset rather than taken on trust.
   */
  bases?: ClaimedBase[] | null
}

export interface ConjugationClaim {
  infinitive: string
  /** The form the reader looked up. */
  inputForm: string
  /** The tense the author asserts for the input, if they assert one. */
  inputTense: string | null
  /** Other tenses the form could belong to, as the author lists them. */
  candidates?: string[]
  /** An example sentence that disambiguates the form. */
  evidence?: string | null
  blocks: LadderBlock[]
  /** A–E style classification, if the author claims one. */
  classification?: string | null
  classificationVerified?: boolean
  /** Exception note for a verb whose forms do not follow the regular pattern. */
  irregularNote?: string | null
}

export interface ConjugationReport {
  errors: string[]
  hints: string[]
}

/** Verbs whose paradigm needs an explicit note rather than stem+ending rules. */
const IRREGULAR = ['être', 'avoir', 'aller', 'faire', 'dire', 'prendre', 'pouvoir', 'vouloir', 'venir', 'voir', 'savoir', 'devoir', 'mettre', 'écrire', 'boire', 'croire', 'recevoir', 'tenir', 'partir', 'sortir', 'courir', 'mourir', 'naître', 'falloir', 'valoir', 'vivre', 'suivre', 'rire', 'connaître', 'paraître', 'craindre', 'peindre', 'joindre', 'résoudre', 'coudre', 'vaincre', 'battre', 'rompre']

/** Tenses that are built from an auxiliary plus a participle. */
const COMPOUND = /compos|surcompos|passé antérieur|plus-que-parfait|futur antérieur|复合|超复合/u

/** The present tense, whichever of the two labels the author used. */
const PRESENT = /présent|现在时|现在/u

const FORM_SHAPE = /^[a-zà-öø-ÿ'’\-\s]+$/iu

/**
 * Check one conjugation claim.
 *
 * @param claim - The paradigm, decomposition, tense assertion and classification.
 * @param options - `dataset`: pronunciation data to check the claim **against**.
 *   When one is supplied, a displayed form, a taught stem or a claimed base that
 *   disagrees with it is an error, and the caller's own `classificationVerified`
 *   flag stops being sufficient — see rule 9.
 * @returns Errors that must be fixed and hints the author should judge.
 */
export function checkConjugation(
  claim: ConjugationClaim,
  options: { dataset?: ConjugationDataset | null } = {},
): ConjugationReport {
  const errors: string[] = []
  const hints: string[] = []

  const infinitive = claim.infinitive.trim().toLowerCase()
  const input = claim.inputForm.trim().toLowerCase()

  if (infinitive === '') errors.push('未给出原形：变位展示必须说明这是哪个动词')
  if (input === '') errors.push('未给出输入形式')
  if (claim.blocks.length === 0) errors.push('未给出任何时态块：三层阶梯至少要有现在时')

  // 1. Every displayed form must be a French form, not a placeholder.
  for (const block of claim.blocks) {
    for (const row of block.rows) {
      if (!FORM_SHAPE.test(row.form.trim())) {
        errors.push(`${block.tense} ${row.person} 的「${row.form}」不是合法的法语词形`)
      }
    }
  }

  // 2. A taught decomposition must actually compose the form it explains.
  for (const block of claim.blocks) {
    const stem = (block.stem ?? '').trim().toLowerCase()
    if (stem === '' || block.endings == null) continue
    for (const row of block.rows) {
      const ending = block.endings[row.person]
      if (ending === undefined) continue
      const composed = `${stem}${ending}`.toLowerCase()
      if (composed !== row.form.trim().toLowerCase()) {
        errors.push(
          `${block.tense} ${row.person}：词干「${stem}」＋后缀「${ending}」＝「${composed}」，与展示的「${row.form}」不符`,
        )
      }
    }
  }

  // 3. Only the present tense and the input's own tense may be shown.
  const tenses = claim.blocks.map((block) => block.tense)
  const presentBlocks = tenses.filter((tense) => PRESENT.test(tense) && !COMPOUND.test(tense))
  if (presentBlocks.length === 0) errors.push('缺少现在时：变位展示必须包含现在时')
  if (presentBlocks.length > 1) {
    // The plan's rule: an input already in the present is not shown twice.
    errors.push(`现在时出现了 ${String(presentBlocks.length)} 次：输入已是现在时的不重复输出`)
  }
  for (const tense of tenses) {
    if (PRESENT.test(tense) && !COMPOUND.test(tense)) continue
    const matchesInput = claim.inputTense !== null && tense === claim.inputTense
    if (!matchesInput) {
      errors.push(`时态「${tense}」超出范围：除现在时外只展示输入形式所属的时态`)
    }
  }

  // 4. A bare past participle is not a compound tense by itself.
  if (claim.inputTense !== null && COMPOUND.test(claim.inputTense) && !/\b(ai|as|a|avons|avez|ont|suis|es|est|sommes|êtes|sont)\b/iu.test(input)) {
    errors.push(`「${claim.inputForm}」没有助动词，不能判为复合时态「${claim.inputTense}」：孤立过去分词需结合例句判断`)
  }

  // 5. An ambiguous form needs evidence before a tense is asserted.
  const candidates = claim.candidates ?? []
  if (candidates.length > 1 && (claim.evidence ?? '').trim() === '') {
    errors.push(`该形式可能属于 ${candidates.join(' / ')}，需要给出例句后才能断言时态`)
  } else if (candidates.length > 1) {
    hints.push(`已用例句消歧：${String(claim.evidence).trim()}`)
  }

  // 6. An unverified classification must be marked, never asserted. The author's own
  //    flag is the weakest form of this: rule 9 replaces it when data is available.
  const dataset = options.dataset ?? null
  if ((claim.classification ?? '').trim() !== '' && claim.classificationVerified !== true) {
    hints.push(`分类「${String(claim.classification)}」未核实：输出中标「存疑」，不得声称已按原体系验证`)
  }

  // 7. Irregular verbs need their exception stated rather than implied.
  if (IRREGULAR.includes(infinitive) && (claim.irregularNote ?? '').trim() === '') {
    hints.push(`「${infinitive}」是不规则动词：请给出例外说明，不要用规则词干硬套`)
  }

  // 8. The input form should appear in the ladder it belongs to.
  const shown = claim.blocks.some((block) => block.rows.some((row) => row.form.trim().toLowerCase() === input))
  if (input !== '' && !shown) {
    hints.push(`输入形式「${claim.inputForm}」未出现在展示的任何一个时态块中`)
  }

  // 9. With data in hand, the claim is checked against it — not against its own
  //    assertion. Every mismatch is an error, because a displayed form that the
  //    source does not list is a form nobody can verify.
  if (dataset !== null) {
    const checked = checkAgainstDataset(claim, dataset)
    errors.push(...checked.errors)
    hints.push(...checked.hints)
  } else if ((claim.blocks.some((block) => (block.bases ?? []).length > 0)) ) {
    hints.push('本次未取得读音数据：所声称的语音基底未能核对，输出中标「未核实」')
  }

  return { errors, hints }
}

/**
 * Compare a claim with pronunciation data.
 *
 * Deliberately asymmetric: a form the dataset does not list is an **error** only when
 * the dataset is complete for that lemma (it reaches the last person of the tense) —
 * otherwise it is a hint, because a partially fetched paradigm must not manufacture
 * contradictions. A form the dataset lists with *different* spelling is always an
 * error: two sources cannot both be right about one cell.
 */
function checkAgainstDataset(claim: ConjugationClaim, dataset: ConjugationDataset): ConjugationReport {
  const errors: string[] = []
  const hints: string[] = []
  if (claim.infinitive.trim().toLowerCase() !== dataset.lemma.toLowerCase()) {
    hints.push(`所给原形「${claim.infinitive}」与数据集的「${dataset.lemma}」不同：未按该数据集核对`)
    return { errors, hints }
  }

  for (const block of claim.blocks) {
    const slot = resolveTenseLabel(block.tense)
    if (slot === null) {
      hints.push(`时态「${block.tense}」无法对应数据集中的一项，未核对`)
      continue
    }
    const tense = datasetTense(dataset, slot)
    if (tense === undefined) {
      hints.push(`数据集中没有「${block.tense}」，未核对`)
      continue
    }
    const complete = tense.forms.length === 6

    for (const row of block.rows) {
      const person = resolvePerson(row.person)
      if (person === null) {
        hints.push(`${block.tense}「${row.person}」不是可识别的语法人称，未核对`)
        continue
      }
      const found = tense.forms.find((form) => form.person === person)
      const shown = row.form.trim().toLowerCase()
      if (found === undefined) {
        const note = `${block.tense} ${row.person}：数据集中没有这一格`
        if (complete) errors.push(`${note}，展示的「${row.form}」无法核对`)
        else hints.push(`${note}（本次数据不完整），展示的「${row.form}」未核对`)
        continue
      }
      if (found.written.toLowerCase() !== shown) {
        errors.push(`${block.tense} ${row.person}：数据集写作「${found.written}」，与展示的「${row.form}」不符`)
      }
    }

    // A taught stem must be the base those persons actually share.
    const stem = (block.stem ?? '').trim()
    if (stem !== '') {
      const persons = block.rows
        .map((row) => resolvePerson(row.person))
        .filter((person): person is Person => person !== null)
      const bases = persons.map((person) => datasetBaseOf(tense, person))
      const known = bases.filter((base) => base !== null)
      if (known.length > 0) {
        const wanted = new Set(known.map((base) => base.ipa))
        if (wanted.size > 1) {
          errors.push(
            `${block.tense}：这些人称在数据集中并不共用一个基底（${[...wanted].map((ipa) => `/${ipa}/`).join('、')}），单一词干「${stem}」不成立`,
          )
        } else {
          const only = [...wanted][0]!
          if (!stem.toLowerCase().startsWith(only.toLowerCase().replace(/\./gu, ''))) {
            errors.push(`${block.tense}：数据集给出的基底是 /${only}/，与所教词干「${stem}」不符`)
          }
        }
      }
    }

    // A claimed base list must match the dataset's, person for person.
    const claimedBases = block.bases ?? []
    if (claimedBases.length > 0) {
      if (claimedBases.length !== tense.bases.length) {
        errors.push(
          `${block.tense}：声称 ${String(claimedBases.length)} 个语音基底，数据集给出 ${String(tense.bases.length)} 个`,
        )
      }
      for (const claimed of claimedBases) {
        const ipa = claimed.ipa.trim()
        const match = tense.bases.find((base) => base.ipa === ipa)
        if (match === undefined) {
          errors.push(`${block.tense}：数据集中没有基底 /${ipa}/`)
          continue
        }
        const claimedPersons = claimed.persons
          .map((label) => resolvePerson(label))
          .filter((person): person is Person => person !== null)
          .sort()
        const actualPersons = [...match.persons].sort()
        if (claimedPersons.length > 0 && claimedPersons.join(',') !== actualPersons.join(',')) {
          errors.push(
            `${block.tense}：基底 /${ipa}/ 在数据集中属于 ${actualPersons.join('、')}，与声称的 ${claimedPersons.join('、')} 不符`,
          )
        }
      }
      if ((claim.classification ?? '').trim() !== '' && claim.classificationVerified !== true) {
        errors.push('语音基底已按数据集核对：分类不得再标为「已核实」而未经数据集确认')
      }
    }
  }
  return { errors, hints }
}

/**
 * Render the three-tier ladder, marking the input form with ◀ and any
 * unverified classification with 存疑.
 * @param claim - The checked claim.
 * @returns The ladder text.
 */
export function renderConjugation(claim: ConjugationClaim): string {
  const input = claim.inputForm.trim().toLowerCase()
  const lines: string[] = [`原形 ${claim.infinitive}`]
  if ((claim.classification ?? '').trim() !== '') {
    lines.push(`分类 ${String(claim.classification)}${claim.classificationVerified === true ? '' : '（存疑：未核实）'}`)
  }
  for (const block of claim.blocks) {
    lines.push(block.tense)
    if ((block.stem ?? '').trim() !== '') lines.push(`  词干 ${String(block.stem)}`)
    for (const row of block.rows) {
      const mark = row.form.trim().toLowerCase() === input ? ' ◀' : ''
      lines.push(`  ${row.person} ${row.form}${mark}`)
    }
  }
  if ((claim.irregularNote ?? '').trim() !== '') lines.push(`例外 ${String(claim.irregularNote)}`)
  return lines.join('\n')
}
