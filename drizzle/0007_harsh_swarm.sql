-- Safely drop index if exists and alter telegram_chat_id column to optional
DROP INDEX IF EXISTS "users_telegram_chat_id_idx";
ALTER TABLE "users" ALTER COLUMN "telegram_chat_id" DROP NOT NULL;