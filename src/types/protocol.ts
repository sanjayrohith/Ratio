/**
 * Core protocol interfaces for Ratio MCP tool calls and interceptor responses.
 */

export type CheckpointStatus = 'checkpoint_required' | 'write_permitted' | 'write_rejected';

export interface FileEditChunk {
  oldText: string;
  newText: string;
  startLine?: number;
  endLine?: number;
}

export interface WriteFileInput {
  path: string;
  content: string;
  rationale?: string;
  encoding?: 'utf-8' | 'base64';
}

export interface EditFileInput {
  path: string;
  edits: FileEditChunk[];
  rationale?: string;
}

export interface SubmitAnswerInput {
  ticketId: string;
  answer: string;
}

export interface CheckpointResponse {
  status: 'checkpoint_required';
  ticketId: string;
  question: string;
  concept?: string;
  file: string;
  rationale?: string;
  hint?: string;
}

export interface WritePermittedResponse {
  status: 'write_permitted';
  file: string;
  bytesWritten?: number;
  message?: string;
}

export interface WriteRejectedResponse {
  status: 'write_rejected';
  ticketId?: string;
  file: string;
  reason: string;
}

export type InterceptorResponse = CheckpointResponse | WritePermittedResponse | WriteRejectedResponse;
