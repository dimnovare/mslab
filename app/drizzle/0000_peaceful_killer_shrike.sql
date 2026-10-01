CREATE TYPE "public"."course_level" AS ENUM('basic', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."course_type" AS ENUM('e_learning', 'contact');--> statement-breakpoint
CREATE TYPE "public"."payment_choice" AS ENUM('full', 'half');--> statement-breakpoint
CREATE TYPE "public"."registration_kind" AS ENUM('group', 'individual');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('awaiting_prepayment', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."request_kind" AS ENUM('contact', 'individual', 'practice', 'waitlist');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'cancelled');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"kicker" jsonb NOT NULL,
	"title" jsonb NOT NULL,
	"text" jsonb NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"cta_label" jsonb NOT NULL,
	"cta_href" text NOT NULL,
	"image_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"key" text NOT NULL,
	"alt" jsonb,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"city" text NOT NULL,
	"venue" text DEFAULT '' NOT NULL,
	"language" text DEFAULT 'ET' NOT NULL,
	"capacity" integer DEFAULT 4 NOT NULL,
	"status" "session_status" DEFAULT 'scheduled' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"type" "course_type" NOT NULL,
	"level" "course_level" NOT NULL,
	"title" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"includes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text DEFAULT 'ET' NOT NULL,
	"price" integer,
	"price_group" integer,
	"price_individual" integer,
	"access_months" integer,
	"video_count" integer,
	"duration_label" jsonb,
	"next_discount" jsonb,
	"badge" jsonb,
	"recommendation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faq" (
	"id" serial PRIMARY KEY NOT NULL,
	"q" jsonb NOT NULL,
	"a" jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"group" text NOT NULL,
	"key" text NOT NULL,
	"alt" jsonb,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hero_slides" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_key" text NOT NULL,
	"image_pos" text DEFAULT '50% 50%' NOT NULL,
	"image_pos_mobile" text DEFAULT '50% 50%' NOT NULL,
	"tone" text DEFAULT 'light' NOT NULL,
	"kicker" jsonb NOT NULL,
	"title" jsonb NOT NULL,
	"text" jsonb NOT NULL,
	"cta_label" jsonb NOT NULL,
	"cta_href" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"key" text PRIMARY KEY NOT NULL,
	"title" jsonb NOT NULL,
	"body" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" jsonb NOT NULL,
	"excerpt" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"category" jsonb NOT NULL,
	"cover_key" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_packages" (
	"code" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"tagline" jsonb NOT NULL,
	"models" integer NOT NULL,
	"duration_label" jsonb NOT NULL,
	"price" integer NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"course_session_id" integer,
	"kind" "registration_kind" NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"payment_choice" "payment_choice" NOT NULL,
	"wants_model_help" boolean DEFAULT false NOT NULL,
	"wants_account" boolean DEFAULT false NOT NULL,
	"preferred_period" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT 'et' NOT NULL,
	"status" "registration_status" DEFAULT 'awaiting_prepayment' NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "request_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"handled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"locale" text DEFAULT 'et' NOT NULL,
	"token" text NOT NULL,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "course_images" ADD CONSTRAINT "course_images_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_course_session_id_course_sessions_id_fk" FOREIGN KEY ("course_session_id") REFERENCES "public"."course_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_images_course" ON "course_images" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_slug" ON "courses" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_slug" ON "posts" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_email" ON "subscribers" USING btree ("email");