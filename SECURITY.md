# Security Policy

If you discover a security issue in FinoCurve App, please avoid posting sensitive details publicly in a GitHub issue.

Instead, report it privately to the project maintainer through a private channel.

## Security notes for this repository

This repository includes optional support for:
- local AI providers
- cloud AI providers
- MCP server connections
- A2A local endpoint exposure

Before running advanced features, review your local configuration carefully.

### Important boundaries

- A2A is intended for local/operator-controlled environments
- MCP behavior depends on the servers you configure
- API keys should only be supplied through local configuration or environment variables
- This repo is only one part of the broader FinoCurve ecosystem

## Sensitive issue examples

Please report privately if you find issues involving:
- credential exposure
- insecure local storage of secrets
- unintended network exposure
- unsafe command execution through MCP/A2A integrations
- privilege escalation via local integrations
