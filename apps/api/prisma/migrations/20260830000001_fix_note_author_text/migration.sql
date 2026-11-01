-- Fix author_user_id column type from UUID to TEXT in both note tables.
-- This allows the AI system to write notes with a sentinel string like "system"
-- without requiring a real user FK reference.

ALTER TABLE "conversation_notes" ALTER COLUMN "author_user_id" TYPE TEXT;

ALTER TABLE "customer_notes" ALTER COLUMN "author_user_id" TYPE TEXT;
