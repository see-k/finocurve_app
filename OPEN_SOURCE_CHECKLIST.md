# FinoCurve App — Go-Public Checklist

This checklist is for preparing `finocurve_app` to become a clean, trustworthy public open-source repo.

## Must-do before making the repo public

- [x] Confirm no live secrets are committed
- [x] Ensure `.env` is ignored
- [x] Add a license
- [x] Rewrite the README for public users
- [x] Replace placeholder clone/install instructions
- [x] Clarify what this repo includes vs. what remains proprietary
- [x] Add security and privacy notes
- [x] Make optional integrations clearly optional
- [ ] Verify screenshots do not reveal private or sensitive data
- [ ] Confirm all branding/assets are safe to publish
- [ ] Sanity-check package metadata and author fields for public release
- [ ] Review issue templates / contribution policy if accepting outside contributors

## Recommended before launch announcement

- [ ] Add a short architecture diagram
- [ ] Add screenshots/GIFs for the main flows
- [ ] Add a roadmap section with near-term priorities
- [ ] Add a limitations section so expectations are set correctly
- [ ] Add example configuration for optional AI features
- [ ] Add a changelog or initial release notes

## Suggested public positioning

- Privacy-first desktop app for portfolio tracking and risk analysis
- Local-first by default, with optional AI and cloud-connected workflows
- Manual assets and loans are first-class
- Aggregation and proprietary backend services are not included in this repo

## Notes on repo boundaries

This repository should represent the **open trust surface** of FinoCurve:
- desktop/web client
- local portfolio workflows
- reports/documents UI
- optional local AI assistant flows

This repository should **not** imply that it contains:
- hosted aggregation infrastructure
- premium syncing services
- mobile app code
- proprietary backend services or provider operations
