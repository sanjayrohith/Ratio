import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { CheckpointResponse } from '../types/protocol.js';

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
 * Creates a prototype static checkpoint_required response.
 */
export function createMockCheckpointResponse(
  filePath: string,
  rationale?: string
): CheckpointResponse {
  return {
    status: 'checkpoint_required',
    ticketId: `chk_proto_${Date.now().toString(36)}`,
    file: filePath,
    question: `Socratic Checkpoint: Before Ratio permits writing to "${filePath}", explain: What is the core architectural mechanism of this change and what failure modes does it guard against?`,
    concept: 'ARCHITECTURAL_RATIONALE',
    rationale: rationale ?? 'Intercepted file operation requires comprehension verification.',
    hint: 'Explain the mechanism clearly in plain language without hand-waving.',
  };
}

/**
 * Registers tool discovery and prototype interception handlers with the MCP server instance.
 */
export function registerTools(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [...RATIO_TOOLS],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'ratio_write_file' || name === 'ratio_edit_file') {
      const filePath = typeof args?.path === 'string' ? args.path : 'unknown';
      const rationale = typeof args?.rationale === 'string' ? args.rationale : undefined;
      const checkpoint = createMockCheckpointResponse(filePath, rationale);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(checkpoint, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown tool requested: ${name}`);
  });
}

