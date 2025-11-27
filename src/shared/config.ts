import * as fs from 'fs';
import * as path from 'path';
import { AppConfig, DEFAULT_CONFIG } from './types.js';

const CONFIG_FILENAME = 'ntb-config.json';

/**
 * Get the path to the config file.
 * Uses the current working directory by default, or a custom base path.
 */
export function getConfigPath(basePath?: string): string {
  const base = basePath || process.cwd();
  return path.join(base, CONFIG_FILENAME);
}

/**
 * Load configuration from file, merging with defaults for any missing values.
 */
export function loadConfig(basePath?: string): AppConfig {
  const configPath = getConfigPath(basePath);

  try {
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const loadedConfig = JSON.parse(fileContent) as Partial<AppConfig>;

      // Deep merge with defaults to handle missing nested properties
      return deepMerge(DEFAULT_CONFIG, loadedConfig);
    }
  } catch (error) {
    console.warn(`Warning: Could not load config from ${configPath}:`, error);
  }

  return { ...DEFAULT_CONFIG };
}

/**
 * Save configuration to file.
 */
export function saveConfig(config: AppConfig, basePath?: string): void {
  const configPath = getConfigPath(basePath);

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Error saving config to ${configPath}:`, error);
    throw error;
  }
}

/**
 * Deep merge two objects, with source values overriding target values.
 */
function deepMerge(target: AppConfig, source: Partial<AppConfig>): AppConfig {
  const result = { ...target };

  // Merge paths
  if (source.paths) {
    result.paths = { ...target.paths, ...source.paths };
  }

  // Merge collection
  if (source.collection) {
    result.collection = { ...target.collection, ...source.collection };
  }

  // Merge training
  if (source.training) {
    result.training = { ...target.training, ...source.training };
  }

  // Merge inference
  if (source.inference) {
    result.inference = { ...target.inference, ...source.inference };
  }

  return result;
}

/**
 * Resolve a path relative to the config's base directory.
 * If the path is already absolute, return it as-is.
 */
export function resolvePath(configPath: string, basePath?: string): string {
  if (path.isAbsolute(configPath)) {
    return configPath;
  }
  const base = basePath || process.cwd();
  return path.resolve(base, configPath);
}

/**
 * Get resolved paths from config.
 */
export function getResolvedPaths(
  config: AppConfig,
  basePath?: string
): {
  trainingData: string;
  cleanedData: string;
  models: string;
} {
  return {
    trainingData: resolvePath(config.paths.trainingData, basePath),
    cleanedData: resolvePath(config.paths.cleanedData, basePath),
    models: resolvePath(config.paths.models, basePath),
  };
}
