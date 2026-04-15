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
] as const;

/**
 * Registers tool discovery and interception handlers with the MCP server instance.
 */
export function registerTools(
  server: Server,
  stagingBuffer: StagingBuffer = defaultStagingBuffer,
  scorer: ComplexityScorer = defaultComplexityScorer
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
      let question: string;
      if (evaluation.dependencyDiff && evaluation.dependencyDiff.hasNewDependencies) {
        const added = evaluation.dependencyDiff.addedPackages.join(', ');
        question = `Socratic Checkpoint: This change introduces new third-party dependency (${added}) in "${parsed.path}". Before writing, explain: Why is this library necessary, what is its architectural footprint, and what failure risks does it introduce?`;
      } else {
        question = `Socratic Checkpoint: This change modifies ${evaluation.lineDelta.totalLinesChanged} lines (${evaluation.lineDelta.linesAdded} added, ${evaluation.lineDelta.linesRemoved} removed) in "${parsed.path}". Before writing, explain: What is the core architectural mechanism of this change and what failure modes does it guard against?`;
      }

      const staged = stagingBuffer.stage({
        file: parsed.path,
        content: parsed.content,
        operation: 'write',
        question,
        concept: evaluation.dependencyDiff?.hasNewDependencies
          ? 'DEPENDENCY_ADDITION'
          : 'ARCHITECTURAL_RATIONALE',
        rationale: parsed.rationale ?? evaluation.summary,
        metadata: {
          triggers: evaluation.triggers,
          lineDelta: evaluation.lineDelta,
          dependencyDiff: evaluation.dependencyDiff,
        },
      });

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
      let question: string;
      if (evaluation.dependencyDiff && evaluation.dependencyDiff.hasNewDependencies) {
        const added = evaluation.dependencyDiff.addedPackages.join(', ');
        question = `Socratic Checkpoint: This edit introduces new third-party dependency (${added}) in "${parsed.path}". Before applying, explain: Why is this library necessary and what does it do?`;
      } else {
        question = `Socratic Checkpoint: This edit changes ${evaluation.lineDelta.totalLinesChanged} lines in "${parsed.path}". Before applying, explain: What is the architectural purpose of this modification?`;
      }

      const staged = stagingBuffer.stage({
        file: parsed.path,
        content: patchedContent,
        operation: 'edit',
        question,
        concept: evaluation.dependencyDiff?.hasNewDependencies
          ? 'DEPENDENCY_ADDITION'
          : 'ARCHITECTURAL_RATIONALE',
        rationale: parsed.rationale ?? evaluation.summary,
        metadata: {
          triggers: evaluation.triggers,
          lineDelta: evaluation.lineDelta,
          dependencyDiff: evaluation.dependencyDiff,
        },
      });

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

    throw new Error(`Unknown tool requested: ${name}`);
  });
}
