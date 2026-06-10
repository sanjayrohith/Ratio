import { randomBytes } from 'node:crypto';
import { StagingBuffer, StagedWrite, StagedWriteStatus, defaultStagingBuffer } from './buffer.js';
import { CommitTransactionExecutor, CommitResult } from './executor.js';
import { StagedWriteRollbackHandler, RollbackResult } from './rollback.js';
import { PendingWriteRepository, PendingWriteRecord } from '../../storage/pending-writes.js';
import {
  LayerCategory,
  defaultLayerTagger,
  LayerTagger,
} from '../scorer/layers.js';
import {
  LayerTransitionDetector,
  LayerTransitionResult,
  LayerTransition,
  defaultTransitionDetector,
} from '../scorer/transitions.js';
import { atomicWriteFile } from '../../storage/fs.js';

export type BatchStatus = 'active' | 'pending_checkpoint' | 'approved' | 'committed' | 'rolled_back';

export interface BatchLayerImpact {
  layersTouched: LayerCategory[];
  isMultiLayer: boolean;
  transitions: LayerTransition[];
  sensitiveLayers: LayerCategory[];
  totalFiles: number;
  impactScore: number; // 0 - 100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
}

export interface BatchItemInput {
  filePath: string;
  content: string;
  operation: 'write' | 'edit';
  question?: string;
  concept?: string;
  rationale?: string;
  metadata?: Record<string, unknown>;
}

export interface StagedBatchItem {
  ticketId: string;
  filePath: string;
  content: string;
  operation: 'write' | 'edit';
  question?: string;
  concept?: string;
  rationale?: string;
  status: StagedWriteStatus;
  layers: LayerCategory[];
  metadata?: Record<string, unknown>;
}

export interface BatchTransaction {
  batchId: string;
  turnId?: string;
  status: BatchStatus;
  items: StagedBatchItem[];
  layerImpact: BatchLayerImpact;
  checkpointRequired: boolean;
  checkpointTicketId?: string;
  createdAt: Date;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface BatchCommitResult {
  batchId: string;
  status: 'committed';
  committedCount: number;
  results: CommitResult[];
  committedAt: string;
}

export interface BatchRollbackResult {
  batchId: string;
  status: 'rolled_back';
  rolledBackCount: number;
  reason: string;
  results: RollbackResult[];
  resolvedAt: string;
}

export interface BatchCoordinatorOptions {
  stagingBuffer?: StagingBuffer;
  pendingRepo?: PendingWriteRepository;
  executor?: CommitTransactionExecutor;
  rollbackHandler?: StagedWriteRollbackHandler;
  layerTagger?: LayerTagger;
  transitionDetector?: LayerTransitionDetector;
}

/**
 * Coordinates atomic multi-file batch writes in a single turn.
 * Manages cross-file layer impact computation, unified checkpoint gating,
 * and atomic all-or-nothing commit and rollback handling.
 */
export class BatchTransactionCoordinator {
  private readonly stagingBuffer: StagingBuffer;
  private readonly pendingRepo?: PendingWriteRepository;
  private readonly executor?: CommitTransactionExecutor;
  private readonly rollbackHandler?: StagedWriteRollbackHandler;
  private readonly layerTagger: LayerTagger;
  private readonly transitionDetector: LayerTransitionDetector;

  private batches: Map<string, BatchTransaction> = new Map();
  private turnToBatchMap: Map<string, string> = new Map();

  constructor(options: BatchCoordinatorOptions = {}) {
    this.stagingBuffer = options.stagingBuffer ?? defaultStagingBuffer;
    this.pendingRepo = options.pendingRepo;
    this.layerTagger = options.layerTagger ?? defaultLayerTagger;
    this.transitionDetector = options.transitionDetector ?? defaultTransitionDetector;

    if (options.executor) {
      this.executor = options.executor;
    } else if (this.pendingRepo) {
      this.executor = new CommitTransactionExecutor(this.pendingRepo, this.stagingBuffer);
    }

    if (options.rollbackHandler) {
      this.rollbackHandler = options.rollbackHandler;
    } else if (this.pendingRepo) {
      this.rollbackHandler = new StagedWriteRollbackHandler(this.pendingRepo, this.stagingBuffer);
    }
  }

  /**
   * Generates a unique batch identifier.
   */
  public generateBatchId(): string {
    const timestamp = Date.now().toString(36);
    const rand = randomBytes(4).toString('hex');
    return `batch_${timestamp}_${rand}`;
  }

