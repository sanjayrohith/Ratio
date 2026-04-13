/**
 * Interceptor lifecycle event definitions for telemetry and ledger updates.
 */

export type InterceptorEventType =
  | 'write_intercepted'
  | 'checkpoint_triggered'
  | 'answer_submitted'
  | 'checkpoint_passed'
  | 'checkpoint_failed'
  | 'write_committed'
  | 'write_rolled_back';

export interface BaseInterceptorEvent {
  id: string;
  type: InterceptorEventType;
  timestamp: string;
  sessionId?: string;
  file: string;
}

export interface WriteInterceptedEvent extends BaseInterceptorEvent {
  type: 'write_intercepted';
  lineDelta: number;
  layers: string[];
  newDependencies: string[];
}

export interface CheckpointTriggeredEvent extends BaseInterceptorEvent {
  type: 'checkpoint_triggered';
  ticketId: string;
  question: string;
  concept: string;
}

export interface AnswerSubmittedEvent extends BaseInterceptorEvent {
  type: 'answer_submitted';
  ticketId: string;
  answer: string;
}

export interface CheckpointResolvedEvent extends BaseInterceptorEvent {
  type: 'checkpoint_passed' | 'checkpoint_failed';
  ticketId: string;
  score: number;
  matchedConcepts: string[];
  trustScoreDelta: number;
}

export interface WriteCommittedEvent extends BaseInterceptorEvent {
  type: 'write_committed';
  ticketId: string;
  bytesWritten: number;
}

export interface WriteRolledBackEvent extends BaseInterceptorEvent {
  type: 'write_rolled_back';
  ticketId: string;
  reason: string;
}

export type InterceptorEvent =
  | WriteInterceptedEvent
  | CheckpointTriggeredEvent
  | AnswerSubmittedEvent
  | CheckpointResolvedEvent
  | WriteCommittedEvent
  | WriteRolledBackEvent;
