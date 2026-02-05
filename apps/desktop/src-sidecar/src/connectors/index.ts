/**
 * Connectors Module
 *
 * Exports all connector-related services for the sidecar.
 */

export { ConnectorService, connectorService } from './connector-service.js';
export type { CreateConnectorParams } from './connector-service.js';

export { ConnectorManager } from './connector-manager.js';
export type {
  ConnectorCapabilities,
  ConnectorConnectionResult,
} from './connector-manager.js';

export {
  SecretService,
  getSecretService,
} from './secret-service.js';
export type { SecretsStatus } from './secret-service.js';
