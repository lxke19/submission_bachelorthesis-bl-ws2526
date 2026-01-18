# docs/CONFIGURATION.md

[← Back to README](../README.md)

## Overview

Configuration is done via environment variables in `.env`.  
Use `.example.env` as the template.

This project uses **three Postgres databases**:

- App DB (Prisma): participants, surveys, chat logs, etc.
- LangGraph checkpoint DB: agent state/checkpoints (schema-separated per agent)
- Dataset DB (ESG): read-only analytical source queried by the assistant

## App secrets

- AUTH_SECRET  
  Used for authentication/session signing (management login + study session tokens).

## Optional third-party keys

- OPENAI_API_KEY  
  Required for LLM calls used by the agents.
- TAVILY_API_KEY ("deprecated")  
  Only required if you run the dev-only `tavilyAgent`.

## LangGraph checkpoint database

- LANGGRAPH_POSTGRES_URL  
  Connection string for the checkpoint DB.
- LANGGRAPH_POSTGRES_SCHEMA_TAVILY  
  Schema used by `tavilyAgent` to avoid collisions.
- LANGGRAPH_POSTGRES_SCHEMA_DATA_AWARE  
  Schema used by `dataAwareLLMSystem` to avoid collisions.
- LANGGRAPH_DEFAULT_MODEL  
  Default model identifier used by agents unless overridden.

## App database (Prisma)

- DATABASE_URL  
  Connection string for the app DB.

Notes:

- This DB stores the study structure for reproducibility (tasks + surveys),
  participants, timestamps/metrics, transcripts, and minimal tool-call logs.

## Dataset database (ESG)

- DATASET_POSTGRES_URL  
  Connection string for the dataset DB.
- DATASET_SQL_MAX_ROWS  
  Safety/performance limit (max rows returned).
- DATASET_SQL_STATEMENT_TIMEOUT_MS  
  Query timeout for dataset SQL tool execution.

## Mail (optional)

If SMTP variables are set, the system can send mails (e.g. unlock flows).  
If not set, the app should fallback to logging.

- SMTP_HOST
- SMTP_PORT
- SMTP_SECURE
- SMTP_USER
- SMTP_PASS
- SMTP_FROM_NAME
- SMTP_FROM_ADDRESS

## URLs / routing / integration

- APP_BASE_URL  
  Base URL used in generated links (local dev usually http://localhost:3000)
- NEXT_PUBLIC_API_URL  
  Public API route exposed by Next.js (often /api/langgraph or a full URL)
- NEXT_PUBLIC_ASSISTANT_ID  
  Which assistant is shown by default in the UI (for this study: dataAwareLLMSystem)
- LANGGRAPH_API_URL  
  LangGraph server URL (healthcheck + streaming; typically http://localhost:2024)
- CORS_ALLOWED_ORIGINS  
  Allowed browser origins for CORS (local dev: http://localhost:3000,http://localhost:3001)

---

[← Back to README](../README.md)
