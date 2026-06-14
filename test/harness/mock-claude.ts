import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CheckpointResponse, WritePermittedResponse } from '../../src/types/protocol.js';

export interface ClaudeAgentOptions {
  name?: string;
  version?: string;
  autoAnswer?: boolean;
  defaultAnswer?: string;
  answerProvider?: (checkpoint: CheckpointResponse) => Promise<string> | string;
}

export interface RelayedQuestionRecord {
  ticketId: string;
  file: string;
  question: string;
  concept?: string;
  submittedAnswer?: string;
  timestamp: number;
}

export interface InterceptionResult {
  permitted: boolean;
  checkpoint?: CheckpointResponse;
  writeResult?: WritePermittedResponse;
  raw: any;
}

/**
 * Mock Claude Code client harness simulating Claude Code agent execution,
 * tool invocation over stdio/MCP transports, Socratic checkpoint interception,
 * and conversational question-relaying behaviors.
 */
export class MockClaudeClient {
  private client: Client;
  private options: ClaudeAgentOptions;
  private relayedQuestions: RelayedQuestionRecord[] = [];
  private callHistory: Array<{ tool: string; args: any; response: any; timestamp: number }> = [];

  constructor(options: ClaudeAgentOptions = {}) {
    this.options = {
      name: 'claude-code',
      version: '1.0.0',
      autoAnswer: false,
      defaultAnswer: 'I have verified the architectural requirements and understood the logic.',
      ...options,
    };

    this.client = new Client(
      {
        name: this.options.name!,
        version: this.options.version!,
      },
      {
        capabilities: {},
      }
    );
  }

  public async connect(transport: Transport): Promise<void> {
    await this.client.connect(transport);
  }

  public async listTools() {
    return this.client.listTools();
  }

  public async writeFile(
    path: string,
    content: string,
    rationale?: string
  ): Promise<InterceptionResult> {
    const rawResult = await this.client.callTool({
      name: 'ratio_write_file',
      arguments: {
        path,
        content,
        rationale: rationale ?? `Claude Code editing ${path}`,
      },
    });

    return this.handleToolResponse('ratio_write_file', { path, content, rationale }, rawResult);
  }

  public async editFile(
    path: string,
    edits: Array<{ oldText: string; newText: string; startLine?: number; endLine?: number }>,
    rationale?: string
  ): Promise<InterceptionResult> {
    const rawResult = await this.client.callTool({
      name: 'ratio_edit_file',
      arguments: {
        path,
        edits,
        rationale: rationale ?? `Claude Code patching ${path}`,
      },
    });

    return this.handleToolResponse('ratio_edit_file', { path, edits, rationale }, rawResult);
  }

  public async submitAnswer(ticketId: string, answer: string): Promise<any> {
    const res = await this.client.callTool({
      name: 'ratio_submit_answer',
      arguments: {
        ticket_id: ticketId,
        answer,
      },
    });

    const parsed = this.parseMcpTextContent(res);
    this.callHistory.push({
      tool: 'ratio_submit_answer',
      args: { ticketId, answer },
      response: parsed,
      timestamp: Date.now(),
    });

    return parsed;
  }

  private async handleToolResponse(
    tool: string,
    args: any,
    rawResult: any
  ): Promise<InterceptionResult> {
    const parsed = this.parseMcpTextContent(rawResult);

    this.callHistory.push({
      tool,
      args,
      response: parsed,
      timestamp: Date.now(),
    });

    if (parsed && parsed.status === 'checkpoint_required') {
      const checkpoint = parsed as CheckpointResponse;

      const record: RelayedQuestionRecord = {
        ticketId: checkpoint.ticketId,
        file: checkpoint.file,
        question: checkpoint.question,
        concept: checkpoint.concept,
        timestamp: Date.now(),
      };
      this.relayedQuestions.push(record);

      if (this.options.autoAnswer) {
        const answer = this.options.answerProvider
          ? await this.options.answerProvider(checkpoint)
          : this.options.defaultAnswer!;

        record.submittedAnswer = answer;
        const answerRes = await this.submitAnswer(checkpoint.ticketId, answer);

        return {
          permitted: answerRes?.status === 'write_permitted',
          checkpoint,
          writeResult: answerRes?.status === 'write_permitted' ? answerRes : undefined,
          raw: rawResult,
        };
      }

      return {
        permitted: false,
        checkpoint,
        raw: rawResult,
      };
    }

    if (parsed && parsed.status === 'write_permitted') {
      return {
        permitted: true,
        writeResult: parsed as WritePermittedResponse,
        raw: rawResult,
      };
    }

    return {
      permitted: false,
      raw: rawResult,
    };
  }

  private parseMcpTextContent(mcpResponse: any): any {
    if (!mcpResponse?.content || !Array.isArray(mcpResponse.content)) {
      return null;
    }
    const textEntry = mcpResponse.content.find((c: any) => c.type === 'text');
    if (!textEntry?.text) return null;
    try {
      return JSON.parse(textEntry.text);
    } catch {
      return textEntry.text;
    }
  }

  public getRelayedQuestions(): readonly RelayedQuestionRecord[] {
    return [...this.relayedQuestions];
  }

  public getCallHistory(): readonly Array<{ tool: string; args: any; response: any; timestamp: number }> {
    return [...this.callHistory];
  }

  public clearHistory(): void {
    this.relayedQuestions = [];
    this.callHistory = [];
  }

  public async close(): Promise<void> {
    await this.client.close();
  }
}
