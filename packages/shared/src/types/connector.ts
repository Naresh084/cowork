import { z } from 'zod';

// ============================================================================
// Connector Category Types
// ============================================================================

/**
 * Categories for organizing connectors in the UI
 */
export const ConnectorCategorySchema = z.enum([
  'google',        // Google Workspace, Gmail, Calendar, Drive, etc.
  'microsoft',     // Microsoft 365, Teams, Outlook, OneDrive
  'communication', // Slack, Discord
  'productivity',  // Notion, Linear, Todoist
  'developer',     // GitHub, GitLab, Jira, Sentry
  'database',      // PostgreSQL, MySQL, MongoDB, SQLite, Redis
  'ai-search',     // Brave Search, Exa
  'utility',       // Fetch, Memory, Puppeteer, Sequential Thinking
  'custom',        // User-created connectors
]);

export type ConnectorCategory = z.infer<typeof ConnectorCategorySchema>;

// ============================================================================
// Connector Transport Types
// ============================================================================

/**
 * Stdio transport for process-based MCP servers
 * Supports command interpolation with ${VAR} syntax
 */
export const StdioTransportSchema = z.object({
  type: z.literal('stdio'),
  /** Command to execute: 'npx', 'uvx', 'python', 'docker', etc. */
  command: z.string(),
  /** Arguments (supports ${VAR} interpolation from secrets) */
  args: z.array(z.string()),
  /** Working directory for the process */
  cwd: z.string().optional(),
});

export type StdioTransport = z.infer<typeof StdioTransportSchema>;

/**
 * HTTP transport for remote MCP servers
 */
export const HttpTransportSchema = z.object({
  type: z.literal('http'),
  /** Server URL */
  url: z.string(),
  /** Custom headers (supports ${VAR} interpolation) */
  headers: z.record(z.string()).optional(),
});

export type HttpTransport = z.infer<typeof HttpTransportSchema>;

/**
 * Combined transport type
 */
export const ConnectorTransportSchema = z.discriminatedUnion('type', [
  StdioTransportSchema,
  HttpTransportSchema,
]);

export type ConnectorTransport = z.infer<typeof ConnectorTransportSchema>;

// ============================================================================
// Connector Authentication Types
// ============================================================================

/**
 * Definition of a secret/credential required by the connector
 */
export const SecretDefinitionSchema = z.object({
  /** Internal key identifier (e.g., 'SLACK_BOT_TOKEN') */
  key: z.string(),
  /** Override environment variable name if different from key */
  envVar: z.string().optional(),
  /** Human-readable description */
  description: z.string(),
  /** Whether this secret is required */
  required: z.boolean(),
  /** Placeholder text for input field (e.g., 'xoxb-...') */
  placeholder: z.string().optional(),
  /** Regex pattern for validation */
  validation: z.string().optional(),
  /** URL where user can obtain this credential */
  link: z.string().optional(),
});

export type SecretDefinition = z.infer<typeof SecretDefinitionSchema>;

/**
 * No authentication required
 */
export const NoAuthSchema = z.object({
  type: z.literal('none'),
});

export type NoAuth = z.infer<typeof NoAuthSchema>;

/**
 * Environment variable based authentication
 */
export const EnvAuthSchema = z.object({
  type: z.literal('env'),
  /** List of required secrets */
  secrets: z.array(SecretDefinitionSchema),
});

export type EnvAuth = z.infer<typeof EnvAuthSchema>;

/**
 * OAuth providers supported by the system
 */
export const OAuthProviderSchema = z.enum([
  'google',
  'microsoft',
  'github',
  'slack',
  'linear',
  'custom',
]);

export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;

/**
 * OAuth flow types
 */
export const OAuthFlowTypeSchema = z.enum([
  'authorization_code',
  'device_code',
]);

export type OAuthFlowType = z.infer<typeof OAuthFlowTypeSchema>;

/**
 * OAuth based authentication
 */
