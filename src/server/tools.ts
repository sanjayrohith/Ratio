import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  ComplexityScorer,
  defaultComplexityScorer,
} from '../core/scorer/index.js';
import { defaultStagingBuffer, StagingBuffer } from '../core/staging/buffer.js';
import { applyEdits } from '../core/staging/patcher.js';
import { atomicWriteFile, safeReadFile } from '../storage/fs.js';
import {
  EditFileInputSchema,
  WriteFileInputSchema,
  type CheckpointResponse,
  type WritePermittedResponse,
} from '../types/protocol.js';

import {
  RATIO_SUBMIT_ANSWER_TOOL,
  handleSubmitAnswer,
  type SubmitAnswerDependencies,
} from './tools/submit-answer.js';

export const RATIO_TOOLS = [
  {
    name: 'ratio_write_file',
    description:
      'Intercepted file write tool. Writes content to a file while enforcing Socratic checkpoints and understanding ledger logging.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The relative or absolute file path to create or overwrite.',
        },
        content: {
          type: 'string',
          description: 'The proposed textual content of the file.',
        },
        rationale: {
          type: 'string',
          description: 'The architectural or functional rationale for why this file is being created or updated.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'ratio_edit_file',
    description:
      'Intercepted file edit tool. Applies targeted text replacements to an existing file while enforcing Socratic checkpoints.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The relative or absolute file path to modify.',
        },
        edits: {
          type: 'array',
          description: 'List of text replacements to apply to the file.',
          items: {
            type: 'object',
            properties: {
              oldText: {
                type: 'string',
                description: 'The exact existing text chunk to replace.',
              },
              newText: {
                type: 'string',
                description: 'The replacement text chunk.',
              },
              startLine: {
                type: 'integer',
                description: 'Optional 1-indexed starting line number hint.',
              },
              endLine: {
                type: 'integer',
                description: 'Optional 1-indexed ending line number hint.',
              },
            },
            required: ['oldText', 'newText'],
          },
        },
        rationale: {
          type: 'string',
          description: 'The architectural or functional rationale for why these edits are being made.',
        },
      },
      required: ['path', 'edits'],
    },
  },
  RATIO_SUBMIT_ANSWER_TOOL,
] as const;

/**
 * Registers tool discovery and interception handlers with the MCP server instance.
 */
