import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findProjectRoot } from '../../storage/workspace.js';
import {
  loadRatioConfig,
  parseRatioConfig,
  RatioConfigFile,
  generateDefaultConfigJson,
} from '../../core/config/schema.js';

export interface ConfigOptions {
  cwd?: string;
  verbose?: boolean;
}

export interface ConfigGetResult {
  success: boolean;
  configPath: string;
  key?: string;
  value?: any;
  config?: RatioConfigFile;
  error?: string;
}

export interface ConfigSetResult {
  success: boolean;
  configPath: string;
  key: string;
  value?: any;
  previousValue?: any;
  config?: RatioConfigFile;
  error?: string;
}

/**
 * Normalizes user-supplied config key to nested path.
 * e.g. "maxLinesAdded" -> "thresholds.maxLinesAdded"
 */
function resolveConfigPath(key: string): string[] {
  const parts = key.split('.');
  if (parts.length > 1) {
    return parts;
  }

  const single = parts[0];
  const thresholdKeys = [
    'maxLinesAdded',
    'maxLinesRemoved',
    'maxTotalLinesChanged',
    'maxDependenciesAdded',
    'maxFilesPerTurn',
  ];
  const weightKeys = [
    'lineWeight',
    'dependencyWeight',
    'multiLayerWeight',
    'sensitiveLayerWeight',
    'riskThreshold',
  ];
  const trustKeys = ['initial', 'decay', 'recovery', 'min', 'max'];
  const storageKeys = ['dbPath', 'walMode'];

  if (thresholdKeys.includes(single)) {
    return ['thresholds', single];
  }
  if (weightKeys.includes(single)) {
    return ['weights', single];
  }
  if (trustKeys.includes(single)) {
    return ['trust', single];
  }
  if (storageKeys.includes(single)) {
    return ['storage', single];
  }

  return [single];
}

/**
 * Safely accesses a nested property in an object.
 */
function getNestedProperty(obj: any, path: string[]): { found: boolean; value?: any } {
  let current = obj;
  for (const segment of path) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return { found: false };
    }
    if (!(segment in current)) {
      return { found: false };
    }
    current = current[segment];
  }
  return { found: true, value: current };
}

/**
 * Safely sets a nested property in an object.
 */
function setNestedProperty(obj: any, path: string[], value: any): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    if (!(segment in current) || typeof current[segment] !== 'object' || current[segment] === null) {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[path[path.length - 1]] = value;
}

/**
 * Coerces string input value into number, boolean, or parsed JSON depending on existing value/type.
 */
function parseValueForTarget(rawVal: string, existingVal: any): any {
  if (typeof existingVal === 'number') {
    const num = Number(rawVal);
    if (isNaN(num)) {
      throw new Error(`Invalid numeric value: "${rawVal}"`);
    }
    return num;
  }
  if (typeof existingVal === 'boolean') {
    if (rawVal.toLowerCase() === 'true' || rawVal === '1') return true;
    if (rawVal.toLowerCase() === 'false' || rawVal === '0') return false;
    throw new Error(`Invalid boolean value: "${rawVal}" (expected "true" or "false")`);
  }
  if (typeof existingVal === 'object' && existingVal !== null) {
    try {
      return JSON.parse(rawVal);
    } catch {
      throw new Error(`Invalid JSON value for object property: "${rawVal}"`);
    }
  }

  // Fallback heuristics if no existing value was typed
  if (rawVal.toLowerCase() === 'true') return true;
  if (rawVal.toLowerCase() === 'false') return false;
  const asNum = Number(rawVal);
  if (!isNaN(asNum) && rawVal.trim() !== '') return asNum;

  return rawVal;
}

/**
 * Retrieves a configuration value or dumps the full configuration.
 */
export async function executeConfigGet(
  key?: string,
  options: ConfigOptions = {}
): Promise<ConfigGetResult> {
  const rootDir = findProjectRoot(options.cwd);
  const configPath = join(rootDir, 'ratio.config.json');

  let config: RatioConfigFile;
  try {
    config = await loadRatioConfig(rootDir);
  } catch (err: any) {
    console.error(`Error loading configuration: ${err.message}`);
    return {
      success: false,
      configPath,
      error: err.message,
    };
  }

  if (!key) {
    console.log(JSON.stringify(config, null, 2));
    return {
      success: true,
      configPath,
      config,
    };
  }

  const path = resolveConfigPath(key);
  const res = getNestedProperty(config, path);

  if (!res.found) {
    const errorMsg = `Configuration key "${key}" not found.`;
    console.error(`Error: ${errorMsg}`);
    return {
      success: false,
      configPath,
      key,
      error: errorMsg,
    };
  }

  const displayVal = typeof res.value === 'object' ? JSON.stringify(res.value, null, 2) : res.value;
  console.log(`${key} = ${displayVal}`);

  return {
    success: true,
    configPath,
    key,
    value: res.value,
    config,
  };
}

/**
 * Updates a configuration value in ratio.config.json, validating schema constraints.
 */
export async function executeConfigSet(
  key: string,
  rawValue: string,
  options: ConfigOptions = {}
): Promise<ConfigSetResult> {
  const rootDir = findProjectRoot(options.cwd);
  const configPath = join(rootDir, 'ratio.config.json');

  let currentConfig: any;
  if (existsSync(configPath)) {
    try {
      currentConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch (err: any) {
      const errorMsg = `Failed to read ${configPath}: ${err.message}`;
      console.error(`Error: ${errorMsg}`);
      return { success: false, configPath, key, error: errorMsg };
    }
  } else {
    currentConfig = JSON.parse(generateDefaultConfigJson());
  }

  const path = resolveConfigPath(key);
  const existingProp = getNestedProperty(currentConfig, path);

  let parsedValue: any;
  try {
    parsedValue = parseValueForTarget(rawValue, existingProp.value);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    return { success: false, configPath, key, error: err.message };
  }

  // Clone config and apply update
  const cloned = JSON.parse(JSON.stringify(currentConfig));
  setNestedProperty(cloned, path, parsedValue);

  // Validate against Zod schema
  let validatedConfig: RatioConfigFile;
  try {
    validatedConfig = parseRatioConfig(cloned);
  } catch (err: any) {
    const errorMsg = `Schema validation failed: ${err.message}`;
    console.error(`Error: ${errorMsg}`);
    return { success: false, configPath, key, error: errorMsg };
  }

  // Save back to file
  writeFileSync(configPath, JSON.stringify(validatedConfig, null, 2) + '\n', 'utf-8');

  console.log(`✓ Set ${key} to ${JSON.stringify(parsedValue)} in ${configPath}`);

  return {
    success: true,
    configPath,
    key,
    value: parsedValue,
    previousValue: existingProp.value,
    config: validatedConfig,
  };
}
