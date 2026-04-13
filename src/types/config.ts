/**
 * Configuration schema interfaces for Ratio.
 */

export interface ThresholdConfig {
  maxLines: number;
  maxFilesPerTurn: number;
  maxDependencies: number;
}

export interface TrustModelConfig {
  initial: number;
  decay: number;
  recovery: number;
  min: number;
  max: number;
}

export interface StorageConfig {
  dbPath?: string;
  walMode?: boolean;
}

export interface RatioConfig {
  version: string;
  thresholds: ThresholdConfig;
  layers: Record<string, string[]>;
  trust: TrustModelConfig;
  storage?: StorageConfig;
}

export const DEFAULT_CONFIG: RatioConfig = {
  version: '1.0.0',
  thresholds: {
    maxLines: 50,
    maxFilesPerTurn: 3,
    maxDependencies: 1,
  },
  layers: {
    api: ['**/api/**', '**/routes/**', '**/controllers/**', '**/server/**'],
    db: ['**/db/**', '**/models/**', '**/migrations/**', '**/schema/**'],
    auth: ['**/auth/**', '**/jwt/**', '**/session/**', '**/middleware/auth*'],
    ui: ['**/components/**', '**/views/**', '**/pages/**', '**/ui/**'],
    core: ['**/core/**', '**/services/**', '**/lib/**'],
    config: ['**/*.config.*', '**/env.*', '**/.env*'],
  },
  trust: {
    initial: 1.0,
    decay: 0.25,
    recovery: 0.1,
    min: 0.0,
    max: 1.0,
  },
};
