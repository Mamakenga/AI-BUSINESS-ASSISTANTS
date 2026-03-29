# Migrations

The project uses ordered PostgreSQL SQL migrations.

Current convention:

1. one logical schema step per file
2. numeric prefix for execution order
3. `BEGIN/COMMIT` inside each migration
4. additive changes by default

Current baseline:

1. `001_initial_control_plane.sql`
   - creates the core control-plane tables
   - adds the first indexes for memory, messages, decisions, jobs, runs, and artifacts
2. `002_founder_tasks.sql`
   - creates the founder-facing `tasks` table for the Mini App board
   - connects `messages`, `runs`, and `artifacts` task references to canonical task ids
3. `003_run_dispatch_metadata.sql`
   - adds `requested_by_agent` and `dispatch_reason` to `runs`
   - prepares the schema for orchestrator-created follow-up runs
4. `004_telegram_thread_bindings.sql`
   - stores Telegram delivery metadata for each internal `thread_id`
   - lets workers send final replies back to the same Telegram chat/topic
