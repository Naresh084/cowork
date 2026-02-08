import { CoworkRemoteClient, type RemoteAuth } from '@/lib/api';

let client: CoworkRemoteClient | null = null;

export function setRemoteClientAuth(auth: RemoteAuth): CoworkRemoteClient {
  if (!client) {
    client = new CoworkRemoteClient(auth);
  } else {
    client.setAuth(auth);
  }
  return client;
}

export function getRemoteClient(): CoworkRemoteClient {
  if (!client) {
    throw new Error('Remote client is not initialized.');
  }
  return client;
}

export function clearRemoteClient(): void {
  client = null;
}
