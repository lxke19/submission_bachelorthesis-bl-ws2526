# README.md

## Bachelorthesis - Data-Aware LLM Analytics Assistant (Study System)

This repository contains an **interactive, web-based study system** for a **Bachelor thesis (Wirtschaftsinformatik)** by
**Lukas Bieringer**. Participants solve **three tasks** on an ESG dataset with support of a **chat assistant** that can
query a **SQL database**.

The system is built to compare two study conditions (between-subject design):

- **Variant 1:** Compact provenance / source information only.
- **Variant 2:** Additional **Data Insights** / data-quality-related information.

The UI and parts of the chat/thread components are based on the open-source **LangChain Agent Chat UI** (MIT). See
`docs/THIRD_PARTY_NOTICES.md`.

## What’s inside

- **Next.js** web app (public study flow + management UI)
- **LangGraphJS** agents (main: `dataAwareLLMSystem`; dev-only: `tavilyAgent`)
- **PostgreSQL** via Docker Compose
    - App DB (Prisma)
    - LangGraph checkpoint DB (separate, schema-separated per agent)
    - Dataset DB (ESG data, imported from CSV)

## Documentation

Start here:

- [Startup & Local Setup](docs/STARTUP.md)
- [Configuration (Environment Variables)](docs/CONFIGURATION.md)

Architecture & Data:

- [Project Structure](docs/STRUCTURE.md)
- [Dataset & Academic Source](docs/DATASET.md)

Research & Legal:

### - [Agents (Workflow)](docs/AGENTS.md)
- [License & Usage Restrictions](docs/LICENSE.md)
- [Third-Party Notices](docs/THIRD_PARTY_NOTICES.md)

## Dataset / Credit

This project uses a publicly available ESG dataset described in:

Forster, K., Keil, L., Wagner, V., Müller, M. A., Sellhorn, T., & Feuerriegel, S. (2025). *Assessing Corporate
Sustainability with Large Language Models: Evidence from Europe* (TRR 266 Accounting for Transparency Working Paper
Series No. 202). https://doi.org/10.2139/ssrn.5361703

Dataset download (OSF):

- https://osf.io/q2jpv/
- Files page: https://osf.io/q2jpv/files/osfstorage

See `docs/DATASET.md` for details (required CSV filenames, DB tables, import mechanism, and notes on missing values).

## License / Usage

This repository is an **unpublished thesis/study artifact** (All rights reserved).  
Third-party code remains under its own licenses (MIT etc.). See:

- `docs/LICENSE.md`
- `docs/THIRD_PARTY_NOTICES.md`

## Contact

Lukas Bieringer  
bieringer-lukas@web.de
