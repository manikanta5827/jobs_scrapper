import { pgTable, text, timestamp, serial, doublePrecision, date } from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  jobLink: text("job_link").primaryKey(),
  fingerprint: text("fingerprint").unique(),
  seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow(),
});

export const keyRotation = pgTable("key_rotation", {
  id: serial("id").primaryKey(),
  apiKey: text("api_key").notNull().unique(),
  usageCost: doublePrecision("usage_cost").default(0), // Tracking in $
  name: text("name"), // Optional friendly name for easier identification
  subscriptionStartDate: date("subscription_start_date").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
