import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
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

type ToolHandler = (rawArgs: unknown) => Promise<CallToolResult>;

/**
 * High-performance MCP JSON-RPC message dispatcher.
 * Pre-indexes tool handlers and statically caches tool metadata
 * to eliminate superfluous heap allocations during intensive coding sessions.
 */
export class McpRequestDispatcher {
  private readonly stagingBuffer: StagingBuffer;
  private readonly scorer: ComplexityScorer;
  private readonly deps: SubmitAnswerDependencies;
  private readonly handlers: Map<string, ToolHandler>;
  private currentTurnId: string;

  // Static cached response for ListTools to avoid array cloning on repeated handshakes
  public static readonly CACHED_TOOLS_LIST = Object.freeze({
    tools: RATIO_TOOLS,
  });

  constructor(
    stagingBuffer: StagingBuffer = defaultStagingBuffer,
    scorer: ComplexityScorer = defaultComplexityScorer,
    deps: SubmitAnswerDependencies = {},
    turnId: string = 'default'
  ) {
    this.stagingBuffer = stagingBuffer;
    this.scorer = scorer;
    this.deps = deps;
    this.currentTurnId = turnId;

    // Pre-bind and register tool handlers into map for O(1) non-allocating lookups
    this.handlers = new Map<string, ToolHandler>([
      ['ratio_write_file', this.handleWriteFile.bind(this)],
      ['ratio_edit_file', this.handleEditFile.bind(this)],
      ['ratio_submit_answer', this.handleSubmitAnswer.bind(this)],
    ]);
  }

  public getTurnId(): string {
    return this.currentTurnId;
  }

  public setTurnId(turnId: string): void {
    this.currentTurnId = turnId;
  }

  /**
   * Returns statically cached tool definitions with zero allocations.
   */
  public listTools() {
    return McpRequestDispatcher.CACHED_TOOLS_LIST;
  }

  /**
   * Dispatches a tool invocation to its registered handler.
   */
  public async dispatch(name: string, rawArgs: unknown): Promise<CallToolResult> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`Unknown tool requested: ${name}`);
    }
    return handler(rawArgs);
  }

  /**
   * Registers MCP request handlers with the target Server instance.
   */
  public registerWithServer(server: Server): void {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return McpRequestDispatcher.CACHED_TOOLS_LIST;
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: rawArgs } = request.params;
      return this.dispatch(name, rawArgs);
    });
  }

  private formatResponse(data: unknown): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private async handleWriteFile(rawArgs: unknown): Promise<CallToolResult> {
    const parsed = WriteFileInputSchema.parse(rawArgs);
    const existing = (await safeReadFile(parsed.path)) ?? '';
    const evaluation = this.scorer.evaluate(parsed.path, existing, parsed.content, this.currentTurnId);

    if (!evaluation.exceedsThreshold) {
      const writeResult = await atomicWriteFile(parsed.path, parsed.content);
      const permitted: WritePermittedResponse = {
        status: 'write_permitted',
        file: parsed.path,
        bytesWritten: writeResult.bytesWritten,
        message: `Write permitted: within complexity thresholds (${evaluation.lineDelta.totalLinesChanged} lines changed).`,
      };
      return this.formatResponse(permitted);
    }

    const question =
      evaluation.suggestedQuestion ??
      `Socratic Checkpoint: Modifying "${parsed.path}". Before writing, explain the architectural mechanism.`;
    const concept = evaluation.concept ?? 'ARCHITECTURAL_RATIONALE';

    const staged = this.stagingBuffer.stage({
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

    if (this.deps.pendingRepo) {
      this.deps.pendingRepo.insert({
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

    if (this.deps.checkpointRepo) {
      this.deps.checkpointRepo.insertCheckpoint({
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

    return this.formatResponse(response);
  }

  private async handleEditFile(rawArgs: unknown): Promise<CallToolResult> {
    const parsed = EditFileInputSchema.parse(rawArgs);
    const existing = (await safeReadFile(parsed.path)) ?? '';
    const patchedContent =
      existing !== ''
        ? applyEdits(existing, parsed.edits)
        : parsed.edits.map((e) => e.newText).join('\n');

    const evaluation = this.scorer.evaluate(parsed.path, existing, patchedContent, this.currentTurnId);

    if (!evaluation.exceedsThreshold) {
      const writeResult = await atomicWriteFile(parsed.path, patchedContent);
      const permitted: WritePermittedResponse = {
        status: 'write_permitted',
        file: parsed.path,
        bytesWritten: writeResult.bytesWritten,
        message: `Write permitted: within complexity thresholds (${evaluation.lineDelta.totalLinesChanged} lines changed).`,
      };
      return this.formatResponse(permitted);
    }

    const question =
      evaluation.suggestedQuestion ??
      `Socratic Checkpoint: Modifying "${parsed.path}". Before writing, explain the architectural mechanism.`;
    const concept = evaluation.concept ?? 'ARCHITECTURAL_RATIONALE';

    const staged = this.stagingBuffer.stage({
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

    if (this.deps.pendingRepo) {
      this.deps.pendingRepo.insert({
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

    if (this.deps.checkpointRepo) {
      this.deps.checkpointRepo.insertCheckpoint({
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

    return this.formatResponse(response);
  }

  private async handleSubmitAnswer(rawArgs: unknown): Promise<CallToolResult> {
    const response = await handleSubmitAnswer(rawArgs, {
      stagingBuffer: this.stagingBuffer,
      ...this.deps,
    });

    return this.formatResponse(response);
  }
}
