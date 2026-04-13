import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { registerTools } from './tools.js';

export const SERVER_NAME = 'ratio';
export const SERVER_VERSION = '0.1.0';

/**
 * Creates and configures the baseline Ratio MCP server instance.
 */
export function createRatioServer(): Server {
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

  registerTools(server);

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
  const transport = customTransport ?? new StdioServerTransport();

  await server.connect(transport);
  return { server, transport };
}

if (import.meta.main) {
  startServer().catch((error) => {
    console.error('Fatal error running Ratio MCP server:', error);
    process.exit(1);
  });
}
