import { ConceptId } from '../concepts/taxonomy.js';
import {
  CONCEPT_RUBRICS,
  ConceptRubric,
  expandSynonyms,
  isEvasionAnswer,
  MechanismGroup,
} from './rubrics.js';

export interface MatcherOptions {
  minimumPassingScore?: number;
  minDistinctMechanisms?: number;
}

export interface EvaluationResult {
  passed: boolean;
  score: number;
  isEvasive: boolean;
  conceptId: ConceptId | string;
  matchedKeywords: string[];
  matchedMechanisms: string[];
  missingMechanisms: string[];
  feedback: string;
}

/**
 * Fast deterministic keyword and mechanism evaluation engine for Socratic checkpoints.
 * Evaluates student answers against curated concept rubrics without external LLM calls.
 */
export class ConceptMatcher {
  /**
   * Evaluates a student's answer against a concept's rubric and optional question keywords.
   */
  public evaluate(
    conceptId: ConceptId | string,
    answer: string,
    expectedQuestionKeywords: string[] = [],
    options: MatcherOptions = {}
  ): EvaluationResult {
    const minPassingScore = options.minimumPassingScore ?? 60;
    const trimmed = (answer ?? '').trim();

    // 1. Check for empty answers
    if (trimmed.length === 0) {
      return {
        passed: false,
        score: 0,
        isEvasive: true,
        conceptId,
        matchedKeywords: [],
        matchedMechanisms: [],
        missingMechanisms: this.getMechanismNames(conceptId),
        feedback: 'Answer was empty. Please explain the architectural mechanism to proceed.',
      };
    }

    // 2. Check for evasion shortcuts (e.g. "idk", "just do it", "skip")
    if (isEvasionAnswer(trimmed)) {
      return {
        passed: false,
        score: 0,
        isEvasive: true,
        conceptId,
        matchedKeywords: [],
        matchedMechanisms: [],
        missingMechanisms: this.getMechanismNames(conceptId),
        feedback:
          'Answer was flagged as an evasive shortcut or non-answer without architectural explanation.',
      };
    }

    const rawLower = trimmed.toLowerCase();
    const sanitizedLower = rawLower
      .replace(/[.,!?;:'"()[\]{}`\\/]/g, ' ')
      .replace(/\s+/g, ' ');

    const rubric = this.resolveRubric(conceptId, rawLower);
    const targetConceptId = rubric ? rubric.conceptId : conceptId;
    const matchedKeywordsSet = new Set<string>();
    const matchedMechanisms: string[] = [];
    const missingMechanisms: string[] = [];

    if (rubric) {
      for (const mechanism of rubric.mechanisms) {
        const matched = this.matchMechanism(
          mechanism,
          rawLower,
          sanitizedLower,
          matchedKeywordsSet
        );

        if (matched) {
          matchedMechanisms.push(mechanism.name);
        } else {
          missingMechanisms.push(mechanism.name);
        }
      }
    } else {
      // Fallback for uncatalogued or custom concepts: evaluate against expectedQuestionKeywords
      if (expectedQuestionKeywords.length > 0) {
        for (const kw of expectedQuestionKeywords) {
          if (this.matchesKeyword(kw, rawLower, sanitizedLower)) {
            matchedKeywordsSet.add(kw);
          }
        }
      }
    }

    // Also match any additional question-specific keywords provided
    if (expectedQuestionKeywords.length > 0) {
      for (const kw of expectedQuestionKeywords) {
        if (this.matchesKeyword(kw, rawLower, sanitizedLower)) {
          matchedKeywordsSet.add(kw);
        }
      }
    }

    const matchedKeywords = Array.from(matchedKeywordsSet);
    const requiredMechanisms =
      options.minDistinctMechanisms ??
      (rubric ? rubric.minDistinctMechanisms : 1);

    // 3. Compute score (0 - 100)
    let score = 0;
    if (rubric) {
      const totalMechanisms = rubric.mechanisms.length;
      if (matchedMechanisms.length === 0) {
        score = matchedKeywords.length > 0 ? 25 : 0;
      } else if (matchedMechanisms.length >= totalMechanisms) {
        score = 100;
      } else if (matchedMechanisms.length >= requiredMechanisms) {
        // Met required threshold (e.g. 2 of 3)
        const keywordBonus = Math.min(10, Math.max(0, matchedKeywords.length - 2) * 2);
        score = Math.min(90, 80 + keywordBonus);
      } else {
        // Partial match (e.g. 1 of 3)
        const keywordBonus = Math.min(10, Math.max(0, matchedKeywords.length - 1) * 2);
        score = Math.min(55, 45 + keywordBonus);
      }
    } else {
      // Generic keyword score
      if (matchedKeywords.length >= 2) {
        score = Math.min(100, 70 + matchedKeywords.length * 10);
      } else if (matchedKeywords.length === 1) {
        score = 45;
      } else {
        score = 0;
      }
    }

    const passed =
      score >= minPassingScore &&
      (rubric
        ? matchedMechanisms.length >= Math.min(requiredMechanisms, rubric.mechanisms.length)
        : matchedKeywords.length >= 2);

    // 4. Construct descriptive feedback
    let feedback: string;
    if (passed) {
      const details =
        matchedMechanisms.length > 0
          ? matchedMechanisms.join(', ')
          : matchedKeywords.join(', ');
      feedback = `Solid explanation (score: ${score}/100). Demonstrated mechanistic understanding referencing: ${details}.`;
    } else if (matchedMechanisms.length > 0) {
      feedback = `Partial understanding (score: ${score}/100). You identified ${matchedMechanisms.join(
        ', '
      )}, but missed required mechanisms: ${missingMechanisms.join(', ')}.`;
    } else if (matchedKeywords.length > 0) {
      feedback = `Shallow explanation (score: ${score}/100). Mentioned terms [${matchedKeywords.join(
        ', '
      )}], but missed required mechanisms: ${missingMechanisms.join(', ')}.`;
    } else {
      feedback = `Insufficient explanation (score: ${score}/100). Did not reference required mechanisms: ${missingMechanisms.join(
        ', '
      )}.`;
    }

    return {
      passed,
      score,
      isEvasive: false,
      conceptId: targetConceptId,
      matchedKeywords,
      matchedMechanisms,
      missingMechanisms,
      feedback,
    };
  }

  /**
   * Evaluates if an answer satisfies a mechanism group by matching keywords or synonyms.
   */
  private matchMechanism(
    mechanism: MechanismGroup,
    rawText: string,
    sanitizedText: string,
    matchedKeywordsSet: Set<string>
  ): boolean {
    let matched = false;

    for (const kw of mechanism.keywords) {
      const candidates = expandSynonyms(kw);
      for (const candidate of candidates) {
        if (this.matchesKeyword(candidate, rawText, sanitizedText)) {
          matched = true;
          matchedKeywordsSet.add(kw);
          break;
        }
      }
    }

    return matched;
  }

  /**
   * Determines if a keyword or phrase appears in the input text with word-boundary awareness.
   */
  private matchesKeyword(keyword: string, rawText: string, sanitizedText: string): boolean {
    const kwLower = keyword.toLowerCase().trim();
    if (kwLower.length === 0) return false;

    // Check raw text for exact phrases (useful for punctuation like process.env, b-tree)
    if (rawText.includes(kwLower)) {
      // If single short word, verify word boundary
      if (!kwLower.includes(' ') && kwLower.length <= 4) {
        const regex = new RegExp(`\\b${this.escapeRegex(kwLower)}\\b`, 'i');
        if (regex.test(rawText)) return true;
      } else {
        return true;
      }
    }

    // Check sanitized text (useful when punctuation was used differently, e.g. "process env")
    const sanitizedKw = kwLower
      .replace(/[.,!?;:'"()[\]{}`\\/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (sanitizedKw.length === 0) return false;

    if (sanitizedKw.includes(' ')) {
      return sanitizedText.includes(sanitizedKw);
    }

    // Single word: use word boundary regex
    const wordRegex = new RegExp(`\\b${this.escapeRegex(sanitizedKw)}\\b`, 'i');
    return wordRegex.test(sanitizedText);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private resolveRubric(
    conceptId: ConceptId | string,
    rawLower: string
  ): ConceptRubric | undefined {
    if (CONCEPT_RUBRICS[conceptId as ConceptId]) {
      return CONCEPT_RUBRICS[conceptId as ConceptId];
    }

    const conceptStr = String(conceptId).toUpperCase();

    if (conceptStr === 'AUTHENTICATION_ARCHITECTURE') {
      if (
        rawLower.includes('password') ||
        rawLower.includes('hash') ||
        rawLower.includes('salt') ||
        rawLower.includes('bcrypt')
      ) {
        return CONCEPT_RUBRICS[ConceptId.PASSWORD_HASHING_SALT];
      }
      return CONCEPT_RUBRICS[ConceptId.JWT_SECRET_HYGIENE];
    }

    if (conceptStr === 'DATABASE_INTEGRITY') {
      if (
        rawLower.includes('parameter') ||
        rawLower.includes('injection') ||
        rawLower.includes('prepared') ||
        rawLower.includes('bind') ||
        rawLower.includes('placeholder')
      ) {
        return CONCEPT_RUBRICS[ConceptId.SQL_INJECTION_PREVENTION];
      }
      return CONCEPT_RUBRICS[ConceptId.DB_MIGRATION_IDEMPOTENCY];
    }

    if (conceptStr === 'DEPENDENCY_ADDITION') {
      return CONCEPT_RUBRICS[ConceptId.INPUT_VALIDATION_SANITIZATION];
    }

    // If general architectural rationale or multi-layer change, match across all concept rubrics
    if (
      conceptStr === 'ARCHITECTURAL_RATIONALE' ||
      conceptStr === 'MULTI_LAYER_CHANGE' ||
      conceptStr === 'MULTI_LAYER_CROSSING'
    ) {
      let bestRubric: ConceptRubric | undefined;
      let maxMatches = 0;
      for (const r of Object.values(CONCEPT_RUBRICS)) {
        let matches = 0;
        for (const m of r.mechanisms) {
          for (const kw of m.keywords) {
            if (rawLower.includes(kw.toLowerCase())) {
              matches++;
            }
          }
        }
        if (matches > maxMatches) {
          maxMatches = matches;
          bestRubric = r;
        }
      }
      if (maxMatches >= 2) {
        return bestRubric;
      }
      if (conceptStr === 'MULTI_LAYER_CHANGE' || conceptStr === 'MULTI_LAYER_CROSSING') {
        return CONCEPT_RUBRICS[ConceptId.ASYNC_WATERFALL_MITIGATION];
      }
    }

    return undefined;
  }

  private getMechanismNames(conceptId: ConceptId | string, rawLower = ''): string[] {
    const rubric = this.resolveRubric(conceptId, rawLower);
    return rubric ? rubric.mechanisms.map((m) => m.name) : ['Core Architectural Rationale'];
  }
}

export const defaultConceptMatcher = new ConceptMatcher();