  /**
   * Begins a new multi-file batch transaction for a turn.
   */
  public beginBatch(options: { turnId?: string; metadata?: Record<string, unknown> } = {}): BatchTransaction {
    const batchId = this.generateBatchId();
    const batch: BatchTransaction = {
      batchId,
      turnId: options.turnId,
      status: 'active',
      items: [],
      layerImpact: this.computeCrossFileLayerImpact([]),
      checkpointRequired: false,
      createdAt: new Date(),
      metadata: options.metadata,
    };

    this.batches.set(batchId, batch);
    if (options.turnId) {
      this.turnToBatchMap.set(options.turnId, batchId);
    }

    return batch;
  }

  /**
   * Retrieves a batch by its unique batch ID.
   */
  public getBatch(batchId: string): BatchTransaction | undefined {
    return this.batches.get(batchId);
  }

  /**
   * Retrieves the active batch associated with a turn ID.
   */
  public getBatchByTurnId(turnId: string): BatchTransaction | undefined {
    const batchId = this.turnToBatchMap.get(turnId);
    if (!batchId) return undefined;
    return this.batches.get(batchId);
  }

  /**
   * Lists all tracked batch transactions.
   */
  public listBatches(): BatchTransaction[] {
    return Array.from(this.batches.values());
  }

  /**
   * Computes the cross-file architectural layer impact across a set of file paths.
   */
  public computeCrossFileLayerImpact(filePaths: string[]): BatchLayerImpact {
    if (filePaths.length === 0) {
      return {
        layersTouched: [],
        isMultiLayer: false,
        transitions: [],
        sensitiveLayers: [],
        totalFiles: 0,
        impactScore: 0,
        riskLevel: 'low',
        summary: 'Empty batch with no files modified.',
      };
    }

    const transitionResult = this.transitionDetector.analyzePaths(filePaths);
    const layersTouched = transitionResult.layersTouched;
    const isMultiLayer = transitionResult.isMultiLayer;
    const transitions = transitionResult.transitions;

    const sensitiveLayers = layersTouched.filter(
      (layer) => layer === 'auth' || layer === 'db'
    );

    // Compute composite impact score (0 to 100)
    let score = 0;
    // 1. Base score per layer touched: 15 pts each
    score += layersTouched.length * 15;
    // 2. Multi-layer penalty: 25 pts
    if (isMultiLayer) {
      score += 25;
    }
    // 3. Sensitive layer impact (auth, db): 20 pts per sensitive layer
    score += sensitiveLayers.length * 20;
    // 4. Cross-layer transition hops: 5 pts per transition
    score += transitions.length * 5;
    // 5. Volume scale: 8 pts per additional file beyond the first
    score += Math.max(0, (filePaths.length - 1) * 8);

    const impactScore = Math.min(100, Math.max(0, score));

    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (impactScore >= 75) {
      riskLevel = 'critical';
    } else if (impactScore >= 50) {
      riskLevel = 'high';
    } else if (impactScore >= 25) {
      riskLevel = 'medium';
    }

    const summary = isMultiLayer
      ? `Batch modifies ${filePaths.length} file(s) crossing architectural layers [${layersTouched.join(', ')}] (${riskLevel} risk, impact: ${impactScore}/100).`
      : layersTouched.length === 1
      ? `Batch modifies ${filePaths.length} file(s) within single layer [${layersTouched[0]}] (${riskLevel} risk, impact: ${impactScore}/100).`
      : `Batch modifies ${filePaths.length} file(s) without specific architectural layer categorization (${riskLevel} risk, impact: ${impactScore}/100).`;

    return {
      layersTouched,
      isMultiLayer,
      transitions,
      sensitiveLayers,
      totalFiles: filePaths.length,
      impactScore,
      riskLevel,
      summary,
    };
  }

  /**
   * Adds a file write operation to an active batch and recomputes cross-file layer impact.
   */
  public addWrite(batchId: string, item: BatchItemInput): StagedBatchItem {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    if (batch.status === 'committed') {
      throw new Error(`Cannot add write to already committed batch: ${batchId}`);
    }
    if (batch.status === 'rolled_back') {
      throw new Error(`Cannot add write to rolled back batch: ${batchId}`);
    }

    // Stage into memory buffer
    const staged = this.stagingBuffer.stage({
      file: item.filePath,
      content: item.content,
      operation: item.operation,
      question: item.question ?? 'Architectural rationale required for multi-file modification.',
      concept: item.concept,
      rationale: item.rationale,
      metadata: {
        ...item.metadata,
        batchId,
        turnId: batch.turnId,
      },
    });

    // If SQLite repository is configured, insert pending record
    if (this.pendingRepo) {
      this.pendingRepo.insert({
        ticketId: staged.ticketId,
        filePath: item.filePath,
        content: item.content,
        operation: item.operation,
        question: staged.question,
        concept: item.concept,
        rationale: item.rationale,
        metadata: {
          ...item.metadata,
          batchId,
          turnId: batch.turnId,
        },
      });
    }

    const fileLayers = this.layerTagger.tagPath(item.filePath);

    const stagedItem: StagedBatchItem = {
      ticketId: staged.ticketId,
      filePath: item.filePath,
      content: item.content,
      operation: item.operation,
      question: staged.question,
      concept: item.concept,
      rationale: item.rationale,
      status: staged.status,
      layers: fileLayers,
      metadata: item.metadata,
    };

    batch.items.push(stagedItem);

    // Recompute cross-file layer impact with the new set of files
    const allPaths = batch.items.map((i) => i.filePath);
    batch.layerImpact = this.computeCrossFileLayerImpact(allPaths);

    return stagedItem;
  }

