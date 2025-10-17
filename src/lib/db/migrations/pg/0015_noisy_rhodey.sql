CREATE TABLE "contractor_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_name" text,
	"company_size" varchar,
	"primary_location" text,
	"service_areas" json DEFAULT '[]'::json,
	"primary_trade" text,
	"specialties" json DEFAULT '[]'::json,
	"project_types" json DEFAULT '[]'::json,
	"years_in_business" integer,
	"license_number" text,
	"insurance_info" json DEFAULT '{}'::json,
	"labor_pricing_file" text,
	"material_pricing_file" text,
	"pricing_notes" text,
	"interests" json DEFAULT '[]'::json,
	"goals" text,
	"website" text,
	"phone" text,
	"additional_info" text,
	"is_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "contractor_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "ea_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"client_id" text NOT NULL,
	"job_id" text,
	"source_path" text NOT NULL,
	"source_type" varchar NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(3072),
	"metadata" json DEFAULT '{}'::json,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ea_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"client_id" text NOT NULL,
	"job_id" text,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"estimate" numeric(12, 2) NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"reasoning" json NOT NULL,
	"sources" json NOT NULL,
	"breakdown" json NOT NULL,
	"uncertainty" json NOT NULL,
	"narrative" text NOT NULL,
	"metadata" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ea_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"description" text,
	"client_id" text NOT NULL,
	"project_id" text NOT NULL,
	"labor_rate" numeric(10, 2),
	"material_costs" json DEFAULT '{}'::json,
	"estimated_cost" numeric(12, 2),
	"actual_cost" numeric(12, 2),
	"status" varchar DEFAULT 'planning' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"last_updated" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ea_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar NOT NULL,
	"timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"client_id" text,
	"user_id" text,
	"session_id" text,
	"project_id" text,
	"job_id" text,
	"payload" json NOT NULL,
	"severity" varchar DEFAULT 'info' NOT NULL,
	"source" text,
	"duration" integer,
	"success" boolean
);
--> statement-breakpoint
CREATE TABLE "ea_tool_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_name" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"project_id" text,
	"job_id" text,
	"success" boolean NOT NULL,
	"duration" integer NOT NULL,
	"error" text,
	"request_payload" json,
	"response_payload" json,
	"timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contractor_profile" ADD CONSTRAINT "contractor_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ea_documents_client_job_idx" ON "ea_documents" USING btree ("client_id","job_id");--> statement-breakpoint
CREATE INDEX "ea_documents_source_idx" ON "ea_documents" USING btree ("source_path","source_type");--> statement-breakpoint
CREATE INDEX "ea_documents_project_idx" ON "ea_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ea_estimates_project_idx" ON "ea_estimates" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ea_estimates_client_idx" ON "ea_estimates" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ea_estimates_session_idx" ON "ea_estimates" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ea_estimates_user_idx" ON "ea_estimates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ea_estimates_created_idx" ON "ea_estimates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ea_jobs_client_idx" ON "ea_jobs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ea_jobs_project_idx" ON "ea_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ea_jobs_status_idx" ON "ea_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ea_logs_event_type_idx" ON "ea_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "ea_logs_timestamp_idx" ON "ea_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "ea_logs_client_idx" ON "ea_logs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ea_logs_user_idx" ON "ea_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ea_logs_session_idx" ON "ea_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ea_logs_severity_idx" ON "ea_logs" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "ea_tool_usage_tool_idx" ON "ea_tool_usage" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX "ea_tool_usage_client_idx" ON "ea_tool_usage" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ea_tool_usage_user_idx" ON "ea_tool_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ea_tool_usage_timestamp_idx" ON "ea_tool_usage" USING btree ("timestamp");