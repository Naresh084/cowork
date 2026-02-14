# Gemini Cowork Mobile

Companion iOS/Android app for remote Cowork access via QR pairing.

## Features

- QR-only onboarding (no username/password flow)
- Live chat streaming over WebSocket
- Image attachment upload in chat
- Session history browsing
- Schedule management: run/pause/resume existing cron/workflow tasks
- Mobile settings and logout

## Dev

```bash
pnpm --filter @cowork/mobile dev
```

## Pairing flow

1. Enable Remote Access in Desktop Settings.
2. Configure tunnel endpoint (Tailscale recommended).
3. Generate pairing QR in desktop.
4. Scan QR from mobile onboarding.

## Important UX rule

Mobile app does not expose manual schedule create/edit forms.  
Schedule creation is chat-driven to keep behavior audited and safer.