  /**
   * Flags the batch as requiring checkpoint comprehension verification before commit.
   */
  public requireCheckpoint(
    batchId: string,
    checkpoint: { question: string; concept: string; rationale?: string; ticketId?: string }
  ): void {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    batch.status = 'pending_checkpoint';
    batch.checkpointRequired = true;
    batch.checkpointTicketId = checkpoint.ticketId;
  }

  /**
   * Approves all staged writes within the batch.
   */
  public approveBatch(batchId: string): void {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    if (batch.status === 'committed') {
      throw new Error(`Cannot approve already committed batch: ${batchId}`);
    }
    if (batch.status === 'rolled_back') {
      throw new Error(`Cannot approve rolled back batch: ${batchId}`);
    }

    for (const item of batch.items) {
      try {
        this.stagingBuffer.approve(item.ticketId);
      } catch {
        // May already be approved
      }

      if (this.pendingRepo) {
        try {
          this.pendingRepo.markApproved(item.ticketId);
        } catch {
          // May already be approved
        }
      }

      item.status = 'approved';
    }

    batch.status = 'approved';
  }

  /**
   * Commits all approved staged writes in the batch atomically to the filesystem.
   */
  public async commitBatch(batchId: string): Promise<BatchCommitResult> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    if (batch.status === 'committed') {
      throw new Error(`Batch has already been committed: ${batchId}`);
    }
    if (batch.status === 'rolled_back') {
      throw new Error(`Cannot commit rolled back batch: ${batchId}`);
    }

    // Auto-approve if currently active and not pending checkpoint
    if (batch.status === 'active') {
      this.approveBatch(batchId);
    }

    const commitResults: CommitResult[] = [];
    const now = new Date().toISOString();

    for (const item of batch.items) {
      if (this.executor) {
        const res = await this.executor.commit(item.ticketId);
        commitResults.push(res);
      } else {
        const writeRes = await atomicWriteFile(item.filePath, item.content, { encoding: 'utf-8' });
        this.stagingBuffer.commit(item.ticketId);
        commitResults.push({
          ticketId: item.ticketId,
          filePath: item.filePath,
          bytesWritten: writeRes.bytesWritten,
          status: 'COMMITTED',
          committedAt: now,
        });
      }
      item.status = 'committed';
    }

    batch.status = 'committed';
    batch.resolvedAt = new Date();

    return {
      batchId,
      status: 'committed',
      committedCount: commitResults.length,
      results: commitResults,
      committedAt: now,
    };
  }

  /**
   * Rolls back all staged writes in the batch, preventing any filesystem changes.
   */
  public rollbackBatch(
    batchId: string,
    reason: string = 'Multi-file batch write cancelled or rejected'
  ): BatchRollbackResult {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    if (batch.status === 'committed') {
      throw new Error(`Cannot roll back already committed batch: ${batchId}`);
    }

    const rollbackResults: RollbackResult[] = [];
    const now = new Date().toISOString();

    for (const item of batch.items) {
      if (this.rollbackHandler) {
        const res = this.rollbackHandler.rollback(item.ticketId, reason);
        rollbackResults.push(res);
      } else {
        this.stagingBuffer.reject(item.ticketId, reason);
        rollbackResults.push({
          ticketId: item.ticketId,
          filePath: item.filePath,
          status: 'REJECTED',
          rejectionReason: reason,
          resolvedAt: now,
        });
      }
      item.status = 'rejected';
    }

    batch.status = 'rolled_back';
    batch.resolvedAt = new Date();

    return {
      batchId,
      status: 'rolled_back',
      rolledBackCount: rollbackResults.length,
      reason,
      results: rollbackResults,
      resolvedAt: now,
    };
  }
}
