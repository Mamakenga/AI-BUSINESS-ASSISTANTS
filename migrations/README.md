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
