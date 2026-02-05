/**
 * ProjectScanner - Smart Project Analysis
 *
 * Scans a project directory to extract information for AGENTS.md generation
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import type {
  ProjectInfo,
  TechStack,
  DirectoryInfo,
  ProjectCommand,
  ImportantFile,
} from './types.js';

/**
 * Project type detection patterns
 */
const PROJECT_PATTERNS: Array<{
  name: string;
  files: string[];
  techStack: Partial<TechStack>;
}> = [
  {
    name: 'Node.js',
    files: ['package.json'],
    techStack: { language: 'JavaScript/TypeScript', packageManager: 'npm' },
  },
  {
    name: 'Python',
    files: ['pyproject.toml', 'setup.py', 'requirements.txt'],
    techStack: { language: 'Python', packageManager: 'pip' },
  },
  {
    name: 'Rust',
    files: ['Cargo.toml'],
    techStack: { language: 'Rust', packageManager: 'cargo' },
  },
  {
    name: 'Go',
    files: ['go.mod'],
    techStack: { language: 'Go', packageManager: 'go modules' },
  },
  {
    name: 'Java Maven',
    files: ['pom.xml'],
    techStack: { language: 'Java', buildTool: 'Maven' },
  },
  {
    name: 'Java Gradle',
    files: ['build.gradle', 'build.gradle.kts'],
    techStack: { language: 'Java/Kotlin', buildTool: 'Gradle' },
  },
  {
    name: 'Ruby',
    files: ['Gemfile'],
    techStack: { language: 'Ruby', packageManager: 'bundler' },
  },
  {
    name: 'PHP',
    files: ['composer.json'],
    techStack: { language: 'PHP', packageManager: 'composer' },
  },
];

/**
 * Framework detection patterns (for Node.js)
 */
const FRAMEWORK_DETECTION: Record<string, { deps: string[]; name: string }> = {
  react: { deps: ['react', 'react-dom'], name: 'React' },
  nextjs: { deps: ['next'], name: 'Next.js' },
  vue: { deps: ['vue'], name: 'Vue.js' },
  nuxt: { deps: ['nuxt'], name: 'Nuxt' },
  angular: { deps: ['@angular/core'], name: 'Angular' },
  svelte: { deps: ['svelte'], name: 'Svelte' },
  express: { deps: ['express'], name: 'Express' },
  fastify: { deps: ['fastify'], name: 'Fastify' },
  nestjs: { deps: ['@nestjs/core'], name: 'NestJS' },
  tauri: { deps: ['@tauri-apps/api'], name: 'Tauri' },
  electron: { deps: ['electron'], name: 'Electron' },
};

/**
 * Important file patterns
 */
const IMPORTANT_FILE_PATTERNS = [
  { pattern: 'README.md', description: 'Project documentation' },
  { pattern: 'CONTRIBUTING.md', description: 'Contribution guidelines' },
  { pattern: 'CHANGELOG.md', description: 'Version history' },
  { pattern: '.env.example', description: 'Environment variables template' },
  { pattern: 'docker-compose.yml', description: 'Docker composition' },
  { pattern: 'Dockerfile', description: 'Container configuration' },
  { pattern: 'tsconfig.json', description: 'TypeScript configuration' },
  { pattern: '.eslintrc*', description: 'ESLint configuration' },
  { pattern: '.prettierrc*', description: 'Prettier configuration' },
  { pattern: 'jest.config.*', description: 'Jest test configuration' },
  { pattern: 'vitest.config.*', description: 'Vitest configuration' },
];

/**
 * Directories to skip during scanning
 */
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.next',
  '.nuxt',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'vendor',
  '.idea',
  '.vscode',
  'coverage',
]);

/**
 * ProjectScanner class
 */
export class ProjectScanner {
  private workingDir: string;

  constructor(workingDir: string) {
    this.workingDir = workingDir;
  }

