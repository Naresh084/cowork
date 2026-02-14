# MCP Connectors Setup Guide

This document covers how to set up and configure every connector available in GeminiCowork. Connectors use the Model Context Protocol (MCP) to give the deep agent access to external services.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [How Connectors Work](#how-connectors-work)
3. [OAuth Connectors](#oauth-connectors)
   - [MCP-Native OAuth (No Manual Secrets)](#mcp-native-oauth-no-manual-secrets)
   - [Google Workspace](#google-workspace)
   - [Microsoft 365](#microsoft-365)
   - [Microsoft Teams](#microsoft-teams)
4. [API Key Connectors](#api-key-connectors)
   - [GitLab](#gitlab)
   - [Slack](#slack)
   - [Discord](#discord)
   - [Linear](#linear)
   - [Todoist](#todoist)
   - [Brave Search](#brave-search)
   - [Exa](#exa)
5. [Database Connectors](#database-connectors)
   - [PostgreSQL](#postgresql)
   - [MySQL](#mysql)
   - [MongoDB](#mongodb)
   - [SQLite](#sqlite)
   - [Redis](#redis)
6. [No-Auth Connectors](#no-auth-connectors)
7. [Custom Connectors](#custom-connectors)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

1. Open GeminiCowork and go to the **Connectors** panel (puzzle icon in sidebar)
2. Browse the **Available** tab to see all connectors
3. Click **Install** on any connector you want
4. If prompted, click **Configure** to enter credentials (API key/token/database fields)
5. Click **Connect** to start using the connector

For MCP-native OAuth connectors (Notion, GitHub, Jira, Sentry), no manual secrets are required. Install and connect, then complete browser auth handled by the remote MCP server.

---

## How Connectors Work

### Architecture

```
User <-> GeminiCowork UI <-> Tauri Backend <-> Sidecar <-> MCP Server (connector)
```

Each connector is an MCP server that runs as a child process. When connected, its tools become available to the deep agent. For example, connecting the GitHub connector gives the agent tools like `create_issue`, `list_pull_requests`, `read_file`, etc.

Connected connector tools are also available to workflow executions, including scheduled workflow runs and chat-triggered workflow runs, subject to the same policy and permission gates.

### Authentication Types

| Type | How it works | Examples |
|------|-------------|----------|
| **OAuth (App-managed)** | Browser/device-code flow managed by GeminiCowork. Client credentials come from `.env`. | Google Workspace, Microsoft 365, Microsoft Teams |
| **OAuth (MCP-native via `mcp-remote`)** | Browser auth handled by the remote MCP endpoint (no connector secrets in app). | Notion, GitHub, Jira, Sentry |
| **API Key / Token** | You paste a token into the connector UI. | GitLab, Slack, Discord, Linear, Todoist, Brave Search, Exa |
| **Database Credentials** | You enter connection fields in the connector UI. | PostgreSQL, MySQL, MongoDB, SQLite, Redis |
| **None** | No credentials needed. | Fetch, Memory, Puppeteer, Sequential Thinking |

### Credential Storage

- **Connector secrets** entered via the Connectors UI are stored in a local file with user-only permissions (`0600`)
- **App-managed OAuth access/refresh tokens** are stored in the same local file
- **MCP-native OAuth connectors** (Notion/GitHub/Jira/Sentry) do not require manual token entry in GeminiCowork
- **OAuth client credentials** (`GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, etc.) go in `.env` only for app-managed OAuth connectors
- The `.env` file is gitignored and never committed

---

## OAuth Connectors

OAuth connectors in GeminiCowork now use two models:

1. **MCP-native OAuth via remote MCP endpoints** (no manual connector secrets)
2. **App-managed OAuth** (requires provider client credentials in `.env`)

### MCP-Native OAuth (No Manual Secrets)

These connectors run through `mcp-remote`, which opens the provider login flow in your browser.

| Connector | Remote MCP Endpoint |
|-----------|---------------------|
| Notion | `https://mcp.notion.com/mcp` |
| GitHub | `https://api.githubcopilot.com/mcp/` |
| Jira | `https://mcp.atlassian.com/v1/sse` |
| Sentry | `https://mcp.sentry.dev/mcp` |

#### Connect Steps (Notion/GitHub/Jira/Sentry)

1. Connectors > select connector > **Install**
2. Click **Connect**
3. Complete the browser OAuth flow
4. Return to GeminiCowork and wait for connected status

If a provider session expires, use **Reconnect** to restart OAuth.

### Google Workspace

**What it gives the agent:** Gmail, Calendar, Drive, Docs, Sheets, Slides, Forms, Tasks, Contacts (145+ tools)

#### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** at the top, then **New Project**
3. Name it something like `GeminiCowork` and click **Create**
4. Make sure the new project is selected

#### Step 2: Enable APIs

1. Go to **APIs & Services > Library**
2. Search for and enable each of these APIs:
   - **Gmail API**
   - **Google Calendar API**
   - **Google Drive API**
   - **Google Docs API**
   - **Google Sheets API**
   - **Google Slides API**
   - **Google Forms API**
   - **Tasks API**
   - **People API** (for Contacts)

#### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Choose **External** (or **Internal** if you're on Google Workspace)
3. Fill in:
   - **App name**: `GeminiCowork`
   - **User support email**: your email
   - **Developer contact**: your email
4. Click **Save and Continue**
5. On the **Scopes** page, click **Add or remove scopes** and add:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/presentations`
   - `https://www.googleapis.com/auth/forms.body`
   - `https://www.googleapis.com/auth/tasks`
   - `https://www.googleapis.com/auth/contacts`
6. Click **Save and Continue**
7. On **Test users**, add your Google email address
8. Click **Save and Continue**

> **Note:** While in "Testing" mode, only test users you add can authorize. To let anyone authorize, you'd need to submit for verification. For personal use, testing mode is fine.

#### Step 4: Create OAuth Credentials

1. Go to **APIs & Services > Credentials**
2. Click **+ Create Credentials > OAuth client ID**
3. Application type: **Desktop app**
4. Name: `GeminiCowork Desktop`
5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

#### Step 5: Add to .env

Open `.env` in the project root and fill in:

```bash
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdef123456
```

#### Step 6: Connect

1. Restart GeminiCowork (so it picks up the new `.env` values)
2. Go to **Connectors > Available > Google Workspace**
3. Click **Install**, then **Configure**
4. A browser window opens for Google login
5. Sign in and grant permissions
6. Done - the connector is now active

---

### Microsoft 365

**What it gives the agent:** Outlook, Calendar, OneDrive, Teams, SharePoint, Planner, To Do, OneNote (90+ tools)

Microsoft uses **Device Code Flow** - you'll see a code on screen and authorize in your browser. No client secret needed.

#### Step 1: Register an Azure AD Application

1. Go to [Azure Portal - App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **+ New registration**
3. Fill in:
   - **Name**: `GeminiCowork`
   - **Supported account types**: "Accounts in any organizational directory and personal Microsoft accounts"
   - **Redirect URI**: Leave blank (not needed for device code flow)
4. Click **Register**
5. On the app overview page, copy the **Application (client) ID**

#### Step 2: Enable Device Code Flow

1. In your registered app, go to **Authentication**
2. Scroll down to **Advanced settings**
3. Set **Allow public client flows** to **Yes**
4. Click **Save**

#### Step 3: Add API Permissions

1. Go to **API permissions**
2. Click **+ Add a permission > Microsoft Graph > Delegated permissions**
3. Add these permissions:
   - `Mail.ReadWrite`
   - `Calendars.ReadWrite`
   - `Files.ReadWrite`
   - `Team.ReadBasic.All`
   - `Chat.ReadWrite`
   - `Tasks.ReadWrite`
   - `Notes.ReadWrite`
   - `User.Read`
   - `offline_access`
4. Click **Add permissions**

> If your organization requires admin consent, click **Grant admin consent** (requires admin privileges).

#### Step 4: Add to .env

```bash
MICROSOFT_CLIENT_ID=12345678-abcd-efgh-ijkl-123456789012
```

#### Step 5: Connect

1. Restart GeminiCowork
2. Go to **Connectors > Available > Microsoft 365**
3. Click **Install**, then **Configure**
4. You'll see a device code (e.g., `ABCD-EFGH`) and a "Open microsoft.com" button
5. Click the button, paste the code, sign in, and grant permissions
6. The app will detect the authorization automatically

---

### Microsoft Teams

Same setup as Microsoft 365 above - they share the same Azure AD application and `MICROSOFT_CLIENT_ID`. The Teams connector just requests different scopes focused on messaging.

---

## API Key Connectors

These connectors use API keys or personal access tokens. Configure them via the **Connectors UI**: Install the connector, click **Configure**, and paste your token.

### GitLab

**Tools:** Manage repos, issues, merge requests, pipelines, read code

#### Get a Token

1. Go to [GitLab > Access Tokens](https://gitlab.com/-/user_settings/personal_access_tokens)
2. Click **Add new token**
3. Set:
   - **Token name**: `GeminiCowork`
   - **Scopes**: `read_api`, `read_repository`, `write_repository`
4. Click **Create personal access token**
5. Copy the token (starts with `glpat-`)

#### Configure

1. Connectors > GitLab > **Install** > **Configure**
2. Paste your token in `GITLAB_PERSONAL_ACCESS_TOKEN`
3. For custom/self-hosted GitLab, also set `GITLAB_API_URL` (e.g., `https://gitlab.example.com/api/v4`)
4. Click **Save**

---

### Slack

**Tools:** Send messages, search conversations, manage channels, reactions, pins

#### Step 1: Create a Slack App

1. Go to [Slack API > Your Apps](https://api.slack.com/apps)
2. Click **Create New App > From scratch**
3. Name: `GeminiCowork`, select your workspace
4. Click **Create App**

#### Step 2: Add Bot Scopes

1. Go to **OAuth & Permissions**
2. Under **Bot Token Scopes**, add:
   - `chat:write`
   - `channels:read`
   - `channels:history`
   - `users:read`
   - `files:read`
   - `files:write`
3. Click **Install to Workspace** and authorize

#### Step 3: Get Credentials

1. After installing, copy the **Bot User OAuth Token** (starts with `xoxb-`)
2. Get your **Team ID**: open Slack in a browser, the URL is `app.slack.com/client/TXXXXXXXX/...` - the `T...` part is your Team ID

#### Configure

1. Connectors > Slack > **Install** > **Configure**
2. Paste the bot token in `SLACK_BOT_TOKEN`
3. Paste the team ID in `SLACK_TEAM_ID`
4. Click **Save**

---

### Discord

**Tools:** Send messages, read channels, manage server

#### Get a Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, name it `GeminiCowork`
3. Go to **Bot** tab, click **Add Bot**
4. Under **Token**, click **Copy**
5. Under **Privileged Gateway Intents**, enable **Message Content Intent**
6. Go to **OAuth2 > URL Generator**, select `bot` scope, select permissions
7. Use the generated URL to invite the bot to your server

#### Configure

1. Connectors > Discord > **Install** > **Configure**
2. Paste your bot token in `DISCORD_BOT_TOKEN`
3. The app maps it to `DISCORD_TOKEN` for the MCP server
4. Click **Save**

---

### Linear

**Tools:** Create/update issues, manage projects, cycles

#### Get an API Key

1. Go to [Linear Settings > API](https://linear.app/settings/api)
2. Under **Personal API keys**, click **Create key**
3. Label: `GeminiCowork`
4. Click **Create**
5. Copy the key (starts with `lin_api_`)

#### Configure

1. Connectors > Linear > **Install** > **Configure**
2. Paste your key in `LINEAR_API_KEY`
3. Click **Save**

---

### Todoist

**Tools:** Create/manage tasks, projects, labels

#### Get an API Token

1. Go to [Todoist Settings > Integrations > Developer](https://todoist.com/app/settings/integrations/developer)
2. Copy your **API token**

#### Configure

1. Connectors > Todoist > **Install** > **Configure**
2. Paste your token in `TODOIST_API_TOKEN`
3. The app maps it to `API_KEY` for the MCP server
4. Click **Save**

---

### Brave Search

**Tools:** Web search with privacy-focused results

#### Get an API Key

1. Go to [Brave Search API](https://brave.com/search/api/)
2. Click **Get Started** and sign up
3. Create a subscription (Free tier: 2,000 queries/month)
4. Copy your API key

#### Configure

1. Connectors > Brave Search > **Install** > **Configure**
2. Paste your key in `BRAVE_API_KEY`
3. Click **Save**

---

### Exa

**Tools:** AI-powered search, find similar content

#### Get an API Key

1. Go to [Exa](https://exa.ai/) and sign up
2. Go to your dashboard
3. Copy your API key

#### Configure

1. Connectors > Exa > **Install** > **Configure**
2. Paste your key in `EXA_API_KEY`
3. Click **Save**

---

## Database Connectors

Database connectors use connector-specific fields in the **Configure** modal.

### PostgreSQL

1. Connectors > PostgreSQL > **Install** > **Configure**
2. Enter your connection URL in `DATABASE_URL`
   - Format: `postgresql://username:password@host:5432/database`

### MySQL

1. Connectors > MySQL > **Install** > **Configure**
2. Fill in:
   - `MYSQL_HOST` (example: `localhost`)
   - `MYSQL_PORT` (example: `3306`)
   - `MYSQL_DATABASE` (example: `my_database`)
   - `MYSQL_USER`
   - `MYSQL_PASSWORD`

### MongoDB

1. Connectors > MongoDB > **Install** > **Configure**
2. Enter your connection URI in `MONGODB_URI`
   - Format: `mongodb://username:password@host:27017/database`
3. The app maps this to `MDB_MCP_CONNECTION_STRING` for the MCP server

### SQLite

Uses community fallback package `mcp-sqlite` (official package currently unavailable).

1. Connectors > SQLite > **Install** > **Configure**
2. Enter the absolute file path in `SQLITE_DB_PATH`
   - Example: `/Users/you/data/myapp.db`

### Redis

1. Connectors > Redis > **Install** > **Configure**
2. Enter:
   - `REDIS_HOST` (example: `localhost`)
   - `REDIS_PORT` (example: `6379`)

> **Security note:** Database connectors give the agent read/write access. Use a read-only user or a dedicated database for safety.

---

## No-Auth Connectors

These connectors work out of the box with no credentials:

| Connector | Description |
|-----------|-------------|
| **Fetch** | Make HTTP requests to any URL (community fallback package `mcp-fetch-server`) |
| **Memory** | Knowledge graph-based persistent memory |
| **Puppeteer** | Browser automation and web scraping |
| **Sequential Thinking** | Step-by-step reasoning and problem decomposition |

Just click **Install > Connect** in the connector UI.

---

## Custom Connectors

You can add any MCP server as a custom connector:

1. Click **+ Add Custom** in the Connectors header
2. Fill in:
   - **Name**: connector identifier (kebab-case, e.g., `my-api`)
   - **Display Name**: human-readable name
   - **Description**: what it does
3. Choose transport:
   - **stdio**: runs a local command (e.g., `npx -y @some/mcp-server`)
   - **HTTP/SSE**: connects to a remote URL
4. Configure authentication if needed
5. Click **Create**

The connector appears in the **Installed** tab and works like any built-in connector.

---

## Troubleshooting

### "Connector not found" or "Connection failed"

- Make sure the runtime is installed (Node.js for `npx` connectors, Python/`uv` for `uvx` connectors)
- Check that the command exists: run `which npx` or `which uvx` in your terminal
- Check the app logs: **Help > Open Logs**

### OAuth flow not starting

- For Google/Microsoft connectors: verify `GOOGLE_CLIENT_ID` / `MICROSOFT_CLIENT_ID` is set in `.env` and restart the app
- For Notion/GitHub/Jira/Sentry: click **Reconnect** to re-open the MCP-native browser auth flow
- Make sure your browser can open external auth windows/popups

### "Invalid client" error during OAuth

- Double-check the Client ID and Client Secret in `.env`
- For Google: make sure you created a **Desktop app** type credential, not a Web app
- For Microsoft: make sure **Allow public client flows** is enabled

### Token expired

- App-managed OAuth tokens auto-refresh when a refresh token is available
- If refresh fails, click **Configure** again to re-authorize
- MCP-native OAuth connectors are re-authorized via **Reconnect**
- For API keys, check if the token was revoked on the provider's website

### Connector shows "error" status

- Click the connector to see the error message
- Common causes: invalid credentials, missing runtime, network issues
- Try **Reconnect** to retry

### Database connection refused

- Verify the database is running and accepting connections
- Verify host/port/database/user/password fields are correct for the connector
- For remote databases, make sure your IP is allowed in firewall rules
