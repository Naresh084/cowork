# Remote Mesh + Mobile Access Roadmap

Last updated: February 8, 2026

## 1. Recommended Tunnel Strategy

Primary recommendation: **Tailscale**

- Best fit for device-to-device secure mesh and low-friction remote access.
- Supports private access (`tailscale serve`) and public HTTPS publishing (`tailscale funnel`) without opening inbound ports.
- Works well for desktop-hosted local services exposed to mobile clients over LTE/5G.

Fallback recommendation: **Cloudflare Tunnel**

- Strong alternative when users already run Cloudflare Zero Trust.
- Outbound connector model also avoids inbound port forwarding.

Decision summary:

- Default mode in product: `tailscale`
- Secondary mode: `cloudflare`
- Advanced mode: `custom` (user-managed secure tunnel endpoint)

## 2. Source Links (Primary Documentation)

- Tailscale Serve: <https://tailscale.com/kb/1242/tailscale-serve>
- Tailscale Funnel: <https://tailscale.com/kb/1223/tailscale-funnel>
- Funnel examples: <https://tailscale.com/kb/1247/funnel-examples>
- Cloudflare Tunnel architecture: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/>
- Cloudflare quick tunnel: <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/>
- ZeroTier docs (alternative mesh option): <https://docs.zerotier.com/>
- NetBird docs (alternative mesh option): <https://docs.netbird.io/>

## 3. Implemented in This Repo

### Sidecar gateway

- New remote access service: `apps/desktop/src-sidecar/src/remote-access/service.ts`
- Local HTTP+WS gateway with:
  - `/v1/pair` QR pairing exchange
  - `/v1/sessions`, `/v1/sessions/:id`, `/v1/sessions/:id/messages`
  - `/v1/sessions/:id/permissions`, `/v1/sessions/:id/questions`, `/v1/sessions/:id/stop`
  - `/v1/cron/jobs` + pause/resume/run
  - `/v1/workflow/scheduled` + pause/resume/run
  - `/v1/ws` event stream bridge for live updates
- Secure device token issuance + revocation + expiry.

### Tauri commands

- New command module: `apps/desktop/src-tauri/src/commands/remote_access.rs`
- Added commands:
  - `remote_access_get_status`
  - `remote_access_enable`
  - `remote_access_disable`
  - `remote_access_generate_qr`
  - `remote_access_list_devices`
  - `remote_access_revoke_device`
  - `remote_access_set_public_base_url`
  - `remote_access_set_tunnel_mode`
  - `remote_access_refresh_tunnel`
  - `remote_access_install_tunnel_binary`
  - `remote_access_authenticate_tunnel`
  - `remote_access_start_tunnel`
  - `remote_access_stop_tunnel`

### Desktop UI

- New settings panel: `apps/desktop/src/components/settings/RemoteAccessSettings.tsx`
- Features:
  - tunnel mode selection
  - endpoint management
  - enable/disable controls
  - tunnel health refresh (dependency/auth/runtime)
  - in-app tunnel dependency installation (platform/package-manager dependent)
  - in-app tunnel authentication (for modes that require it)
  - managed tunnel start/stop controls from settings
  - pairing QR generation
  - paired device list + revoke
  - fallback tunnel command hints

### Mobile app scaffold

- New app workspace: `apps/mobile`
- Includes:
  - QR-only onboarding flow
  - chat tab (streaming + attachments)
  - sessions/history tab
  - schedules tab (view/pause/resume/run only)
  - settings/logout tab
  - websocket event consumption for live chat updates

## 4. Security Model

- Pairing QR is short-lived and one-time use.
- Mobile receives a device token after successful pairing.
- All mobile API routes require bearer token.
- Device tokens can be revoked individually from desktop settings.
- Mobile schedule UI intentionally blocks manual schedule creation forms.

## 5. UX/Design Direction

- Mobile visual language mirrors desktop:
  - deep dark surfaces
  - electric blue accents
  - high-contrast cards and chips
- Phone-first layout with tablet-safe spacing.
- Chat remains the center of experience; schedules and settings are secondary tabs.

## 6. Remaining Work to Production

- Add full markdown renderer, richer tool cards, and advanced media previews.
- Add stronger websocket reconnection/session recovery across app restarts.
- Add E2E mobile tests (Detox/Expo E2E path).
- Add richer tunnel diagnostics (port conflicts, daemon status, and OS permission troubleshooting).
- Add rate limits and optional per-device scopes for gateway endpoints.
