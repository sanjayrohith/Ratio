/**
 * Architectural layer taxonomy and path matchers.
 */

export type LayerCategory =
  | 'api'
  | 'db'
  | 'auth'
  | 'ui'
  | 'core'
  | 'config'
  | 'worker';

export const LAYER_CATEGORIES: LayerCategory[] = [
  'api',
  'db',
  'auth',
  'ui',
  'core',
  'config',
  'worker',
];

export interface LayerRuleDefinition {
  category: LayerCategory;
  patterns: string[];
  description: string;
}

/**
 * Standard project pattern definitions across full-stack frameworks
 * (Express, Next.js, Django, FastAPI, NestJS, Rails, Go, Rust).
 */
export const DEFAULT_LAYER_RULES: LayerRuleDefinition[] = [
  {
    category: 'auth',
    patterns: [
      '**/auth/**',
      '**/jwt/**',
      '**/session/**',
      '**/sessions/**',
      '**/guards/**',
      '**/permissions/**',
      '**/middleware/auth*',
      '**/*auth*middleware*',
      '**/passport/**',
      '**/strategies/**',
    ],
    description: 'Authentication, authorization, tokens, session management, and auth guards',
  },
  {
    category: 'db',
    patterns: [
      '**/db/**',
      '**/models/**',
      '**/migrations/**',
      '**/schema/**',
      '**/schemas/**',
      '**/entities/**',
      '**/repositories/**',
      '**/*.prisma',
      '**/prisma/**',
      '**/drizzle/**',
      '**/alembic/**',
      '**/*.sql',
    ],
    description: 'Database models, schemas, migrations, ORM entities, and database access',
  },
  {
    category: 'api',
    patterns: [
      '**/api/**',
      '**/routes/**',
      '**/controllers/**',
      '**/handlers/**',
      '**/endpoints/**',
      '**/routers/**',
      '**/resolvers/**',
      '**/views.py',
      '**/app/api/**',
    ],
    description: 'API routing, HTTP/gRPC handlers, controllers, endpoints, and GraphQL resolvers',
  },
  {
    category: 'ui',
    patterns: [
      '**/components/**',
      '**/views/**',
      '**/pages/**',
      '**/screens/**',
      '**/templates/**',
      '**/ui/**',
      '**/*.component.*',
      '**/*.view.*',
      '**/*.css',
      '**/*.scss',
      '**/*.tsx',
      '**/*.jsx',
    ],
    description: 'User interface components, pages, styling, templates, and frontend views',
  },
  {
    category: 'worker',
    patterns: [
      '**/workers/**',
      '**/jobs/**',
      '**/queues/**',
      '**/tasks/**',
      '**/celery.py',
      '**/cron/**',
      '**/schedulers/**',
      '**/*worker*',
    ],
    description: 'Background workers, asynchronous queue processors, jobs, and cron tasks',
  },
  {
    category: 'config',
    patterns: [
      '**/config/**',
      '**/configs/**',
      '**/*.config.*',
      '**/settings.py',
      '**/conf/**',
      '**/.env*',
      '**/docker-compose*',
      '**/Dockerfile*',
    ],
    description: 'Configuration, environment definitions, container manifests, and application settings',
  },
  {
    category: 'core',
    patterns: [
      '**/core/**',
      '**/services/**',
      '**/domain/**',
      '**/usecases/**',
      '**/lib/**',
      '**/utils/**',
      '**/common/**',
      '**/helpers/**',
    ],
    description: 'Core domain business logic, services, shared utilities, and foundational libraries',
  },
];

/**
 * Converts a simple glob pattern (with * and **) into a RegExp.
 */
export function globToRegex(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/').toLowerCase();
  let regexString = normalized
    .replace(/\./g, '\\.')
    .replace(/\*\*\//g, '.*(?:^|/)')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');

  return new RegExp(regexString, 'i');
}

/**
 * Architectural layer tagger that maps file paths to architectural layer classifications.
 */
export class LayerTagger {
  private compiledRules: Array<{ category: LayerCategory; regexes: RegExp[] }>;

  constructor(rules: LayerRuleDefinition[] = DEFAULT_LAYER_RULES) {
    this.compiledRules = rules.map((rule) => ({
      category: rule.category,
      regexes: rule.patterns.map((pat) => globToRegex(pat)),
    }));
  }

  /**
   * Tags a file path with all matching layer categories.
   */
  public tagPath(filePath: string): LayerCategory[] {
    const normalized = filePath.replace(/\\/g, '/');
    const matched = new Set<LayerCategory>();

    for (const rule of this.compiledRules) {
      for (const rx of rule.regexes) {
        if (rx.test(normalized)) {
          matched.add(rule.category);
          break;
        }
      }
    }

    return Array.from(matched);
  }

  /**
   * Returns the primary architectural layer for a path, or 'unknown' if no match.
   */
  public classify(filePath: string): LayerCategory | 'unknown' {
    const tags = this.tagPath(filePath);
    return tags.length > 0 ? tags[0] : 'unknown';
  }
}

export const defaultLayerTagger = new LayerTagger();