export const OAuthAuthSchema = z.object({
  type: z.literal('oauth'),
  /** OAuth provider */
  provider: OAuthProviderSchema,
  /** OAuth flow type */
  flow: OAuthFlowTypeSchema,
  /** Required OAuth scopes */
  scopes: z.array(z.string()),
  /** Custom authorization URL (for 'custom' provider) */
  authorizationUrl: z.string().optional(),
  /** Custom token URL (for 'custom' provider) */
  tokenUrl: z.string().optional(),
  /** Additional secrets needed (e.g., client credentials for custom) */
  secrets: z.array(SecretDefinitionSchema).optional(),
});

export type OAuthAuth = z.infer<typeof OAuthAuthSchema>;

/**
 * Combined authentication type
 */
export const ConnectorAuthSchema = z.discriminatedUnion('type', [
  NoAuthSchema,
  EnvAuthSchema,
  OAuthAuthSchema,
]);

export type ConnectorAuth = z.infer<typeof ConnectorAuthSchema>;

// ============================================================================
// Connector Source Types
// ============================================================================

/**
 * Source types for connectors
 */
export const ConnectorSourceTypeSchema = z.enum([
  'bundled',   // Shipped with app (read-only)
  'managed',   // Installed from marketplace (in ~/.geminicowork/connectors/)
  'workspace', // Project-local connectors
]);

export type ConnectorSourceType = z.infer<typeof ConnectorSourceTypeSchema>;

/**
 * Source information for a connector
 */
export const ConnectorSourceSchema = z.object({
  /** Source type */
  type: ConnectorSourceTypeSchema,
  /** Path to connector directory */
  path: z.string(),
  /** Priority for deduplication (bundled=100, managed=50, workspace=10) */
  priority: z.number(),
});

export type ConnectorSource = z.infer<typeof ConnectorSourceSchema>;

// ============================================================================
// Connector Requirements Types
// ============================================================================

/**
 * Runtime requirements for the connector
 */
export const ConnectorRequirementsSchema = z.object({
  /** Runtime environment */
  runtime: z.enum(['node', 'python', 'docker']).optional(),
  /** Required binaries in PATH */
  bins: z.array(z.string()).optional(),
});

export type ConnectorRequirements = z.infer<typeof ConnectorRequirementsSchema>;

/**
 * Documentation links for the connector
 */
export const ConnectorDocumentationSchema = z.object({
  /** Setup guide URL */
  setup: z.string().optional(),
  /** Project homepage URL */
  homepage: z.string().optional(),
});

export type ConnectorDocumentation = z.infer<typeof ConnectorDocumentationSchema>;

// ============================================================================
// Connector Manifest Types (connector.json schema)
// ============================================================================

/**
 * Complete connector manifest as stored in connector.json
 */
export const ConnectorManifestSchema = z.object({
  // Identity
  /** Unique identifier (e.g., 'google-workspace', 'slack') */
  id: z.string(),
  /** Machine name (kebab-case) */
  name: z.string(),
  /** Human-readable display name */
  displayName: z.string(),
  /** Description of connector capabilities */
  description: z.string(),
  /** Semantic version */
  version: z.string(),
  /** Lucide icon name (e.g., 'Mail', 'MessageSquare') */
  icon: z.string(),
  /** Category for UI organization */
  category: ConnectorCategorySchema,
  /** Searchable tags */
  tags: z.array(z.string()),

  // Transport configuration
  /** How to connect to the MCP server */
  transport: ConnectorTransportSchema,

  // Authentication
  /** Authentication requirements */
  auth: ConnectorAuthSchema,

  // Requirements
  /** Runtime requirements */
  requirements: ConnectorRequirementsSchema.optional(),

  // Documentation
  /** Documentation links */
  documentation: ConnectorDocumentationSchema.optional(),

  // Source (added at runtime during discovery)
  /** Source information (populated at runtime) */
  source: ConnectorSourceSchema,
});

export type ConnectorManifest = z.infer<typeof ConnectorManifestSchema>;

// ============================================================================
// MCP Tool/Resource/Prompt Types (for discovered capabilities)
// ============================================================================

/**
 * MCP Tool discovered from a connected connector
 */
export const MCPToolSchema = z.object({
  /** Tool name */
  name: z.string(),
  /** Tool description */
  description: z.string(),
  /** JSON Schema for tool input */
  inputSchema: z.record(z.unknown()),
  /** Connector that provides this tool */
  connectorId: z.string(),
});