export function registerTools(
  server: Server,
  stagingBuffer: StagingBuffer = defaultStagingBuffer,
  scorer: ComplexityScorer = defaultComplexityScorer,
  deps: SubmitAnswerDependencies = {}
): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [...RATIO_TOOLS],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;

    if (name === 'ratio_write_file') {
      const parsed = WriteFileInputSchema.parse(rawArgs);
      const existing = (await safeReadFile(parsed.path)) ?? '';
      const evaluation = scorer.evaluate(parsed.path, existing, parsed.content);

      if (!evaluation.exceedsThreshold) {
        // Trivial write: automatically approved and committed directly to disk
        const writeResult = await atomicWriteFile(parsed.path, parsed.content);
        const permitted: WritePermittedResponse = {
          status: 'write_permitted',
          file: parsed.path,
          bytesWritten: writeResult.bytesWritten,
          message: `Write permitted: within complexity thresholds (${evaluation.lineDelta.totalLinesChanged} lines changed).`,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(permitted, null, 2),
            },
          ],
        };
      }

      // Exceeds threshold: stage and generate targeted Socratic question
      const question =
        evaluation.suggestedQuestion ??
        `Socratic Checkpoint: Modifying "${parsed.path}". Before writing, explain the architectural mechanism.`;
      const concept = evaluation.concept ?? 'ARCHITECTURAL_RATIONALE';

      const staged = stagingBuffer.stage({
        file: parsed.path,
        content: parsed.content,
        operation: 'write',
        question,
        concept,
        rationale: parsed.rationale ?? evaluation.summary,
        metadata: {
          triggers: evaluation.triggers,
          lineDelta: evaluation.lineDelta,
          layers: evaluation.layers,
          layerTransitions: evaluation.layerTransitions,
          dependencyDiff: evaluation.dependencyDiff,
        },
      });

      if (deps.pendingRepo) {
        deps.pendingRepo.insert({
          ticketId: staged.ticketId,
          filePath: staged.file,
          content: staged.content,
          operation: 'write',
          question: staged.question,
          concept: staged.concept,
          rationale: staged.rationale,
          metadata: staged.metadata,
        });
      }

      if (deps.checkpointRepo) {
        deps.checkpointRepo.insertCheckpoint({
          ticketId: staged.ticketId,
          filePath: staged.file,
          question: staged.question,
          concept: staged.concept ?? 'ARCHITECTURAL_RATIONALE',
        });
      }

      const response: CheckpointResponse = {
        status: 'checkpoint_required',
        ticketId: staged.ticketId,
        file: staged.file,
        question: staged.question,
        concept: staged.concept,
        rationale: staged.rationale,
        hint: 'Explain the mechanism clearly in plain language without hand-waving.',
        instruction:
          'Do not modify the file yet. Relay this question to the user and call ratio_submit_answer with this ticketId.',
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    if (name === 'ratio_edit_file') {
      const parsed = EditFileInputSchema.parse(rawArgs);
      const existing = (await safeReadFile(parsed.path)) ?? '';
      const patchedContent =
        existing !== ''
          ? applyEdits(existing, parsed.edits)
          : parsed.edits.map((e) => e.newText).join('\n');

      const evaluation = scorer.evaluate(parsed.path, existing, patchedContent);

      if (!evaluation.exceedsThreshold) {
        // Trivial edit: auto-approve and write directly to disk
        const writeResult = await atomicWriteFile(parsed.path, patchedContent);
        const permitted: WritePermittedResponse = {
          status: 'write_permitted',
          file: parsed.path,
          bytesWritten: writeResult.bytesWritten,
          message: `Write permitted: within complexity thresholds (${evaluation.lineDelta.totalLinesChanged} lines changed).`,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(permitted, null, 2),
            },
          ],
        };
      }

      // Exceeds threshold: stage and generate targeted Socratic question
      const question =
        evaluation.suggestedQuestion ??
        `Socratic Checkpoint: Modifying "${parsed.path}". Before writing, explain the architectural mechanism.`;
      const concept = evaluation.concept ?? 'ARCHITECTURAL_RATIONALE';

      const staged = stagingBuffer.stage({
        file: parsed.path,
        content: patchedContent,
        operation: 'edit',
        question,
        concept,
        rationale: parsed.rationale ?? evaluation.summary,
        metadata: {
          triggers: evaluation.triggers,
          lineDelta: evaluation.lineDelta,
          layers: evaluation.layers,
          layerTransitions: evaluation.layerTransitions,
          dependencyDiff: evaluation.dependencyDiff,
        },
      });

      if (deps.pendingRepo) {
        deps.pendingRepo.insert({
          ticketId: staged.ticketId,
          filePath: staged.file,
          content: staged.content,
          operation: 'edit',
          question: staged.question,
          concept: staged.concept,
          rationale: staged.rationale,
          metadata: staged.metadata,
        });
      }

      if (deps.checkpointRepo) {
        deps.checkpointRepo.insertCheckpoint({
          ticketId: staged.ticketId,
          filePath: staged.file,
          question: staged.question,
          concept: staged.concept ?? 'ARCHITECTURAL_RATIONALE',
        });
      }

      const response: CheckpointResponse = {
        status: 'checkpoint_required',
        ticketId: staged.ticketId,
        file: staged.file,
        question: staged.question,
        concept: staged.concept,
        rationale: staged.rationale,
        hint: 'Explain the mechanism clearly in plain language without hand-waving.',
        instruction:
          'Do not modify the file yet. Relay this question to the user and call ratio_submit_answer with this ticketId.',
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    if (name === 'ratio_submit_answer') {
      const response = await handleSubmitAnswer(rawArgs, {
        stagingBuffer,
        ...deps,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown tool requested: ${name}`);
  });
}
