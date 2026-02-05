/**
 * AGENTS.md Types
 *
 * Project context file format and parsing types
 */

/**
 * Parsed AGENTS.md configuration
 */
export interface AgentsMdConfig {
  /** Project name */
  projectName: string;

  /** Project overview/description */
  overview: string;

  /** Technology stack */
  techStack: TechStack;

  /** Directory structure (as formatted string) */
  directoryStructure: string;

  /** Available commands */
  commands: ProjectCommand[];

  /** Coding conventions */
  conventions: CodingConventions;

  /** Agent instructions */
  instructions: AgentInstructions;

  /** Important files to be aware of */
  importantFiles: ImportantFile[];

  /** Environment variables */
  environmentVars: string[];

  /** Additional user-provided context */
  additionalContext: string;

  /** Raw file content (for reference) */
  rawContent?: string;

  /** File path */
  filePath?: string;

  /** Last modified timestamp */
  lastModified?: string;
}

/**
 * Technology stack information
 */
export interface TechStack {
  /** Primary language */
  language: string;

  /** Framework (if any) */
  framework?: string;

  /** Build tool */
  buildTool?: string;

  /** Package manager */
  packageManager?: string;

  /** Test framework */
  testFramework?: string;

  /** Additional technologies */
  additional?: Record<string, string>;
}

/**
 * Project command (script)
 */
export interface ProjectCommand {
  /** Command to run */
  command: string;

  /** Description of what it does */
  description: string;

  /** When to use it */
  usage: 'development' | 'testing' | 'deployment' | 'utility' | string;
}

/**
 * Coding conventions
 */
export interface CodingConventions {
  /** Style guide rules */
  styleGuide: string[];

  /** Naming conventions */
  naming: NamingConventions;

  /** Detected patterns */
  patterns: string[];
}

/**
 * Naming conventions
 */
export interface NamingConventions {
  /** File naming */
  files?: string;

  /** Function naming */
  functions?: string;

  /** Variable naming */
  variables?: string;

  /** Component naming */
  components?: string;

  /** Class naming */
  classes?: string;

  /** Constant naming */
  constants?: string;
}

/**
 * Agent instructions
 */
export interface AgentInstructions {
  /** Things to do */
  do: string[];

  /** Things to avoid */
  dont: string[];
}

/**
 * Important file reference
 */
export interface ImportantFile {
  /** File path */
  path: string;

  /** Description */
  description: string;
}

/**
 * Project information from scanning
 */
export interface ProjectInfo {
  /** Project name */
  name: string;

  /** Detected tech stack */
  techStack: TechStack;

  /** Directory structure */
  structure: DirectoryInfo[];

  /** Extracted commands */
  commands: ProjectCommand[];

  /** Detected patterns */
  detectedPatterns: string[];

  /** Inferred conventions */
  conventions: string[];

  /** Important files found */
  importantFiles: ImportantFile[];

  /** Project root path */
  rootPath: string;
}

/**
 * Directory information
 */
export interface DirectoryInfo {
  /** Directory name */
  name: string;

  /** Path relative to root */
  path: string;

  /** Description/purpose */
  description?: string;

  /** Is it a key directory */
  isKey: boolean;

  /** Child directories */
  children?: DirectoryInfo[];
}

/**
 * AGENTS.md validation result
 */
export interface AgentsMdValidation {
  /** Is the file valid */
  valid: boolean;

  /** Validation errors */
  errors: ValidationError[];

  /** Validation warnings */
  warnings: ValidationWarning[];

  /** Sections found */
  sectionsFound: string[];

  /** Missing recommended sections */
  missingSections: string[];
}

/**
 * Validation error
 */
export interface ValidationError {
  /** Section with error */
  section: string;

  /** Error message */
  message: string;

  /** Line number (if applicable) */
  line?: number;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  /** Section with warning */
  section: string;

  /** Warning message */
  message: string;

  /** Suggestion */
  suggestion?: string;
}

/**
 * Section names in AGENTS.md
 */
export const AGENTS_MD_SECTIONS = {
  PROJECT_OVERVIEW: '## Project Overview',
  TECH_STACK: '## Tech Stack',
  DIRECTORY_STRUCTURE: '## Directory Structure',
  COMMANDS: '## Available Commands',
  CONVENTIONS: '## Coding Conventions',
  INSTRUCTIONS: '## Agent Instructions',
  IMPORTANT_FILES: '## Important Files',
  ENVIRONMENT: '## Environment Setup',
  ADDITIONAL: '## Additional Context',
} as const;

/**
 * Required sections for valid AGENTS.md
 */
export const REQUIRED_SECTIONS = [
  AGENTS_MD_SECTIONS.PROJECT_OVERVIEW,
  AGENTS_MD_SECTIONS.TECH_STACK,
];

/**
 * Recommended sections
 */
export const RECOMMENDED_SECTIONS = [
  AGENTS_MD_SECTIONS.COMMANDS,
  AGENTS_MD_SECTIONS.CONVENTIONS,
  AGENTS_MD_SECTIONS.INSTRUCTIONS,
];

/**
 * Project type detection patterns
 */
export interface ProjectTypePattern {
  /** Pattern name */
  name: string;

  /** Files to check for */
  files: string[];

  /** Directories to check for */
  directories?: string[];

  /** Tech stack inference */
  techStack: Partial<TechStack>;

  /** Additional patterns to apply */
  patterns?: string[];
}

/**
 * Known project type patterns
 */
export const PROJECT_TYPE_PATTERNS: ProjectTypePattern[] = [
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
    name: 'PHP Composer',
    files: ['composer.json'],
    techStack: { language: 'PHP', packageManager: 'composer' },
  },
  {
    name: '.NET',
    files: ['*.csproj', '*.sln'],
    techStack: { language: 'C#', buildTool: 'dotnet' },
  },
];

/**
 * Framework detection patterns
 */
export const FRAMEWORK_PATTERNS: Record<string, { dependencies: string[]; framework: string }> = {
  react: { dependencies: ['react', 'react-dom'], framework: 'React' },
  nextjs: { dependencies: ['next'], framework: 'Next.js' },
  vue: { dependencies: ['vue'], framework: 'Vue.js' },
  nuxt: { dependencies: ['nuxt'], framework: 'Nuxt' },
  angular: { dependencies: ['@angular/core'], framework: 'Angular' },
  svelte: { dependencies: ['svelte'], framework: 'Svelte' },
  express: { dependencies: ['express'], framework: 'Express' },
  fastify: { dependencies: ['fastify'], framework: 'Fastify' },
  nestjs: { dependencies: ['@nestjs/core'], framework: 'NestJS' },
  django: { dependencies: ['django'], framework: 'Django' },
  flask: { dependencies: ['flask'], framework: 'Flask' },
  fastapi: { dependencies: ['fastapi'], framework: 'FastAPI' },
  rails: { dependencies: ['rails'], framework: 'Ruby on Rails' },
  laravel: { dependencies: ['laravel/framework'], framework: 'Laravel' },
  tauri: { dependencies: ['@tauri-apps/api'], framework: 'Tauri' },
  electron: { dependencies: ['electron'], framework: 'Electron' },
};
