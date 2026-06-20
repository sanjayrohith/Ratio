import { z } from 'zod';
import { ConceptMatcher, defaultConceptMatcher, EvaluationResult } from '../../core/evaluation/matcher.js';
import { FollowUpGenerator, defaultFollowUpGenerator } from '../../core/evaluation/follow-up.js';
import { StagingBuffer, defaultStagingBuffer, StagedWrite } from '../../core/staging/buffer.js';
import { PendingWriteRepository, PendingWriteRecord } from '../../storage/pending-writes.js';
import { CommitTransactionExecutor } from '../../core/staging/executor.js';
import { TrustScoreRepository } from '../../storage/trust-repo.js';
import { CheckpointRepository } from '../../storage/checkpoint-repo.js';
import { TrustScoreCoordinator } from '../../core/trust/coordinator.js';
import { atomicWriteFile } from '../../storage/fs.js';
import type { SessionRepository } from '../../storage/session-repo.js';

export const SubmitAnswerInputSchema = z
  .object({
    ticket_id: z.string().optional(),
    ticketId: z.string().optional(),
    answer: z.string().min(1, 'Answer text must not be empty.'),
  })
  .refine((data) => Boolean(data.ticket_id || data.ticketId), {
    message: 'Either ticket_id or ticketId must be provided.',
  });

export type SubmitAnswerInput = z.infer<typeof SubmitAnswerInputSchema>;

export const RATIO_SUBMIT_ANSWER_TOOL = {
  name: 'ratio_submit_answer',
  description:
    'Submit an answer to a Socratic checkpoint question to authorize and release a staged file write.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_id: {
        type: 'string',
        description: 'The unique ticket ID returned by a checkpoint_required response.',
      },
      answer: {
        type: 'string',
        description: 'The plain language architectural explanation answering the checkpoint question.',
      },
    },
    required: ['answer'],
  },
} as const;

export interface SubmitAnswerDependencies {
  stagingBuffer?: StagingBuffer;
  pendingRepo?: PendingWriteRepository;
  checkpointRepo?: CheckpointRepository;
  sessionRepo?: SessionRepository;
  trustRepo?: TrustScoreRepository;
  trustCoordinator?: TrustScoreCoordinator;
  executor?: CommitTransactionExecutor;
  matcher?: ConceptMatcher;
  followUpGenerator?: FollowUpGenerator;
}

export interface SubmitAnswerResponseSuccess {
  status: 'write_permitted';
  file: string;
  ticketId: string;
  score: number;
  bytesWritten?: number;
  message: string;
}

export interface SubmitAnswerResponseCheckpoint {
  status: 'checkpoint_required';
  ticketId: string;
  file: string;
  score: number;
  question: string;
  hint?: string;
  feedback: string;
  instruction: string;
}

export interface SubmitAnswerResponseRejected {
  status: 'write_rejected';
  ticketId: string;
  file: string;
  reason: string;
}

export type SubmitAnswerToolResponse =
  | SubmitAnswerResponseSuccess
  | SubmitAnswerResponseCheckpoint
  | SubmitAnswerResponseRejected;

/**
 * Handles ratio_submit_answer invocations:
 * 1. Validates ticket ID and retrieves pending staged write.
 * 2. Delegates answer text to ConceptMatcher for deterministic scoring.
 * 3. Updates trust score and ledger records.
 * 4. Releases write on success or generates graduated follow-up on shallow answer.
 */
