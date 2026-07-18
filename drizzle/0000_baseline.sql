CREATE OR REPLACE FUNCTION uuid_v7()
RETURNS uuid
LANGUAGE sql
VOLATILE
AS $$
  WITH ts AS (
    SELECT lpad(to_hex(floor(extract(epoch from clock_timestamp()) * 1000)::bigint), 12, '0') AS v
  ),
  rb AS (
    SELECT md5(random()::text || clock_timestamp()::text || random()::text) AS v
  ),
  va AS (
    SELECT substr('89ab', floor(random() * 4)::int + 1, 1) AS v
  )
  SELECT (
    substr(ts.v, 1, 8) || '-' ||
    substr(ts.v, 9, 4) || '-' ||
    '7' || substr(rb.v, 1, 3) || '-' ||
    va.v || substr(rb.v, 4, 3) || '-' ||
    substr(rb.v, 7, 12)
  )::uuid
  FROM ts, rb, va;
$$;

--> statement-breakpoint
CREATE TYPE "public"."account_side" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."balance_snapshot_event_type" AS ENUM('TX_APPLIED', 'HOLD_CREATED', 'HOLD_COMMITTED', 'HOLD_VOIDED', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."entry_direction" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."hold_state" AS ENUM('HELD', 'APPLIED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."overdraft_policy" AS ENUM('ALLOW', 'DISALLOW');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_result_status" AS ENUM('matched', 'unmatched_external', 'unmatched_internal', 'mismatched', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_run_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."transaction_relation_type" AS ENUM('REVERSAL', 'CORRECTION');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"name" text NOT NULL,
	"side" "account_side" NOT NULL,
	"overdraft_policy" "overdraft_policy" DEFAULT 'ALLOW' NOT NULL,
	"currency" text NOT NULL,
	"balance_minor" bigint DEFAULT 0 NOT NULL,
	"inflight_debit_minor" bigint DEFAULT 0 NOT NULL,
	"inflight_credit_minor" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_role_chk" CHECK ("api_keys"."role" in ('ADMIN', 'SERVICE'))
);
--> statement-breakpoint
CREATE TABLE "balance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"event_type" "balance_snapshot_event_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"posted_minor" bigint NOT NULL,
	"inflight_debit_minor" bigint NOT NULL,
	"inflight_credit_minor" bigint NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" "entry_direction" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hold_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hold_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" "entry_direction" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holds" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"currency" text NOT NULL,
	"description" text,
	"state" "hold_state" DEFAULT 'HELD' NOT NULL,
	"original_amount_minor" bigint NOT NULL,
	"remaining_amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ledgers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recon_records" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"source" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"reference" text NOT NULL,
	"description" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recon_results" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"external_record_id" uuid,
	"external_id" text,
	"transaction_id" uuid,
	"status" "reconciliation_result_status" NOT NULL,
	"reason" text NOT NULL,
	"candidate_transaction_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recon_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"criteria" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recon_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"strategy" text NOT NULL,
	"status" "reconciliation_run_status" DEFAULT 'pending' NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"matched_count" bigint DEFAULT 0 NOT NULL,
	"unmatched_external_count" bigint DEFAULT 0 NOT NULL,
	"unmatched_internal_count" bigint DEFAULT 0 NOT NULL,
	"mismatched_count" bigint DEFAULT 0 NOT NULL,
	"conflict_count" bigint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "recon_runs_strategy_ck" CHECK ("recon_runs"."strategy" = 'one_to_one')
);
--> statement-breakpoint
CREATE TABLE "recon_uploads" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source" text NOT NULL,
	"record_count" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"hold_id" uuid,
	"related_transaction_id" uuid,
	"relation_type" "transaction_relation_type",
	"reference" text NOT NULL,
	"currency" text NOT NULL,
	"description" text,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_relation_pair_ck" CHECK (("transactions"."related_transaction_id" is null and "transactions"."relation_type" is null) or ("transactions"."related_transaction_id" is not null and "transactions"."relation_type" is not null))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "hold_entries" ADD CONSTRAINT "hold_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "hold_entries" ADD CONSTRAINT "hold_entries_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "hold_entries" ADD CONSTRAINT "hold_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recon_records" ADD CONSTRAINT "recon_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recon_records" ADD CONSTRAINT "recon_records_upload_id_recon_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."recon_uploads"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recon_results" ADD CONSTRAINT "recon_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recon_results" ADD CONSTRAINT "recon_results_run_id_recon_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."recon_runs"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recon_results" ADD CONSTRAINT "recon_results_external_record_id_recon_records_id_fk" FOREIGN KEY ("external_record_id") REFERENCES "public"."recon_records"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recon_results" ADD CONSTRAINT "recon_results_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recon_rules" ADD CONSTRAINT "recon_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recon_runs" ADD CONSTRAINT "recon_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recon_runs" ADD CONSTRAINT "recon_runs_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recon_runs" ADD CONSTRAINT "recon_runs_upload_id_recon_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."recon_uploads"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recon_uploads" ADD CONSTRAINT "recon_uploads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_related_transaction_id_transactions_id_fk" FOREIGN KEY ("related_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "accounts_tenant_id_idx" ON "accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "accounts_ledger_id_idx" ON "accounts" USING btree ("ledger_id");--> statement-breakpoint
CREATE INDEX "api_keys_tenant_id_idx" ON "api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_uq" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "balance_snapshots_as_of_idx" ON "balance_snapshots" USING btree ("tenant_id","account_id","effective_at");--> statement-breakpoint
CREATE INDEX "balance_snapshots_source_idx" ON "balance_snapshots" USING btree ("tenant_id","source_id","event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "balance_snapshots_dedup_uq" ON "balance_snapshots" USING btree ("tenant_id","event_type","source_id","account_id");--> statement-breakpoint
CREATE INDEX "entries_tenant_id_idx" ON "entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "entries_transaction_id_idx" ON "entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "entries_account_id_idx" ON "entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "hold_entries_tenant_id_idx" ON "hold_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "hold_entries_hold_id_idx" ON "hold_entries" USING btree ("hold_id");--> statement-breakpoint
CREATE INDEX "hold_entries_account_id_idx" ON "hold_entries" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "holds_tenant_reference_uq" ON "holds" USING btree ("tenant_id","reference");--> statement-breakpoint
CREATE INDEX "holds_ledger_id_idx" ON "holds" USING btree ("ledger_id");--> statement-breakpoint
CREATE INDEX "ledgers_tenant_id_idx" ON "ledgers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "recon_records_upload_idx" ON "recon_records" USING btree ("tenant_id","upload_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recon_records_source_external_uq" ON "recon_records" USING btree ("tenant_id","source","external_id");--> statement-breakpoint
CREATE INDEX "recon_results_run_idx" ON "recon_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "recon_results_tenant_status_idx" ON "recon_results" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "recon_rules_tenant_idx" ON "recon_rules" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recon_rules_tenant_name_uq" ON "recon_rules" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "recon_runs_tenant_idx" ON "recon_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "recon_runs_upload_idx" ON "recon_runs" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "recon_uploads_tenant_idx" ON "recon_uploads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "recon_uploads_source_idx" ON "recon_uploads" USING btree ("tenant_id","source");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_tenant_reference_uq" ON "transactions" USING btree ("tenant_id","reference");--> statement-breakpoint
CREATE INDEX "transactions_effective_at_idx" ON "transactions" USING btree ("tenant_id","effective_at");--> statement-breakpoint
CREATE INDEX "transactions_ledger_id_idx" ON "transactions" USING btree ("ledger_id");--> statement-breakpoint
CREATE INDEX "transactions_hold_id_idx" ON "transactions" USING btree ("hold_id");--> statement-breakpoint
CREATE INDEX "transactions_related_transaction_id_idx" ON "transactions" USING btree ("related_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_relation_uq" ON "transactions" USING btree ("tenant_id","relation_type","related_transaction_id") WHERE "transactions"."related_transaction_id" is not null;