export type MCPTool = z.infer<typeof MCPToolSchema>;

/**
 * MCP Resource discovered from a connected connector
 */
export const MCPResourceSchema = z.object({
  /** Resource URI */
  uri: z.string(),
  /** Resource name */
  name: z.string(),
  /** Resource description */
  description: z.string().optional(),
  /** MIME type */
  mimeType: z.string().optional(),
  /** Connector that provides this resource */
  connectorId: z.string(),
});

export type MCPResource = z.infer<typeof MCPResourceSchema>;

/**
 * MCP Prompt discovered from a connected connector
 */
export const MCPPromptSchema = z.object({
  /** Prompt name */
  name: z.string(),
  /** Prompt description */
  description: z.string().optional(),
  /** Prompt arguments */
  arguments: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    required: z.boolean().optional(),
  })).optional(),
  /** Connector that provides this prompt */
  connectorId: z.string(),
});

export type MCPPrompt = z.infer<typeof MCPPromptSchema>;

// ============================================================================
// Connector Status Types
// ============================================================================

/**
 * Runtime status of a connector
 */
export const ConnectorStatusSchema = z.enum([
  'available',     // In marketplace, not installed
  'installed',     // Installed but not configured (missing secrets)
  'configured',    // Secrets provided, ready to connect
  'connecting',    // Connection in progress
  'connected',     // Active and ready to use
  'reconnecting',  // Lost connection, retrying
  'error',         // Connection failed
  'disabled',      // User disabled
]);

export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;

// ============================================================================
// Connector Runtime State Types
// ============================================================================

/**
 * OAuth state for a connector
 */
export const ConnectorOAuthStateSchema = z.object({
  /** Whether OAuth is authenticated */
  authenticated: z.boolean(),
  /** Token expiration timestamp */
  expiresAt: z.number().optional(),
  /** Whether refresh token is available */
  refreshToken: z.boolean().optional(),
});

export type ConnectorOAuthState = z.infer<typeof ConnectorOAuthStateSchema>;

/**
 * Runtime state of a connector
 */
export const ConnectorStateSchema = z.object({
  /** Connector ID */
  id: z.string(),
  /** Full connector manifest */
  manifest: ConnectorManifestSchema,
  /** Current status */
  status: ConnectorStatusSchema,
  /** Current error message */
  error: z.string().optional(),
  /** Last error message (preserved after recovery) */
  lastError: z.string().optional(),
  /** Retry count for reconnection */
  retryCount: z.number().optional(),

  // Discovered capabilities (populated after connect)
  /** Tools provided by this connector */
  tools: z.array(MCPToolSchema),
  /** Resources provided by this connector */
  resources: z.array(MCPResourceSchema).optional(),
  /** Prompts provided by this connector */
  prompts: z.array(MCPPromptSchema).optional(),

  // Timestamps
  /** When connector was installed */
  installedAt: z.number().optional(),
  /** When secrets were configured */
  configuredAt: z.number().optional(),
  /** When connector was connected */
  connectedAt: z.number().optional(),
  /** When last error occurred */
  lastErrorAt: z.number().optional(),

  // OAuth state
  /** OAuth authentication state */
  oauth: ConnectorOAuthStateSchema.optional(),
});

export type ConnectorState = z.infer<typeof ConnectorStateSchema>;

// ============================================================================
// Installed Connector Configuration Types (for persistence)
// ============================================================================

/**
 * Persisted configuration for an installed connector
 * Stored in settings, not in the connector directory
 */
export const InstalledConnectorConfigSchema = z.object({
  /** Connector ID (managed:{name} format) */
  id: z.string(),
  /** Connector name */
  name: z.string(),
  /** Whether connector is enabled */
  enabled: z.boolean(),
  /** Installation timestamp */
  installedAt: z.number(),
  /** Source type (managed or workspace) */
  source: z.enum(['managed', 'workspace']),
  /** Whether secrets have been configured */
  secretsConfigured: z.boolean(),
  /** Whether OAuth has been configured (for OAuth connectors) */
  oauthConfigured: z.boolean().optional(),
});

