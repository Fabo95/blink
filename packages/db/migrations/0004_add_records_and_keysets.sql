CREATE TABLE "records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"cipher" jsonb NOT NULL,
	"hlc_physical" bigint NOT NULL,
	"hlc_counter" integer NOT NULL,
	"hlc_node_id" text NOT NULL,
	"seq" bigserial NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_keysets" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"wrapped_vmk" jsonb NOT NULL,
	"kdf_salt" text NOT NULL,
	"kdf_iterations" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "records_owner_seq_idx" ON "records" USING btree ("owner_id","seq");