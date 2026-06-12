import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ComplexityScorer, defaultComplexityScorer } from '../core/scorer/index.js';
import { defaultStagingBuffer, StagingBuffer } from '../core/staging/buffer.js';
import {
  McpRequestDispatcher,
  RATIO_TOOLS,
} from './dispatcher.js';
import type { SubmitAnswerDependencies } from './tools/submit-answer.js';

export { RATIO_TOOLS, McpRequestDispatcher };
export { handleSubmitAnswer, type SubmitAnswerDependencies } from './tools/submit-answer.js';

/**
 * Registers tool discovery and interception handlers with the MCP server instance
 * using the optimized, low-allocation McpRequestDispatcher.
 */
export function registerTools(
  server: Server,
  stagingBuffer: StagingBuffer = defaultStagingBuffer,
  scorer: ComplexityScorer = defaultComplexityScorer,
  deps: SubmitAnswerDependencies = {}
): McpRequestDispatcher {
  const dispatcher = new McpRequestDispatcher(stagingBuffer, scorer, deps);
  dispatcher.registerWithServer(server);
  return dispatcher;
}
