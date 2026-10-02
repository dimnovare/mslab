ALTER TYPE "public"."request_kind" ADD VALUE 'change_request';--> statement-breakpoint
CREATE TABLE "client_favourites" (
	"client_id" integer NOT NULL,
	"course_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_favourites_client_id_course_id_pk" PRIMARY KEY("client_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "client_login_tokens" (
	"hash" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "client_sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT 'et' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_access" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"course_id" integer NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mail_quota" (
	"day" text PRIMARY KEY NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terms_acceptances" (
	"client_id" integer NOT NULL,
	"course_id" integer NOT NULL,
	"terms_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_acceptances_client_id_course_id_terms_version_pk" PRIMARY KEY("client_id","course_id","terms_version")
);
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "client_id" integer;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "client_id" integer;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "client_id" integer;--> statement-breakpoint
ALTER TABLE "client_favourites" ADD CONSTRAINT "client_favourites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_favourites" ADD CONSTRAINT "client_favourites_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_sessions" ADD CONSTRAINT "client_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_login_tokens_email" ON "client_login_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "client_sessions_client" ON "client_sessions" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_email" ON "clients" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "course_access_client_course" ON "course_access" USING btree ("client_id","course_id");--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registrations_client" ON "registrations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "registrations_email_lower" ON "registrations" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "requests_client" ON "requests" USING btree ("client_id");