  /**
   * Scan the project and extract information
   */
  async scan(): Promise<ProjectInfo> {
    const name = await this.detectProjectName();
    const techStack = await this.detectTechStack();
    const structure = await this.scanStructure();
    const commands = await this.extractCommands();
    const detectedPatterns = await this.detectPatterns();
    const conventions = await this.inferConventions();
    const importantFiles = await this.findImportantFiles();

    return {
      name,
      techStack,
      structure,
      commands,
      detectedPatterns,
      conventions,
      importantFiles,
      rootPath: this.workingDir,
    };
  }

  /**
   * Detect project name
   */
  private async detectProjectName(): Promise<string> {
    // Try package.json
    const packageJsonPath = join(this.workingDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        if (pkg.name) return pkg.name;
      } catch {
        // ignore
      }
    }

    // Try Cargo.toml
    const cargoTomlPath = join(this.workingDir, 'Cargo.toml');
    if (existsSync(cargoTomlPath)) {
      try {
        const content = readFileSync(cargoTomlPath, 'utf-8');
        const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
        if (nameMatch) return nameMatch[1];
      } catch {
        // ignore
      }
    }

    // Try pyproject.toml
    const pyprojectPath = join(this.workingDir, 'pyproject.toml');
    if (existsSync(pyprojectPath)) {
      try {
        const content = readFileSync(pyprojectPath, 'utf-8');
        const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
        if (nameMatch) return nameMatch[1];
      } catch {
        // ignore
      }
    }