export async function handleSubmitAnswer(
  rawArgs: unknown,
  deps: SubmitAnswerDependencies = {}
): Promise<SubmitAnswerToolResponse> {
  const parsed = SubmitAnswerInputSchema.parse(rawArgs);
  const ticketId = (parsed.ticket_id ?? parsed.ticketId)!;
  const answer = parsed.answer;

  const stagingBuffer = deps.stagingBuffer ?? defaultStagingBuffer;
  const matcher = deps.matcher ?? defaultConceptMatcher;
  const followUpGen = deps.followUpGenerator ?? defaultFollowUpGenerator;

  // 1. Locate staged write record from memory buffer or database
  const stagedMemory = stagingBuffer.get(ticketId);
  const stagedDb = deps.pendingRepo?.getByTicketId(ticketId);

  if (!stagedMemory && !stagedDb) {
    throw new Error(
      `No pending checkpoint write found for ticket ID "${ticketId}". Write may have already been resolved or expired.`
    );
  }

  const filePath = stagedMemory?.file ?? stagedDb?.file_path!;
  const content = stagedMemory?.content ?? stagedDb?.content!;
  const concept = stagedMemory?.concept ?? stagedDb?.concept ?? 'ARCHITECTURAL_RATIONALE';
  const originalQuestion = stagedMemory?.question ?? stagedDb?.question ?? '';

  // 2. Delegate answer evaluation to ConceptMatcher
  const evaluation: EvaluationResult = matcher.evaluate(concept, answer);

  // 3. Handle evaluation outcome
  if (evaluation.passed) {
    // Release and commit file write
    let bytesWritten = 0;
    if (deps.executor) {
      deps.executor.approve(ticketId);
      const commitRes = await deps.executor.commit(ticketId);
      bytesWritten = commitRes.bytesWritten;
    } else {
      const writeResult = await atomicWriteFile(filePath, content);
      bytesWritten = writeResult.bytesWritten;
      stagingBuffer.approve(ticketId);
      stagingBuffer.commit(ticketId);
      if (deps.pendingRepo) {
        deps.pendingRepo.markApproved(ticketId);
        deps.pendingRepo.markCommitted(ticketId);
      }
    }

    // Record student answer first if checkpointRepo is present
    if (deps.checkpointRepo) {
      try {
        deps.checkpointRepo.recordAnswer({
          ticketId,
          studentAnswer: answer,
          conceptScore: evaluation.score,
          detectedKeywords: evaluation.matchedKeywords,
          isEvasive: evaluation.isEvasive,
        });
      } catch {
        // Ignored if checkpoint not present in SQLite checkpoints table
      }
    }

    // Update trust score on pass if coordinator or repository available
    if (deps.trustCoordinator) {
      try {
        deps.trustCoordinator.applyEvaluationOutcome(ticketId, evaluation);
      } catch {
        // Fallback to direct repo if ticket not in checkpoints table
        if (deps.trustRepo) {
          const current = deps.trustRepo.getOrCreate(filePath);
          deps.trustRepo.recordPass(filePath, current.score + 0.1);
        }
      }
    } else if (deps.trustRepo) {
      const current = deps.trustRepo.getOrCreate(filePath);
      deps.trustRepo.recordPass(filePath, current.score + 0.1);
    }

    return {
      status: 'write_permitted',
      file: filePath,
      ticketId,
      score: evaluation.score,
      bytesWritten,
      message: `Checkpoint passed (score: ${evaluation.score}/100). File written to disk: ${filePath}`,
    };
  }

  // Answer was shallow, evasive, or failed mechanisms
  if (deps.checkpointRepo) {
    try {
      deps.checkpointRepo.recordAnswer({
        ticketId,
        studentAnswer: answer,
        conceptScore: evaluation.score,
        detectedKeywords: evaluation.matchedKeywords,
        isEvasive: evaluation.isEvasive,
      });
    } catch {
      // Ignored
    }
  }

  if (deps.trustCoordinator) {
    try {
      deps.trustCoordinator.applyEvaluationOutcome(ticketId, evaluation);

    } catch {
      if (deps.trustRepo) {
        const current = deps.trustRepo.getOrCreate(filePath);
        deps.trustRepo.recordFailure(filePath, current.score - 0.25);
      }
    }
  } else if (deps.trustRepo) {
    const current = deps.trustRepo.getOrCreate(filePath);
    deps.trustRepo.recordFailure(filePath, current.score - 0.25);
  }

  const followUp = followUpGen.generate({
    ticketId,
    filePath,
    evaluation,
    originalQuestion,
    conceptId: concept,
  });

  return {
    status: 'checkpoint_required',
    ticketId,
    file: filePath,
    score: evaluation.score,
    question: followUp.question,
    hint: followUp.hint,
    feedback: evaluation.feedback,
    instruction: followUp.instruction,
  };
}
