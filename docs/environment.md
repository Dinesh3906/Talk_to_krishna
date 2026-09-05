# Environment & Configuration Management — Talk to Krishna

This document establishes environment isolation, secrets management, and configuration boundaries.

---

## 1. Environment Separation (Dev / Staging / Prod)

The system maintains strict isolation between environments:
- **Development**: Runs locally via Docker Compose (`docker-compose.yml`) and local Node.js processes. Uses developer-scoped API keys with minimal rate quotas.
- **Staging**: Mirrors production topology with managed PostgreSQL + pgvector instances and isolated testing schemas. Used for pre-release verification and automated integration tests.
- **Production**: Deployed to hardened container infrastructure with autoscaling. Secrets are injected at runtime through secure cloud secret managers (e.g., AWS Secrets Manager or GCP Secret Manager). Never contains test fixtures or debug bypasses.

---

## 2. Secrets Management & Zero Credential Leaks

- **Source Control Cleanliness**: `.gitignore` strictly ignores all `.env`, `.env.*`, `*.pem`, and credential files.
- **Zero Committed Secrets**: `.env.example` contains exclusively non-sensitive placeholder templates.
- **Fail-Closed Startup Validation**: On startup, `services/api` validates the existence of required environment variables (`DATABASE_URL`, `JWT_SECRET`, `AI_API_KEY`). If any required variable is missing, the service logs a structured configuration error and shuts down immediately, preventing runtime silent failures.

---

## 3. Telemetry Privacy Contract

`TelemetryService` enforces strict data privacy:
- **Permitted Fields**: `request_id`, `model`, `provider`, `total_duration_ms`, `retrieval_duration_ms`, `generation_duration_ms`, `prompt_tokens`, `completion_tokens`, `chunk_count`, `citation_count`, `error_code`.
- **Forbidden Fields**: Passwords, JWTs, API tokens, user email addresses, raw user message content, and LLM text outputs.
