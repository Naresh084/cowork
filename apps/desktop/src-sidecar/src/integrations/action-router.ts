import type {
  IntegrationActionRequest,
  IntegrationActionResult,
  PlatformType,
} from './types.js';
import type { BaseAdapter } from './adapters/base-adapter.js';
import { INTEGRATION_PLATFORM_METADATA } from './types.js';

function isPlatformType(value: string): value is PlatformType {
  return value in INTEGRATION_PLATFORM_METADATA;
}

export class IntegrationActionRouter {
  constructor(
    private readonly getAdapter: (platform: PlatformType) => BaseAdapter | undefined,
  ) {}

  async route(request: IntegrationActionRequest): Promise<IntegrationActionResult> {
    const channel = String(request.channel || '').trim().toLowerCase();
    if (!channel) {
      return {
        success: false,
        channel: '',
        action: request.action,
        reason: 'channel is required',
      };
    }

    if (!isPlatformType(channel)) {
      return {
        success: false,
        channel,
        action: request.action,
        unsupported: true,
        reason: `Unknown channel "${channel}"`,
      };
    }

    const adapter = this.getAdapter(channel);
    if (!adapter || !adapter.getStatus().connected) {
      return {
        success: false,
        channel,
        action: request.action,
        reason: `${channel} integration is not connected`,
      };
    }

    const capabilities = adapter.getCapabilities();
    if (!capabilities[request.action]) {
      return {
        success: false,
        channel,
        action: request.action,
        unsupported: true,
        reason: `${channel} does not support action "${request.action}"`,
        fallbackSuggestion: 'Use action "send" or connect a channel with richer operations.',
      };
    }

    return adapter.performAction(request);
  }
}

