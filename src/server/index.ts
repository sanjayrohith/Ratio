import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ManagedStdioTransport, PreparedStatementFinalizer, defaultStatementFinalizer } from './transport.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ComplexityScorer } from '../core/scorer/index.js';
import type { StagingBuffer } from '../core/staging/buffer.js';
import { registerTools } from './tools.js';
import type { SubmitAnswerDependencies } from './tools/submit-answer.js';

export { ManagedStdioTransport, PreparedStatementFinalizer, defaultStatementFinalizer };
export { McpRequestDispatcher, RATIO_TOOLS } from './dispatcher.js';

export const SERVER_NAME = 'ratio';
export const SERVER_VERSION = '0.1.0';

/**
 * Creates and configures the baseline Ratio MCP server instance.
 */
export function createRatioServer(
  stagingBuffer?: StagingBuffer,
  scorer?: ComplexityScorer,
  deps?: SubmitAnswerDependencies,
  turnId?: string,
  workspaceRoot?: string
): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  registerTools(server, stagingBuffer, scorer, deps, turnId, workspaceRoot);

  return server;
}

/**
 * Connects the Ratio MCP server to a transport (defaulting to StdioServerTransport).
 */
export async function startServer(customTransport?: Transport): Promise<{
  server: Server;
  transport: Transport;
}> {
  const server = createRatioServer();
  const transport = customTransport ?? new ManagedStdioTransport();

  await server.connect(transport);
  return { server, transport };
}

if (import.meta.main) {
  startServer().catch((error) => {
    console.error('Fatal error running Ratio MCP server:', error);
    process.exit(1);
  });
}
