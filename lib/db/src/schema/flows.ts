import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface FlowBranchData {
  id: string;
  label: string;
  targetNodeId: string | null;
  color?: string | null;
}

export interface FlowNodeData {
  id: string;
  question: string;
  branches: FlowBranchData[];
  position?: { x: number; y: number };
}

export const flowsTable = pgTable("flows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startNodeId: text("start_node_id"),
  nodes: jsonb("nodes").$type<FlowNodeData[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertFlowSchema = createInsertSchema(flowsTable).omit({
  updatedAt: true,
});
export type InsertFlow = z.infer<typeof insertFlowSchema>;
export type FlowRow = typeof flowsTable.$inferSelect;

export const flowVersionsTable = pgTable("flow_versions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  notes: text("notes"),
  startNodeId: text("start_node_id"),
  nodes: jsonb("nodes").$type<FlowNodeData[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type FlowVersionRow = typeof flowVersionsTable.$inferSelect;
