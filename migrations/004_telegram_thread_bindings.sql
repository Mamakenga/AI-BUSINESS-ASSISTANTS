BEGIN;

CREATE TABLE telegram_threads (
  thread_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  message_thread_id BIGINT,
  topic_name TEXT,
  last_founder_message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_threads_chat_id_thread_id
  ON telegram_threads (chat_id, thread_id);

COMMIT;
