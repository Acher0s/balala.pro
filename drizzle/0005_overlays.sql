CREATE TABLE "overlays" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "overlays" ADD CONSTRAINT "overlays_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "overlays_owner_idx" ON "overlays" USING btree ("owner_id");