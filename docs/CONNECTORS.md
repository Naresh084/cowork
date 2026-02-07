# MCP Connectors Setup Guide

This document covers how to set up and configure every connector available in GeminiCowork. Connectors use the Model Context Protocol (MCP) to give the deep agent access to external services.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [How Connectors Work](#how-connectors-work)
3. [OAuth Connectors](#oauth-connectors)
   - [Google Workspace](#google-workspace)
   - [Microsoft 365](#microsoft-365)
   - [Microsoft Teams](#microsoft-teams)
4. [API Key Connectors](#api-key-connectors)
   - [GitHub](#github)
   - [GitLab](#gitlab)
   - [Slack](#slack)
   - [Discord](#discord)
   - [Notion](#notion)
   - [Linear](#linear)
   - [Todoist](#todoist)
   - [Jira](#jira)
   - [Sentry](#sentry)
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
4. Click **Configure** to enter credentials (API key/token)
5. Click **Connect** to start using the connector

For OAuth connectors (Google Workspace, Microsoft 365), you also need to set up OAuth client credentials in the `.env` file before the login flow will work. See [OAuth Connectors](#oauth-connectors) below.

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
| **OAuth** | Browser-based login flow. Client credentials go in `.env` | Google Workspace, Microsoft 365 |
| **API Key / Token** | You paste a token into the connector UI | GitHub, Slack, Notion, Linear |
| **Connection String** | Database URL entered via the connector UI | PostgreSQL, MySQL, MongoDB |
| **None** | No credentials needed | Fetch, Memory, Puppeteer |

### Credential Storage

- **API keys and tokens** entered via the Connectors UI are stored in the **macOS Keychain**
- **OAuth access/refresh tokens** obtained after login are also stored in the Keychain
- **OAuth client credentials** (`GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, etc.) go in the `.env` file - these are only used by the OAuth service to initiate login flows, not passed to MCP servers
- The `.env` file is gitignored and never committed

---

## OAuth Connectors

OAuth connectors require a one-time setup: you register an "OAuth application" with the provider, then put the client credentials in your `.env` file. After that, users authenticate via a browser-based login flow.

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

These connectors use API keys or personal access tokens. Configure them via the **Connectors UI**: Install the connector, click **Configure**, and paste your token. Credentials are stored securely in the macOS Keychain.

### GitHub

**Tools:** Create/manage issues, PRs, repos, read code, search, branch management

#### Get a Token

1. Go to [GitHub Settings > Tokens](https://github.com/settings/tokens)
2. Click **Generate new token** > **Fine-grained token** (recommended)
3. Set:
   - **Token name**: `GeminiCowork`
   - **Expiration**: your choice (90 days is a good default)
   - **Repository access**: select the repos you want the agent to access
   - **Permissions**: Read & Write for Contents, Issues, Pull Requests, etc.
4. Click **Generate token**
5. Copy the token (starts with `github_pat_` for fine-grained, or `ghp_` for classic)

#### Configure

1. Connectors > GitHub > **Install** > **Configure**
2. Paste your token in the `GITHUB_PERSONAL_ACCESS_TOKEN` field
3. Click **Save**

---

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
2. Paste your token in the `GITLAB_TOKEN` field
3. For self-hosted GitLab, also fill in `GITLAB_URL` (e.g., `https://gitlab.your-company.com`)
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
3. Click **Save**

---

### Notion

**Tools:** Create/read/update pages, databases, blocks

#### Get an Integration Token

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Click **+ New integration**
3. Name: `GeminiCowork`, select your workspace
4. Capabilities: **Read content**, **Update content**, **Insert content**
5. Click **Submit**
6. Copy the **Internal Integration Secret** (starts with `secret_`)

**Important:** You must also share specific Notion pages/databases with the integration:
1. Open a Notion page
2. Click **...** (more) > **Connections** > **Connect to** > `GeminiCowork`

#### Configure

1. Connectors > Notion > **Install** > **Configure**
2. Paste your token in `NOTION_API_KEY`
3. Click **Save**

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
3. Click **Save**

---

### Jira

**Tools:** View/manage issues, boards, sprints, projects

#### Get an API Token

1. Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**
3. Label: `GeminiCowork`
4. Copy the token

#### Configure

1. Connectors > Jira > **Install** > **Configure**
2. Fill in:
   - `JIRA_URL`: your Jira instance (e.g., `https://your-org.atlassian.net`)
   - `JIRA_EMAIL`: your Atlassian account email
   - `JIRA_API_TOKEN`: the token you created
3. Click **Save**

---

### Sentry

**Tools:** View errors, issues, performance data

#### Get an Auth Token

1. Go to [Sentry Auth Tokens](https://sentry.io/settings/account/api/auth-tokens/)
2. Click **Create New Token**
3. Scopes: `event:read`, `project:read`, `org:read`
4. Copy the token (starts with `sntrys_`)

#### Configure

1. Connectors > Sentry > **Install** > **Configure**
2. Paste your token in `SENTRY_AUTH_TOKEN`
3. Optionally fill in `SENTRY_ORG` with your organization slug
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

Database connectors use connection strings. Configure them the same way as API key connectors: Install, click **Configure**, and enter the connection URL.

### PostgreSQL

1. Connectors > PostgreSQL > **Install** > **Configure**
2. Enter your connection URL in `DATABASE_URL`
   - Format: `postgresql://username:password@host:5432/database`

### MySQL

1. Connectors > MySQL > **Install** > **Configure**
2. Enter your connection URL in `MYSQL_URL`
   - Format: `mysql://username:password@host:3306/database`

### MongoDB

1. Connectors > MongoDB > **Install** > **Configure**
2. Enter your connection URI in `MONGODB_URI`
   - Format: `mongodb://username:password@host:27017/database`

### SQLite

1. Connectors > SQLite > **Install** > **Configure**
2. Enter the absolute file path in `SQLITE_DB_PATH`
   - Example: `/Users/you/data/myapp.db`

### Redis

1. Connectors > Redis > **Install** > **Configure**
2. Enter your connection URL in `REDIS_URL`
   - Format: `redis://localhost:6379` or `redis://username:password@host:6379`

> **Security note:** Database connectors give the agent read/write access. Use a read-only user or a dedicated database for safety.

---

## No-Auth Connectors

These connectors work out of the box with no credentials:

| Connector | Description |
|-----------|-------------|
| **Fetch** | Make HTTP requests to any URL |
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

- Verify `GOOGLE_CLIENT_ID` / `MICROSOFT_CLIENT_ID` is set in `.env`
- Restart the app after editing `.env`
- For Google: make sure your email is added as a test user in the consent screen

### "Invalid client" error during OAuth

- Double-check the Client ID and Client Secret in `.env`
- For Google: make sure you created a **Desktop app** type credential, not a Web app
- For Microsoft: make sure **Allow public client flows** is enabled

### Token expired

- OAuth tokens auto-refresh when a refresh token is available
- If refresh fails, click **Configure** again to re-authorize
- For API keys, check if the token was revoked on the provider's website

### Connector shows "error" status

- Click the connector to see the error message
- Common causes: invalid credentials, missing runtime, network issues
- Try **Reconnect** to retry

### Database connection refused

- Verify the database is running and accepting connections
- Check the connection string format
- For remote databases, make sure your IP is allowed in firewall rules