    // Fall back to directory name
    return basename(this.workingDir);
  }

  /**
   * Detect tech stack
   */
  private async detectTechStack(): Promise<TechStack> {
    const techStack: TechStack = { language: 'Unknown' };

    // Check each project pattern
    for (const pattern of PROJECT_PATTERNS) {
      for (const file of pattern.files) {
        if (existsSync(join(this.workingDir, file))) {
          Object.assign(techStack, pattern.techStack);
          break;
        }
      }
      if (techStack.language !== 'Unknown') break;
    }

    // Detect framework from package.json dependencies
    const packageJsonPath = join(this.workingDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        for (const [_key, info] of Object.entries(FRAMEWORK_DETECTION)) {
          if (info.deps.some(dep => dep in allDeps)) {
            techStack.framework = info.name;
            break;
          }
        }

        // Detect TypeScript
        if ('typescript' in allDeps) {
          techStack.language = 'TypeScript';
        }

        // Detect test framework
        if ('jest' in allDeps) {
          techStack.testFramework = 'Jest';
        } else if ('vitest' in allDeps) {
          techStack.testFramework = 'Vitest';
        } else if ('mocha' in allDeps) {
          techStack.testFramework = 'Mocha';
        }

        // Detect package manager from lockfiles
        if (existsSync(join(this.workingDir, 'pnpm-lock.yaml'))) {
          techStack.packageManager = 'pnpm';
        } else if (existsSync(join(this.workingDir, 'yarn.lock'))) {
          techStack.packageManager = 'yarn';
        } else if (existsSync(join(this.workingDir, 'bun.lockb'))) {
          techStack.packageManager = 'bun';
        }
      } catch {
        // ignore
      }
    }

    return techStack;
  }

  /**
   * Scan directory structure
   */
  private async scanStructure(maxDepth = 2): Promise<DirectoryInfo[]> {
    const scanDir = (dir: string, relativePath: string, depth: number): DirectoryInfo[] => {
      if (depth > maxDepth) return [];

      const entries: DirectoryInfo[] = [];
      try {
        const items = readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
          if (!item.isDirectory()) continue;
          if (SKIP_DIRECTORIES.has(item.name)) continue;
          if (item.name.startsWith('.')) continue;

          const itemPath = join(relativePath, item.name);
          const fullPath = join(dir, item.name);

          const info: DirectoryInfo = {
            name: item.name,
            path: itemPath,
            description: this.getDirectoryDescription(item.name),
            isKey: this.isKeyDirectory(item.name),
            children: depth < maxDepth ? scanDir(fullPath, itemPath, depth + 1) : undefined,
          };

          entries.push(info);
        }
      } catch {
        // ignore
      }

      return entries;
    };

    return scanDir(this.workingDir, '', 0);
  }

  /**
   * Get description for common directory names
   */
  private getDirectoryDescription(name: string): string {
    const descriptions: Record<string, string> = {
      src: 'Source code',
      lib: 'Library code',
      app: 'Application code',
      apps: 'Application packages',
      packages: 'Monorepo packages',
      components: 'UI components',
      pages: 'Page components',
      views: 'View components',
      routes: 'Route handlers',
      api: 'API endpoints',
      services: 'Service layer',
      utils: 'Utility functions',
      helpers: 'Helper functions',
      hooks: 'React hooks',
      stores: 'State stores',
      types: 'Type definitions',
      models: 'Data models',
      controllers: 'Controllers',
      middleware: 'Middleware',
      tests: 'Test files',
      test: 'Test files',
      __tests__: 'Test files',
      spec: 'Test specifications',
      docs: 'Documentation',
      public: 'Public assets',
      assets: 'Static assets',
      static: 'Static files',
      config: 'Configuration',
      scripts: 'Build/utility scripts',
      bin: 'Executables',
      cmd: 'Command implementations',
      pkg: 'Package implementations',
      internal: 'Internal packages',
    };

    return descriptions[name.toLowerCase()] || '';
  }

  /**
   * Check if directory is a key directory
   */
  private isKeyDirectory(name: string): boolean {
    const keyDirs = new Set([
      'src',
      'lib',
      'app',
      'apps',
      'packages',
      'components',
      'pages',
      'api',
      'services',
      'tests',
      'test',
      'docs',
    ]);

    return keyDirs.has(name.toLowerCase());
  }

  /**
   * Extract commands from config files
   */
  private async extractCommands(): Promise<ProjectCommand[]> {
    const commands: ProjectCommand[] = [];

    // Extract from package.json scripts
    const packageJsonPath = join(this.workingDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        if (pkg.scripts) {
          for (const [name, script] of Object.entries(pkg.scripts)) {
            commands.push({
              command: `npm run ${name}`,
              description: this.inferScriptDescription(name, script as string),
              usage: this.inferScriptUsage(name),
            });
          }
        }
      } catch {
        // ignore
      }
    }

    // Extract from Makefile
    const makefilePath = join(this.workingDir, 'Makefile');
    if (existsSync(makefilePath)) {
      try {
        const content = readFileSync(makefilePath, 'utf-8');
        const targets = content.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/gm);
        if (targets) {
          for (const target of targets) {
            const name = target.replace(':', '');
            if (!name.startsWith('.')) {
              commands.push({
                command: `make ${name}`,
                description: this.inferMakeTargetDescription(name),
                usage: this.inferScriptUsage(name),
              });
            }
          }
        }
      } catch {
        // ignore
      }
    }

    return commands;
  }

  /**
   * Infer script description from name and content
   */
  private inferScriptDescription(name: string, _script: string): string {
    const descriptions: Record<string, string> = {
      dev: 'Start development server',
      start: 'Start the application',
      build: 'Build for production',
      test: 'Run test suite',
      lint: 'Run linter',
      format: 'Format code',
      typecheck: 'Run type checking',
      'type-check': 'Run type checking',
      clean: 'Clean build artifacts',
      deploy: 'Deploy application',
      preview: 'Preview production build',
    };

    return descriptions[name] || `Run ${name}`;
  }

  /**
   * Infer Makefile target description
   */
  private inferMakeTargetDescription(name: string): string {
    return this.inferScriptDescription(name, '');
  }

  /**
   * Infer script usage context
   */
  private inferScriptUsage(name: string): string {
    if (['dev', 'start', 'serve'].includes(name)) return 'development';
    if (['test', 'e2e', 'spec'].some(t => name.includes(t))) return 'testing';
    if (['build', 'deploy', 'release'].some(t => name.includes(t))) return 'deployment';
    return 'utility';
  }

  /**
   * Detect project patterns
   */
  private async detectPatterns(): Promise<string[]> {
    const patterns: string[] = [];

    // Check for monorepo
    if (
      existsSync(join(this.workingDir, 'packages')) ||
      existsSync(join(this.workingDir, 'apps')) ||
      existsSync(join(this.workingDir, 'lerna.json')) ||
      existsSync(join(this.workingDir, 'pnpm-workspace.yaml'))
    ) {
      patterns.push('Monorepo structure');
    }

    // Check for src directory (standard project layout)
    if (existsSync(join(this.workingDir, 'src'))) {
      patterns.push('Standard src/ layout');
    }

    // Check for component-based architecture
    if (
      existsSync(join(this.workingDir, 'src', 'components')) ||
      existsSync(join(this.workingDir, 'components'))
    ) {
      patterns.push('Component-based architecture');
    }

    // Check for API routes
    if (
      existsSync(join(this.workingDir, 'src', 'api')) ||
      existsSync(join(this.workingDir, 'api')) ||
      existsSync(join(this.workingDir, 'pages', 'api'))
    ) {
      patterns.push('API routes');
    }

    // Check for service layer
    if (
      existsSync(join(this.workingDir, 'src', 'services')) ||
      existsSync(join(this.workingDir, 'services'))
    ) {
      patterns.push('Service-oriented architecture');
    }

    // Check for state management
    if (
      existsSync(join(this.workingDir, 'src', 'stores')) ||
      existsSync(join(this.workingDir, 'src', 'store')) ||
      existsSync(join(this.workingDir, 'stores'))
    ) {
      patterns.push('Centralized state management');
    }

    return patterns;
  }

  /**
   * Infer coding conventions
   */
  private async inferConventions(): Promise<string[]> {
    const conventions: string[] = [];

    // Check for TypeScript
    if (existsSync(join(this.workingDir, 'tsconfig.json'))) {
      conventions.push('TypeScript strict mode');
    }

    // Check for ESLint
    const eslintFiles = ['eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js'];
    if (eslintFiles.some(f => existsSync(join(this.workingDir, f)))) {
      conventions.push('ESLint for code quality');
    }

    // Check for Prettier
    const prettierFiles = ['.prettierrc', '.prettierrc.json', 'prettier.config.js'];
    if (prettierFiles.some(f => existsSync(join(this.workingDir, f)))) {
      conventions.push('Prettier for code formatting');
    }

    // Check for Husky/lint-staged
    if (existsSync(join(this.workingDir, '.husky'))) {
      conventions.push('Git hooks with Husky');
    }

    return conventions;
  }

  /**
   * Find important files
   */
  private async findImportantFiles(): Promise<ImportantFile[]> {
    const files: ImportantFile[] = [];

    for (const pattern of IMPORTANT_FILE_PATTERNS) {
      if (pattern.pattern.includes('*')) {
        // Glob pattern - check directory
        const baseName = pattern.pattern.replace('*', '');
        try {
          const entries = readdirSync(this.workingDir);
          for (const entry of entries) {
            if (entry.startsWith(baseName) || entry.includes(baseName.replace('.', ''))) {
              files.push({
                path: entry,
                description: pattern.description,
              });
              break; // Only add first match
            }
          }
        } catch {
          // ignore
        }
      } else {
        // Exact match
        if (existsSync(join(this.workingDir, pattern.pattern))) {
          files.push({
            path: pattern.pattern,
            description: pattern.description,
          });
        }
      }
    }

    // Also add main config files
    const configFiles = [
      { path: 'package.json', desc: 'Node.js package configuration' },
      { path: 'Cargo.toml', desc: 'Rust package configuration' },
      { path: 'pyproject.toml', desc: 'Python project configuration' },
      { path: 'go.mod', desc: 'Go module definition' },
    ];

    for (const config of configFiles) {
      if (existsSync(join(this.workingDir, config.path))) {
        if (!files.some(f => f.path === config.path)) {
          files.push({
            path: config.path,
            description: config.desc,
          });
        }
      }
    }

    return files;
  }
}

/**
 * Create a new ProjectScanner instance
 */
export function createProjectScanner(workingDir: string): ProjectScanner {
  return new ProjectScanner(workingDir);
}
