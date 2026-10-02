CREATE TABLE "kv_entries" (
	"key" text COLLATE "C" PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "kv_entries_expires_at" ON "kv_entries" USING btree ("expires_at") WHERE "kv_entries"."expires_at" is not null;