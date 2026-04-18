import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { DEFAULT_LAYER_RULES, LayerCategory } from '../scorer/layers.js';

export const ThresholdConfigSchema = z.object({
  maxLinesAdded: z.number().int().positive().default(50),
  maxLinesRemoved: z.number().int().positive().default(100),
  maxTotalLinesChanged: z.number().int().positive().default(60),
  maxDependenciesAdded: z.number().int().nonnegative().default(0),
  maxFilesPerTurn: z.number().int().positive().default(3),
});
export type ThresholdConfig = z.infer<typeof ThresholdConfigSchema>;

export const ScoringWeightsSchema = z.object({
  lineWeight: z.number().positive().default(1.0),
  dependencyWeight: z.number().positive().default(30.0),
  multiLayerWeight: z.number().positive().default(35.0),
  sensitiveLayerWeight: z.number().positive().default(20.0),
  riskThreshold: z.number().positive().default(45.0),
});
export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;

export const LayerPatternMapSchema = z.record(
  z.enum(['api', 'db', 'auth', 'ui', 'core', 'config', 'worker']),
  z.array(z.string())
);
export type LayerPatternMap = z.infer<typeof LayerPatternMapSchema>;

export const TrustConfigSchema = z.object({
  initial: z.number().min(0).max(1).default(1.0),
  decay: z.number().min(0).max(1).default(0.25),
  recovery: z.number().min(0).max(1).default(0.1),
  min: z.number().min(0).max(1).default(0.0),
  max: z.number().min(0).max(1).default(1.0),
});
export type TrustConfig = z.infer<typeof TrustConfigSchema>;

export const StorageConfigSchema = z.object({
  dbPath: z.string().default('.ratio/ledger.db'),
  walMode: z.boolean().default(true),
});
export type StorageConfig = z.infer<typeof StorageConfigSchema>;

export const RatioConfigFileSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().default('1.0.0'),
  thresholds: ThresholdConfigSchema.default({}),
  weights: ScoringWeightsSchema.default({}),
  layers: LayerPatternMapSchema.optional(),
  trust: TrustConfigSchema.default({}),
  storage: StorageConfigSchema.default({}),
});
export type RatioConfigFile = z.infer<typeof RatioConfigFileSchema>;

/**
 * Builds the default layer pattern map from system rules.
 */
export function getDefaultLayerPatternMap(): Record<LayerCategory, string[]> {
  const map: Partial<Record<LayerCategory, string[]>> = {};
  for (const rule of DEFAULT_LAYER_RULES) {
    map[rule.category] = [...rule.patterns];
  }
  return map as Record<LayerCategory, string[]>;
}

/**
 * Parses and validates raw configuration object against the Ratio config schema.
 */
export function parseRatioConfig(raw: unknown): RatioConfigFile {
  return RatioConfigFileSchema.parse(raw);
}

/**
 * Generates formatted default ratio.config.json content.
 */
export function generateDefaultConfigJson(): string {
  const defaultConfig: RatioConfigFile = {
    version: '1.0.0',
    thresholds: {
      maxLinesAdded: 50,
      maxLinesRemoved: 100,
      maxTotalLinesChanged: 60,
      maxDependenciesAdded: 0,
      maxFilesPerTurn: 3,
    },
    weights: {
      lineWeight: 1.0,
      dependencyWeight: 30.0,
      multiLayerWeight: 35.0,
      sensitiveLayerWeight: 20.0,
      riskThreshold: 45.0,
    },
    layers: getDefaultLayerPatternMap(),
    trust: {
      initial: 1.0,
      decay: 0.25,
      recovery: 0.1,
      min: 0.0,
      max: 1.0,
    },
    storage: {
      dbPath: '.ratio/ledger.db',
      walMode: true,
    },
  };

  return JSON.stringify(defaultConfig, null, 2);
}

/**
 * Safely loads ratio.config.json from project directory, falling back to defaults if missing.
 */
export async function loadRatioConfig(projectDir: string = process.cwd()): Promise<RatioConfigFile> {
  const configPath = resolve(projectDir, 'ratio.config.json');
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsedJson = JSON.parse(raw);
    return parseRatioConfig(parsedJson);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return parseRatioConfig({});
    }
    throw new Error(`Failed to parse ratio.config.json at ${configPath}: ${err.message}`);
  }
}
