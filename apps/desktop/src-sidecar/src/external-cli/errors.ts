export type ExternalCliErrorCode =
  | 'CLI_NOT_INSTALLED'
  | 'CLI_DISABLED_IN_SETTINGS'
  | 'CLI_AUTH_REQUIRED'
  | 'CLI_PROVIDER_BLOCKED'
  | 'CLI_PERMISSION_BYPASS_BLOCKED'
  | 'CLI_PROTOCOL_ERROR'
  | 'CLI_RUN_INTERRUPTED';

export class ExternalCliError extends Error {
  readonly code: ExternalCliErrorCode;

  constructor(code: ExternalCliErrorCode, message: string) {
    super(message);
    this.name = 'ExternalCliError';
    this.code = code;
  }
}

export function toExternalCliError(input: unknown, fallbackCode: ExternalCliErrorCode): ExternalCliError {
  if (input instanceof ExternalCliError) {
    return input;
  }
  const message = input instanceof Error ? input.message : String(input);
  return new ExternalCliError(fallbackCode, message);
}
