ALTER TABLE "guides" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_parent_id_guides_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."guides"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guides_parent_idx" ON "guides" USING btree ("parent_id");