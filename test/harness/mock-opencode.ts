import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';
import type { CheckpointResponse, WritePermittedResponse } from '../../src/types/protocol.js';

export interface OpenCodeClientOptions {
  agentName?: string;
  agentVersion?: string;
  protocolVersion?: string;
  autoRelayAnswers?: boolean;
  answerProvider?: (checkpoint: CheckpointResponse) => Promise<string> | string;
}

export interface OpenCodeCallRecord {
  method: string;
  params: any;
  response: any;
  latencyMs: number;
}

/**
 * Mock OpenCode client harness simulating open-source coding agents
 * (e.g., OpenCode, OpenHands, Aider) verifying strict JSON-RPC 2.0 compliance,
 * dual-engine compatibility, and Socratic checkpoint negotiation.
 */
export class MockOpenCodeClient {
  private transport?: Transport;
  private options: OpenCodeClientOptions;
  private requestIdCounter = 1;
  private pendingRequests = new Map<
    string | number,
    { resolve: (res: any) => void; reject: (err: any) => void; startTime: number; method: string; params: any }
  >();
  private callLog: OpenCodeCallRecord[] = [];
  private receivedNotifications: any[] = [];

  constructor(options: OpenCodeClientOptions = {}) {
    this.options = {
      agentName: 'opencode-agent',
      agentVersion: '0.4.2',
      protocolVersion: '2024-11-05',
      autoRelayAnswers: false,
      ...options,
    };
  }

  public async connect(transport: Transport): Promise<void> {
    this.transport = transport;

    transport.onmessage = (message: JSONRPCMessage) => {
      this.handleIncomingMessage(message);
    };

    await transport.start();

    // Perform JSON-RPC 2.0 initialization handshake
    await this.sendRequest('initialize', {
      protocolVersion: this.options.protocolVersion,
      capabilities: {},
      clientInfo: {
        name: this.options.agentName,
        version: this.options.agentVersion,
      },
    });

    // Notify server of initialized state
    await this.sendNotification('notifications/initialized', {});
  }

  public async listTools(): Promise<Array<{ name: string; description?: string; inputSchema: any }>> {
    const res = await this.sendRequest('tools/list', {});
    return res?.tools ?? [];
  }

  public async callTool(name: string, args: Record<string, any>): Promise<any> {
    const rawResult = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    const parsed = this.extractContent(rawResult);

    // Auto-answer check if checkpoint_required
    if (parsed && parsed.status === 'checkpoint_required' && this.options.autoRelayAnswers) {
      const checkpoint = parsed as CheckpointResponse;
      const answer = this.options.answerProvider
        ? await this.options.answerProvider(checkpoint)
        : `OpenCode agent verified architectural mechanisms for ${checkpoint.file}`;

      const answerRes = await this.submitAnswer(checkpoint.ticketId, answer);
      return answerRes;
    }

    return parsed ?? rawResult;
  }

  public async writeFile(path: string, content: string, rationale?: string): Promise<any> {
    return this.callTool('ratio_write_file', {
      path,
      content,
      rationale: rationale ?? `OpenCode modifying ${path}`,
    });
  }

  public async editFile(
    path: string,
    edits: Array<{ oldText: string; newText: string; startLine?: number; endLine?: number }>,
    rationale?: string
  ): Promise<any> {
    return this.callTool('ratio_edit_file', {
      path,
      edits,
      rationale: rationale ?? `OpenCode editing ${path}`,
    });
  }

  public async submitAnswer(ticketId: string, answer: string): Promise<any> {
    return this.callTool('ratio_submit_answer', {
      ticket_id: ticketId,
      answer,
    });
  }

  public async sendRequest(method: string, params: any): Promise<any> {
    if (!this.transport) {
      throw new Error('MockOpenCodeClient is not connected to a transport');
    }

    const id = this.requestIdCounter++;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve,
        reject,
        startTime: performance.now(),
        method,
        params,
      });

      this.transport!.send(request).catch((err) => {
        this.pendingRequests.delete(id);
        reject(err);
      });
    });
  }

  public async sendNotification(method: string, params: any): Promise<void> {
    if (!this.transport) {
      throw new Error('MockOpenCodeClient is not connected to a transport');
    }

    await this.transport.send({
      jsonrpc: '2.0',
      method,
      params,
    } as any);
  }

  private handleIncomingMessage(message: JSONRPCMessage): void {
    if ('id' in message && message.id !== undefined && message.id !== null) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        const duration = performance.now() - pending.startTime;

        if ('error' in message && message.error) {
          this.callLog.push({
            method: pending.method,
            params: pending.params,
            response: message.error,
            latencyMs: duration,
          });
          pending.reject(new Error(`JSON-RPC Error ${message.error.code}: ${message.error.message}`));
        } else if ('result' in message) {
          this.callLog.push({
            method: pending.method,
            params: pending.params,
            response: message.result,
            latencyMs: duration,
          });
          pending.resolve(message.result);
        }
      }
    } else {
      this.receivedNotifications.push(message);
    }
  }

  private extractContent(result: any): any {
    if (!result?.content || !Array.isArray(result.content)) {
      return null;
    }
    const textEntry = result.content.find((c: any) => c.type === 'text');
    if (!textEntry?.text) return null;
    try {
      return JSON.parse(textEntry.text);
    } catch {
      return textEntry.text;
    }
  }

  public getCallLog(): readonly OpenCodeCallRecord[] {
    return [...this.callLog];
  }

  public getNotifications(): readonly any[] {
    return [...this.receivedNotifications];
  }

  public async close(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = undefined;
    }
  }
}