export type InstalledConnectorConfig = z.infer<typeof InstalledConnectorConfigSchema>;

// ============================================================================
// Connector Settings Types
// ============================================================================

/**
 * Global connector settings
 */
export const ConnectorsSettingsSchema = z.object({
  /** Directory for managed connectors */
  managedDir: z.string(),
  /** Additional workspace connector directories */
  workspaceDirs: z.array(z.string()),
  /** Auto-connect enabled connectors on startup */
  autoConnect: z.boolean(),
  /** Show connectors with unmet requirements */
  showUnavailable: z.boolean(),
  /** Reconnect timeout in milliseconds */
  reconnectTimeoutMs: z.number(),
  /** Maximum reconnect attempts */
  maxReconnectAttempts: z.number(),
});

export type ConnectorsSettings = z.infer<typeof ConnectorsSettingsSchema>;

// ============================================================================
// OAuth Flow Types
// ============================================================================

/**
 * Result of starting an OAuth flow
 */
export const OAuthFlowResultSchema = z.object({
  /** Flow type */
  type: z.enum(['browser', 'device_code']),
  /** Authorization URL (for browser flow) */
  url: z.string().optional(),
  /** Device code (for device code flow) */
  deviceCode: z.string().optional(),
  /** User-facing code to enter (for device code flow) */
  userCode: z.string().optional(),
  /** Verification URL (for device code flow) */
  verificationUrl: z.string().optional(),
  /** Polling interval in seconds (for device code flow) */
  interval: z.number().optional(),
  /** Expiration in seconds */
  expiresIn: z.number().optional(),
});

export type OAuthFlowResult = z.infer<typeof OAuthFlowResultSchema>;

// ============================================================================
// Connector Eligibility Types
// ============================================================================

/**
 * Eligibility check result for a connector
 */
export const ConnectorEligibilitySchema = z.object({
  /** Overall eligibility status */
  eligible: z.boolean(),
  /** Missing required binaries */
  missingBins: z.array(z.string()),
  /** Human-readable messages */
  messages: z.array(z.string()),
});

export type ConnectorEligibility = z.infer<typeof ConnectorEligibilitySchema>;

// ============================================================================
// Connector Discovery Result Types
// ============================================================================

/**
 * Result of connector discovery
 */
export const ConnectorDiscoveryResultSchema = z.object({
  /** Discovered connectors */
  connectors: z.array(ConnectorManifestSchema),
  /** Discovery errors (non-fatal) */
  errors: z.array(z.object({
    path: z.string(),
    error: z.string(),
  })).optional(),
});

export type ConnectorDiscoveryResult = z.infer<typeof ConnectorDiscoveryResultSchema>;

// ============================================================================
// Connector Connection Result Types
// ============================================================================

/**
 * Result of connecting to a connector
 */
export const ConnectorConnectionResultSchema = z.object({
  /** Connector ID */
  connectorId: z.string(),
  /** Whether connection succeeded */
  success: z.boolean(),
  /** Error message if failed */
  error: z.string().optional(),
  /** Discovered tools */
  tools: z.array(MCPToolSchema).optional(),
  /** Discovered resources */
  resources: z.array(MCPResourceSchema).optional(),
  /** Discovered prompts */
  prompts: z.array(MCPPromptSchema).optional(),
});

export type ConnectorConnectionResult = z.infer<typeof ConnectorConnectionResultSchema>;

// ============================================================================
// MCP App Types (for ui:// resources - interactive UI components)
// ============================================================================

/**
 * MCP App discovered from a connected connector
 * Apps are special resources with ui:// URI scheme that provide
 * interactive HTML interfaces that can call MCP tools.
 */
export const MCPAppSchema = z.object({
  /** App URI (ui://app-name) */
  uri: z.string(),
  /** App display name */
  name: z.string(),
  /** App description */
  description: z.string().optional(),
  /** MIME type (typically text/html) */
  mimeType: z.string().optional(),
  /** Connector that provides this app */
  connectorId: z.string(),
});

export type MCPApp = z.infer<typeof MCPAppSchema>;
