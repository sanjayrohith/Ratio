import { ConceptId, CONCEPT_DEFINITIONS } from '../concepts/taxonomy.js';
import { EvaluationResult } from './matcher.js';
import { QUESTION_CATALOG, SocraticQuestion } from '../concepts/catalog.js';

export interface FollowUpContext {
  ticketId: string;
  filePath: string;
  evaluation: EvaluationResult;
  originalQuestion?: string;
  conceptId?: ConceptId | string;
  attempt?: number;
}

export interface GraduatedFollowUp {
  status: 'checkpoint_required';
  ticketId: string;
  file: string;
  score: number;
  question: string;
  hint: string;
  feedback: string;
  instruction: string;
  isEvasive: boolean;
  missingMechanisms: string[];
  attempt: number;
}

/**
 * FollowUpGenerator produces graduated Socratic follow-up questions and guiding hints
 * when a student's answer is shallow, evasive, or partially incomplete.
 */
export class FollowUpGenerator {
  /**
   * Generates a graduated follow-up response guiding the student to explain missing mechanisms.
   */
  public generate(context: FollowUpContext): GraduatedFollowUp {
    const { ticketId, filePath, evaluation, originalQuestion, conceptId } = context;
    const attempt = context.attempt ?? 1;

    const conceptKey = (conceptId ?? evaluation.conceptId) as ConceptId;
    const conceptDef = CONCEPT_DEFINITIONS[conceptKey];
    const conceptQuestions = QUESTION_CATALOG[conceptKey] ?? [];

    const catalogQuestion: SocraticQuestion | undefined = conceptQuestions[0];
    const defaultHint =
      catalogQuestion?.hint ??
      'Reflect on the architectural risks, security boundaries, or performance implications.';
    const promptQuestion =
      originalQuestion && originalQuestion.length > 0
        ? originalQuestion
        : catalogQuestion?.question ?? 'Explain the core architectural rationale for this change.';

    const missingStr =
      evaluation.missingMechanisms.length > 0
        ? evaluation.missingMechanisms.join(', ')
        : 'underlying architectural trade-offs';

    let followUpPrompt: string;
    let followUpHint: string;

    if (evaluation.isEvasive) {
      // Evasion shortcut rejection (idk, just do it, skip, etc.)
      followUpPrompt = `Socratic Checkpoint [Follow-up ${attempt}]: Evasive non-answer detected. Ratio requires a conceptual explanation before writing to "${filePath}". Concept: ${
        conceptDef?.name ?? String(conceptKey)
      }. Please explain: ${promptQuestion}`;
      followUpHint = `Avoid shortcuts like "idk" or "just do it". ${defaultHint}`;
    } else if (evaluation.score === 0 || evaluation.matchedMechanisms.length === 0) {
      // Completely shallow / irrelevant answer
      followUpPrompt = `Socratic Checkpoint [Follow-up ${attempt}]: Your previous explanation did not cover the required architectural mechanisms (${missingStr}) for "${filePath}". ${promptQuestion}`;
      followUpHint = `Hint: ${defaultHint}. Consider what happens under failure or concurrency.`;
    } else {
      // Partial understanding: acknowledge matched, probe for missing
      const matchedStr = evaluation.matchedMechanisms.join(', ');
      followUpPrompt = `Socratic Checkpoint [Follow-up ${attempt}]: Good start mentioning ${matchedStr}. To clear this checkpoint, explain how "${filePath}" addresses: ${missingStr}.`;
      followUpHint = `Hint: ${defaultHint}`;
    }

    return {
      status: 'checkpoint_required',
      ticketId,
      file: filePath,
      score: evaluation.score,
      question: followUpPrompt,
      hint: followUpHint,
      feedback: evaluation.feedback,
      instruction:
        'The student answer lacked full mechanistic explanation. Relay this graduated follow-up question to the student and submit their response via ratio_submit_answer.',
      isEvasive: evaluation.isEvasive,
      missingMechanisms: evaluation.missingMechanisms,
      attempt,
    };
  }
}

export const defaultFollowUpGenerator = new FollowUpGenerator();
