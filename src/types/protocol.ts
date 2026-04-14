import { z } from 'zod';

/**
 * Zod schemas and TypeScript definitions for Ratio interceptor protocol.
 */

export const CheckpointStatusSchema = z.enum([
  'checkpoint_required',
  'write_permitted',
  'write_rejected',
]);
export type CheckpointStatus = z.infer<typeof CheckpointStatusSchema>;

export const FileEditChunkSchema = z.object({
  oldText: z.string().describe('The exact existing text chunk to replace.'),
  newText: z.string().describe('The replacement text chunk.'),
  startLine: z.number().int().positive().optional().describe('1-indexed starting line number hint.'),
  endLine: z.number().int().positive().optional().describe('1-indexed ending line number hint.'),
});
export type FileEditChunk = z.infer<typeof FileEditChunkSchema>;

export const WriteFileInputSchema = z.object({
  path: z.string().min(1, 'Target file path must not be empty.').describe('Relative or absolute target file path.'),
  content: z.string().describe('The complete proposed content of the file.'),
  rationale: z.string().optional().describe('Agent rationale for why this file is being created or overwritten.'),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8').optional(),
});
export type WriteFileInput = z.infer<typeof WriteFileInputSchema>;

export const EditFileInputSchema = z.object({
  path: z.string().min(1, 'Target file path must not be empty.').describe('Relative or absolute target file path.'),
  edits: z.array(FileEditChunkSchema).min(1, 'At least one edit chunk must be provided.'),
  rationale: z.string().optional().describe('Agent rationale for why these edits are being applied.'),
});
export type EditFileInput = z.infer<typeof EditFileInputSchema>;

export const SubmitAnswerInputSchema = z.object({
  ticketId: z.string().min(1, 'Ticket ID is required.'),
  answer: z.string().min(1, 'Student answer is required.'),
});
export type SubmitAnswerInput = z.infer<typeof SubmitAnswerInputSchema>;

export const CheckpointRequiredSchema = z.object({
  status: z.literal('checkpoint_required'),
  ticketId: z.string().describe('Unique identifier for this pending checkpoint.'),
  file: z.string().describe('The target file path awaiting authorization.'),
  question: z.string().describe('The Socratic question that the agent must relay to the user.'),
  concept: z.string().optional().describe('The architectural concept taxonomy tag (e.g. JWT_SECRET, DB_MIGRATION).'),
  rationale: z.string().optional().describe('The captured rationale or trigger behind this checkpoint.'),
  hint: z.string().optional().describe('Guiding prompt or hint to assist the student in answering.'),
  instruction: z.string().optional().describe('Direct instruction to the agent on how to relay the question.'),
});
export type CheckpointResponse = z.infer<typeof CheckpointRequiredSchema>;

export const WritePermittedSchema = z.object({
  status: z.literal('write_permitted'),
  file: z.string().describe('The target file path that was written.'),
  bytesWritten: z.number().int().nonnegative().optional().describe('Number of bytes committed to disk.'),
  message: z.string().optional().describe('Confirmation message.'),
});
export type WritePermittedResponse = z.infer<typeof WritePermittedSchema>;

export const WriteRejectedSchema = z.object({
  status: z.literal('write_rejected'),
  file: z.string().describe('The target file path that was rejected.'),
  reason: z.string().describe('The explanation for why the write operation was rejected.'),
  ticketId: z.string().optional().describe('Associated checkpoint ticket ID if applicable.'),
});
export type WriteRejectedResponse = z.infer<typeof WriteRejectedSchema>;

export const InterceptorResponseSchema = z.discriminatedUnion('status', [
  CheckpointRequiredSchema,
  WritePermittedSchema,
  WriteRejectedSchema,
]);
export type InterceptorResponse = z.infer<typeof InterceptorResponseSchema>;
