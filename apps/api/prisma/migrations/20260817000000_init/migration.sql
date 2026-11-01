-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "LifecycleStage" AS ENUM ('unknown_visitor', 'interested', 'qualified_lead', 'order_pending', 'customer', 'returning_customer', 'vip');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('NEW', 'AI_ACTIVE', 'ORDER_INTENT_DETECTED', 'HUMAN_REQUIRED', 'HUMAN_HANDLING', 'ORDER_CONFIRMED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ConversationSource" AS ENUM ('instagram', 'messenger', 'whatsapp', 'playground');

-- CreateEnum
CREATE TYPE "HandoffPriority" AS ENUM ('critical', 'high', 'normal');

-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('hot', 'warm', 'cold');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('customer', 'ai', 'human', 'system');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('text', 'image', 'template', 'system');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('draft', 'queued', 'sent', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_COMPLETED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('active', 'committed', 'released', 'expired');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('instagram', 'messenger', 'whatsapp');

-- CreateEnum
CREATE TYPE "ChannelAccountStatus" AS ENUM ('pending', 'pending_verification', 'active', 'error', 'disconnected');

-- CreateEnum
CREATE TYPE "ReplyMode" AS ENUM ('auto_send', 'approval_required', 'draft_only');

-- CreateEnum
CREATE TYPE "PromptType" AS ENUM ('system', 'sales', 'escalation', 'handoff_summary');

-- CreateEnum
CREATE TYPE "EmbeddingSource" AS ENUM ('knowledge_document', 'product', 'variant');

-- CreateEnum
CREATE TYPE "IndexingStatus" AS ENUM ('pending', 'indexing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('delivery', 'payment', 'returns', 'working_hours', 'discount', 'min_order', 'free_shipping');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('HOT_LEAD', 'ORDER_REQUEST', 'HANDOFF', 'ESCALATION');

-- CreateEnum
CREATE TYPE "FeedbackRating" AS ENUM ('positive', 'negative');

-- CreateEnum
CREATE TYPE "FeedbackReason" AS ENUM ('wrong_product', 'wrong_tone', 'missing_information', 'incorrect_policy', 'hallucination', 'other');

-- CreateEnum
CREATE TYPE "EvaluatorType" AS ENUM ('golden_set', 'production_sample', 'staff', 'automated_grounding');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'cancelled', 'past_due');

-- CreateEnum
CREATE TYPE "UsageMetric" AS ENUM ('messages_in', 'messages_out_ai', 'orders_created', 'whatsapp_conversations_started');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('uploaded', 'validated', 'previewed', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('active', 'released');

-- CreateEnum
CREATE TYPE "AiActionType" AS ENUM ('tool_call', 'intent_classify', 'handoff', 'recommend', 'rate_limited');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "name" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "business_id" UUID,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL DEFAULT 'fashion',
    "country" TEXT NOT NULL DEFAULT 'TN',
    "default_language" TEXT NOT NULL DEFAULT 'fr',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Tunis',
    "currency" TEXT NOT NULL DEFAULT 'TND',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "deleted_at" TIMESTAMPTZ,
    "delete_after" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_members" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "invited_at" TIMESTAMPTZ,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ,
    "last_active_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_onboarding" (
    "business_id" UUID NOT NULL,
    "business_created" BOOLEAN NOT NULL DEFAULT true,
    "channel_connected" BOOLEAN NOT NULL DEFAULT false,
    "products_imported" BOOLEAN NOT NULL DEFAULT false,
    "ai_configured" BOOLEAN NOT NULL DEFAULT false,
    "playground_passed" BOOLEAN NOT NULL DEFAULT false,
    "approval_trial_passed" BOOLEAN NOT NULL DEFAULT false,
    "handoff_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "ai_activated" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "business_onboarding_pkey" PRIMARY KEY ("business_id")
);

-- CreateTable
CREATE TABLE "business_rules" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "rule_type" "RuleType" NOT NULL,
    "payload" JSONB NOT NULL,
    "priority" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "effective_from" TIMESTAMPTZ NOT NULL,
    "effective_to" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "invited_by_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "accepted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "category_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'draft',
    "currency" TEXT,
    "benefits" JSONB,
    "selling_points" JSONB,
    "objections" JSONB,
    "faqs" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "price" DECIMAL(12,3) NOT NULL,
    "discount_price" DECIMAL(12,3),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "s3_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt_text" TEXT,
    "sort_order" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "conversation_id" UUID,
    "order_id" UUID,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL,
    "reserved_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "order_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_import_runs" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "s3_key" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL,
    "total_rows" INTEGER,
    "success_rows" INTEGER,
    "error_rows" INTEGER,
    "error_s3_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "catalog_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" JSONB,
    "language" TEXT,
    "preferences" JSONB,
    "lifecycle_stage" "LifecycleStage" NOT NULL DEFAULT 'unknown_visitor',
    "confirmed_order_count" INTEGER NOT NULL DEFAULT 0,
    "last_confirmed_order_at" TIMESTAMPTZ,
    "merged_into_customer_id" UUID,
    "erased_at" TIMESTAMPTZ,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_identities" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "platform" "Channel" NOT NULL,
    "platform_user_id" TEXT NOT NULL,
    "phone_number" TEXT,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_tags" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "tag" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" UUID,

    CONSTRAINT "customer_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_notes" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_accounts" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "page_id" TEXT,
    "ig_user_id" TEXT,
    "waba_id" TEXT,
    "phone_number_id" TEXT,
    "display_name" TEXT,
    "credentials_ref" TEXT,
    "webhook_secret_ref" TEXT,
    "status" "ChannelAccountStatus" NOT NULL,
    "verification_status" TEXT,
    "last_inbound_at" TIMESTAMPTZ,
    "last_error" TEXT,
    "token_expires_at" TIMESTAMPTZ,
    "last_token_check_at" TIMESTAMPTZ,
    "authorized_meta_user_id" TEXT,
    "connected_at" TIMESTAMPTZ,
    "disconnected_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "channel_account_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "body_params" JSONB,
    "meta_status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" UUID NOT NULL,
    "business_id" UUID,
    "channel_account_id" UUID,
    "provider" TEXT NOT NULL,
    "external_event_id" TEXT,
    "payload" JSONB NOT NULL,
    "headers" JSONB,
    "signature_valid" BOOLEAN NOT NULL,
    "processed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "channel_account_id" UUID,
    "source" "ConversationSource" NOT NULL,
    "external_thread_id" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'NEW',
    "ai_enabled" BOOLEAN NOT NULL DEFAULT true,
    "assigned_user_id" UUID,
    "last_intent" TEXT,
    "escalation_reason" TEXT,
    "handoff_priority" "HandoffPriority",
    "handoff_context" JSONB,
    "handoff_at" TIMESTAMPTZ,
    "handoff_completed_at" TIMESTAMPTZ,
    "summary" TEXT,
    "collected_fields" JSONB,
    "snoozed_until" TIMESTAMPTZ,
    "lead_score" INTEGER NOT NULL DEFAULT 0,
    "lead_temperature" "LeadTemperature" NOT NULL DEFAULT 'cold',
    "lead_score_factors" JSONB,
    "lead_scored_at" TIMESTAMPTZ,
    "last_message_at" TIMESTAMPTZ,
    "last_message_preview" TEXT,
    "staff_read_at" TIMESTAMPTZ,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_window_expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_status_events" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "from_status" "ConversationStatus",
    "to_status" "ConversationStatus" NOT NULL,
    "escalation_reason" TEXT,
    "actor_type" TEXT NOT NULL,
    "actor_user_id" UUID,
    "is_test" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "channel_account_id" UUID,
    "direction" "MessageDirection" NOT NULL,
    "sender_type" "SenderType" NOT NULL,
    "sender_user_id" UUID,
    "content" TEXT,
    "content_type" "ContentType" NOT NULL DEFAULT 'text',
    "external_message_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "ai_metadata" JSONB,
    "delivery_status" "MessageDeliveryStatus" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "s3_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_notes" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_assignments" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_by_user_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL,
    "released_at" TIMESTAMPTZ,

    CONSTRAINT "conversation_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "conversation_id" UUID,
    "status" "OrderStatus" NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'NOT_COMPLETED',
    "currency" TEXT NOT NULL,
    "subtotal" DECIMAL(12,3) NOT NULL,
    "delivery_fee" DECIMAL(12,3) NOT NULL,
    "total" DECIMAL(12,3) NOT NULL,
    "customer_snapshot" JSONB NOT NULL,
    "delivery_address" JSONB,
    "created_by_type" TEXT NOT NULL,
    "created_by_user_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "order_confirmed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,3) NOT NULL,
    "name_snapshot" TEXT NOT NULL,
    "sku_snapshot" TEXT,
    "attributes_snapshot" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "raw_text" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "indexing_status" "IndexingStatus" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embeddings" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "source_type" "EmbeddingSource" NOT NULL,
    "source_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agents" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "personality" TEXT,
    "language" TEXT NOT NULL,
    "tone" TEXT,
    "sales_strategy" JSONB,
    "greeting_template" TEXT,
    "fallback_template" TEXT,
    "confidence_threshold" DECIMAL(3,2) NOT NULL DEFAULT 0.65,
    "enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_settings" (
    "business_id" UUID NOT NULL,
    "model_primary" TEXT NOT NULL DEFAULT 'gemini-3.5-flash',
    "model_fallback" TEXT NOT NULL DEFAULT 'gpt-5.6-terra',
    "max_tokens" INTEGER NOT NULL,
    "temperature" DECIMAL(2,1) NOT NULL,
    "rag_top_k" INTEGER NOT NULL,
    "include_product_images_in_context" BOOLEAN NOT NULL DEFAULT false,
    "blocked_topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "custom_system_append" TEXT,
    "reply_mode" "ReplyMode" NOT NULL,
    "lead_hot_min" INTEGER NOT NULL DEFAULT 80,
    "lead_warm_min" INTEGER NOT NULL DEFAULT 50,
    "reservation_ttl_minutes" INTEGER NOT NULL DEFAULT 30,
    "inactivity_close_days" INTEGER NOT NULL DEFAULT 30,
    "monthly_ai_budget_usd" DECIMAL(12,3),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("business_id")
);

-- CreateTable
CREATE TABLE "ai_prompts" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "type" "PromptType" NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" UUID,

    CONSTRAINT "ai_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_actions" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" UUID,
    "action_type" "AiActionType" NOT NULL,
    "tool_name" TEXT,
    "input" JSONB,
    "output" JSONB,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_decision_traces" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "inbound_message_id" UUID NOT NULL,
    "outbound_message_id" UUID,
    "decision_trace" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_decision_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "conversation_id" UUID,
    "message_id" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokens_input" INTEGER NOT NULL,
    "tokens_output" INTEGER NOT NULL,
    "estimated_cost_usd" DECIMAL(12,6) NOT NULL,
    "prompt_version_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_feedback" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" "FeedbackRating" NOT NULL,
    "reason" "FeedbackReason",
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_evaluations" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "score" INTEGER,
    "dimension_scores" JSONB,
    "failure_reason" TEXT,
    "evaluator_type" "EvaluatorType" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "limits" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "period_start" TIMESTAMPTZ NOT NULL,
    "period_end" TIMESTAMPTZ NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "period_bucket" DATE NOT NULL,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_aggregates" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "period_start" TIMESTAMPTZ NOT NULL,
    "period_end" TIMESTAMPTZ NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "usage_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_daily" (
    "business_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "messages_handled" INTEGER NOT NULL,
    "messages_ai" INTEGER NOT NULL,
    "messages_human" INTEGER NOT NULL,
    "orders_created" INTEGER NOT NULL,
    "handoffs_total" INTEGER NOT NULL,
    "handoffs_by_reason" JSONB NOT NULL,
    "conversion_confirmed" INTEGER NOT NULL,
    "conversion_ai_pending" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "analytics_daily_pkey" PRIMARY KEY ("business_id","day")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" UUID NOT NULL,
    "business_id" UUID,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "handoff_priority" "HandoffPriority",
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_user_id_key" ON "oauth_accounts"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_user_id_provider_key" ON "oauth_accounts"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_business_id_key" ON "roles"("name", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_id_deleted_at_key" ON "businesses"("id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "business_members_business_id_user_id_key" ON "business_members"("business_id", "user_id");

-- CreateIndex
CREATE INDEX "business_rules_business_id_rule_type_enabled_effective_from_idx" ON "business_rules"("business_id", "rule_type", "enabled", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_business_id_email_key" ON "invitations"("business_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_business_id_key_key" ON "idempotency_keys"("business_id", "key");

-- CreateIndex
CREATE INDEX "product_categories_business_id_parent_id_sort_order_idx" ON "product_categories"("business_id", "parent_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_id_business_id_key" ON "product_categories"("id", "business_id");

-- CreateIndex
CREATE INDEX "products_business_id_status_idx" ON "products"("business_id", "status");

-- CreateIndex
CREATE INDEX "products_business_id_category_id_idx" ON "products"("business_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_id_business_id_key" ON "products"("id", "business_id");

-- CreateIndex
CREATE INDEX "product_variants_business_id_product_id_idx" ON "product_variants"("business_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_id_business_id_key" ON "product_variants"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_business_id_sku_key" ON "product_variants"("business_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_is_default_key" ON "product_variants"("product_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "product_images_product_id_is_primary_key" ON "product_images"("product_id", "is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "product_images_variant_id_is_primary_key" ON "product_images"("variant_id", "is_primary");

-- CreateIndex
CREATE INDEX "stock_reservations_variant_id_status_expires_at_idx" ON "stock_reservations"("variant_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "stock_reservations_conversation_id_status_idx" ON "stock_reservations"("conversation_id", "status");

-- CreateIndex
CREATE INDEX "stock_reservations_expires_at_idx" ON "stock_reservations"("expires_at");

-- CreateIndex
CREATE INDEX "customers_business_id_lifecycle_stage_idx" ON "customers"("business_id", "lifecycle_stage");

-- CreateIndex
CREATE INDEX "customers_business_id_phone_idx" ON "customers"("business_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_id_business_id_key" ON "customers"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identities_business_id_platform_platform_user_id_key" ON "customer_identities"("business_id", "platform", "platform_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identities_business_id_phone_number_key" ON "customer_identities"("business_id", "phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "customer_tags_customer_id_tag_key" ON "customer_tags"("customer_id", "tag");

-- CreateIndex
CREATE INDEX "channel_accounts_authorized_meta_user_id_idx" ON "channel_accounts"("authorized_meta_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_accounts_business_id_channel_external_account_id_key" ON "channel_accounts"("business_id", "channel", "external_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_channel_account_id_name_language_key" ON "message_templates"("channel_account_id", "name", "language");

-- CreateIndex
CREATE INDEX "integration_events_created_at_idx" ON "integration_events"("created_at");

-- CreateIndex
CREATE INDEX "conversations_business_id_status_handoff_priority_handoff_a_idx" ON "conversations"("business_id", "status", "handoff_priority", "handoff_at");

-- CreateIndex
CREATE INDEX "conversations_business_id_assigned_user_id_status_idx" ON "conversations"("business_id", "assigned_user_id", "status");

-- CreateIndex
CREATE INDEX "conversations_business_id_lead_temperature_lead_score_idx" ON "conversations"("business_id", "lead_temperature", "lead_score" DESC);

-- CreateIndex
CREATE INDEX "conversations_business_id_customer_id_idx" ON "conversations"("business_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_id_business_id_key" ON "conversations"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_channel_account_id_external_thread_id_key" ON "conversations"("channel_account_id", "external_thread_id");

-- CreateIndex
CREATE INDEX "conversation_status_events_business_id_created_at_idx" ON "conversation_status_events"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "conversation_status_events_conversation_id_created_at_idx" ON "conversation_status_events"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "conversation_status_events_business_id_to_status_created_at_idx" ON "conversation_status_events"("business_id", "to_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_idempotency_key_key" ON "messages"("idempotency_key");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_business_id_created_at_idx" ON "messages"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_id_business_id_key" ON "messages"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_channel_account_id_external_message_id_key" ON "messages"("channel_account_id", "external_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_attachments_message_id_sort_order_key" ON "message_attachments"("message_id", "sort_order");

-- CreateIndex
CREATE INDEX "conversation_assignments_conversation_id_idx" ON "conversation_assignments"("conversation_id");

-- CreateIndex
CREATE INDEX "orders_business_id_status_created_at_idx" ON "orders"("business_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_business_id_conversation_id_idx" ON "orders"("business_id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_id_business_id_key" ON "orders"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_business_id_idempotency_key_key" ON "orders"("business_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "embeddings_business_id_source_type_idx" ON "embeddings"("business_id", "source_type");

-- CreateIndex
CREATE UNIQUE INDEX "embeddings_business_id_source_type_source_id_chunk_index_key" ON "embeddings"("business_id", "source_type", "source_id", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agents_business_id_key" ON "ai_agents"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompts_business_id_type_version_key" ON "ai_prompts"("business_id", "type", "version");

-- CreateIndex
CREATE INDEX "ai_actions_business_id_created_at_idx" ON "ai_actions"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_actions_conversation_id_created_at_idx" ON "ai_actions"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_decision_traces_conversation_id_created_at_idx" ON "ai_decision_traces"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_business_id_created_at_idx" ON "ai_usage"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_business_id_model_created_at_idx" ON "ai_usage"("business_id", "model", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_feedback_message_id_user_id_key" ON "ai_feedback"("message_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_business_id_key" ON "subscriptions"("business_id");

-- CreateIndex
CREATE INDEX "usage_events_business_id_metric_recorded_at_idx" ON "usage_events"("business_id", "metric", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_aggregates_business_id_period_start_metric_key" ON "usage_aggregates"("business_id", "period_start", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_business_id_feature_key" ON "feature_flags"("business_id", "feature");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_handoff_priority_created_at_idx" ON "notifications"("user_id", "read_at", "handoff_priority", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "audit_logs_business_id_created_at_idx" ON "audit_logs"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_business_id_entity_type_entity_id_idx" ON "audit_logs"("business_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_onboarding" ADD CONSTRAINT "business_onboarding_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_business_id_fkey" FOREIGN KEY ("parent_id", "business_id") REFERENCES "product_categories"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_business_id_fkey" FOREIGN KEY ("category_id", "business_id") REFERENCES "product_categories"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_business_id_fkey" FOREIGN KEY ("product_id", "business_id") REFERENCES "products"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_business_id_fkey" FOREIGN KEY ("product_id", "business_id") REFERENCES "products"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_business_id_fkey" FOREIGN KEY ("variant_id", "business_id") REFERENCES "product_variants"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_variant_id_business_id_fkey" FOREIGN KEY ("variant_id", "business_id") REFERENCES "product_variants"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_business_id_fkey" FOREIGN KEY ("variant_id", "business_id") REFERENCES "product_variants"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_import_runs" ADD CONSTRAINT "catalog_import_runs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_merged_into_customer_id_business_id_fkey" FOREIGN KEY ("merged_into_customer_id", "business_id") REFERENCES "customers"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_identities" ADD CONSTRAINT "customer_identities_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_identities" ADD CONSTRAINT "customer_identities_customer_id_business_id_fkey" FOREIGN KEY ("customer_id", "business_id") REFERENCES "customers"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_customer_id_business_id_fkey" FOREIGN KEY ("customer_id", "business_id") REFERENCES "customers"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customer_id_business_id_fkey" FOREIGN KEY ("customer_id", "business_id") REFERENCES "customers"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_business_id_fkey" FOREIGN KEY ("customer_id", "business_id") REFERENCES "customers"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_status_events" ADD CONSTRAINT "conversation_status_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_status_events" ADD CONSTRAINT "conversation_status_events_conversation_id_business_id_fkey" FOREIGN KEY ("conversation_id", "business_id") REFERENCES "conversations"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_business_id_fkey" FOREIGN KEY ("conversation_id", "business_id") REFERENCES "conversations"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_business_id_fkey" FOREIGN KEY ("message_id", "business_id") REFERENCES "messages"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_conversation_id_business_id_fkey" FOREIGN KEY ("conversation_id", "business_id") REFERENCES "conversations"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_conversation_id_business_id_fkey" FOREIGN KEY ("conversation_id", "business_id") REFERENCES "conversations"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_business_id_fkey" FOREIGN KEY ("customer_id", "business_id") REFERENCES "customers"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_business_id_fkey" FOREIGN KEY ("order_id", "business_id") REFERENCES "orders"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_business_id_fkey" FOREIGN KEY ("variant_id", "business_id") REFERENCES "product_variants"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_conversation_id_business_id_fkey" FOREIGN KEY ("conversation_id", "business_id") REFERENCES "conversations"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_message_id_business_id_fkey" FOREIGN KEY ("message_id", "business_id") REFERENCES "messages"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_decision_traces" ADD CONSTRAINT "ai_decision_traces_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_decision_traces" ADD CONSTRAINT "ai_decision_traces_conversation_id_business_id_fkey" FOREIGN KEY ("conversation_id", "business_id") REFERENCES "conversations"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_decision_traces" ADD CONSTRAINT "ai_decision_traces_inbound_message_id_business_id_fkey" FOREIGN KEY ("inbound_message_id", "business_id") REFERENCES "messages"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_decision_traces" ADD CONSTRAINT "ai_decision_traces_outbound_message_id_business_id_fkey" FOREIGN KEY ("outbound_message_id", "business_id") REFERENCES "messages"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_conversation_id_business_id_fkey" FOREIGN KEY ("conversation_id", "business_id") REFERENCES "conversations"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_message_id_business_id_fkey" FOREIGN KEY ("message_id", "business_id") REFERENCES "messages"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_prompt_version_id_fkey" FOREIGN KEY ("prompt_version_id") REFERENCES "ai_prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_message_id_business_id_fkey" FOREIGN KEY ("message_id", "business_id") REFERENCES "messages"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_evaluations" ADD CONSTRAINT "ai_evaluations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_evaluations" ADD CONSTRAINT "ai_evaluations_conversation_id_business_id_fkey" FOREIGN KEY ("conversation_id", "business_id") REFERENCES "conversations"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_aggregates" ADD CONSTRAINT "usage_aggregates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Vector cosine index
CREATE INDEX IF NOT EXISTS embeddings_hnsw_cosine
  ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
