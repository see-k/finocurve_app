<p align="center">
  <img src="public/images/finocurve-logo-transparent.png" alt="FinoCurve Logo" width="250"/>
</p>

# FinoCurve App

FinoCurve App is a **privacy-first desktop application** for portfolio tracking, risk analysis, market monitoring, and document-driven financial workflows.

It is designed for people whose financial lives are more complex than what most mainstream investing apps handle well — especially users with a mix of public assets, manual/private holdings, loans, and a desire for deeper visibility into risk and exposure.

## What this repository includes

This repository contains the **desktop/web client** for FinoCurve, built with React + Electron.

Included here:
- portfolio dashboard and market views
- asset, loan, and risk-analysis workflows
- reports and documents UI
- optional local AI assistant workflows
- optional MCP / A2A integrations for local agent tooling

## What this repository does **not** include

This repository does **not** include:
- FinoCurve's hosted aggregation backend
- premium sync / account-linking services
- mobile app code
- proprietary backend operations or managed provider infrastructure

If you use this repo on its own, you should think of it as the **local trust surface** of FinoCurve rather than the full commercial stack.

## Why open source this app?

The desktop client is being opened to increase:
- transparency
- user trust
- inspectability of the local product surface
- confidence in the privacy-first direction of the product

The broader FinoCurve ecosystem may include additional managed services that are not part of this repository.

## Key features

- **Portfolio Dashboard** — track assets, allocations, and performance in one place
- **Risk Analysis** — explore concentration, risk-adjusted performance, and portfolio blindspots
- **Asset & Loan Tracking** — manage both investments and liabilities
- **Reports & Documents** — generate and review financial reports and uploaded documents
- **Markets & News** — stay current with financial news and charting workflows
- **Optional Local AI Assistant** — ask questions about your portfolio and analyze documents locally or with configured providers
- **Optional MCP / A2A hooks** — connect the app to local agent tooling workflows

## Tech stack

- **Frontend:** React 19
- **Desktop runtime:** Electron 40
- **Build tool:** Vite 6
- **Language:** TypeScript
- **Charts / visualization:** Recharts
- **Icons:** Lucide React

## Getting started

### Prerequisites

- Node.js (latest LTS recommended)
- npm
- Optional for AI features: [Ollama](https://ollama.ai) or supported cloud provider credentials

### Installation

```bash
git clone https://github.com/see-k/finocurve_app.git
cd finocurve_app
npm install
```

### Development

```bash
npm run dev
```

### Production builds

```bash
npm run dist
```

Architecture-specific macOS builds:

```bash
npm run dist:arm
npm run dist:intel
```

Release artifacts are written to:

```bash
release/
```

## Optional AI features

FinoCurve App supports optional AI workflows for document analysis and portfolio-oriented chat.

Supported provider types in this repo include:
- Ollama
- AWS Bedrock
- Azure OpenAI

Typical local flow:
1. Install Ollama
2. Pull a model such as `llama3.2`
3. Configure AI in the app settings
4. Upload PDFs/text documents and run analysis from Reports & Documents

### Optional A2A endpoint

If enabled, the app can expose an A2A-compatible local endpoint on:

```text
http://127.0.0.1:3847
```

This is intended for **local / operator-controlled workflows**.

## Security and privacy notes

- Core desktop usage can be local-first
- AI features are optional
- Optional integrations (e.g. FMP for congressional data) use keys you enter in the app
- A2A is optional and intended for local use
- MCP integrations depend on user-configured local MCP servers
- Cloud / managed service behavior is not fully represented by this repo alone

## Configuration

There is **no** app-level `.env` file for secrets or feature flags. Use **Settings** in the desktop app for configuration, including:
- AI models/providers
- cloud vs local storage preferences
- **Plugins** such as Financial Modeling Prep
- MCP-related setup

Where supported, secrets are intended to stay local to the device and out of the renderer surface.

For basic local development of the core app surface, these optional integrations are **not required**.

## Data persistence

Installing a newer `.dmg` and replacing the app should not erase user data.

User data is stored outside the app bundle:
- Renderer data in browser storage (`localStorage`)
- Main-process config/cache in Electron `userData`

You usually only lose data if:
- you explicitly clear it in-app
- the Electron user data folder is manually removed
- the app identity/storage path changes between releases

## Screenshots

| Dashboard | Market Analysis |
|-----------|-----------------|
| ![Dashboard](public/images/dashboard-two-col.png) | ![Markets](public/images/markets-tradingview.png) |

| Portfolio | News |
|-----------|------|
| ![Portfolio](public/images/portfolio-with-bg.png) | ![News](public/images/markets-news-tab.png) |

## Current status

FinoCurve App is actively evolving.

Expect rough edges around:
- advanced integrations
- premium/commercial service boundaries
- contribution workflow polish
- some optional AI / agent tooling flows

## License

MIT
