import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, flowVersionsTable, type FlowVersionRow } from "@workspace/db";
import {
  ListFlowVersionsResponse,
  CreateFlowVersionBody,
  RenameFlowVersionBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serialize(row: FlowVersionRow) {
  return {
    id: row.id,
    name: row.name,
    startNodeId: row.startNodeId,
    nodes: row.nodes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const DEFAULT_NAME_RE = /^Flow Chart v(\d+)$/;

router.get("/versions", async (_req, res) => {
  const rows = await db
    .select()
    .from(flowVersionsTable)
    .orderBy(desc(flowVersionsTable.createdAt), desc(flowVersionsTable.id));

  res.json(ListFlowVersionsResponse.parse(rows.map(serialize)));
});

router.post("/versions", async (req, res) => {
  const parsed = CreateFlowVersionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid version", details: parsed.error.issues });
    return;
  }

  const { name, startNodeId, nodes } = parsed.data;

  let finalName = name?.trim() ?? "";
  if (!finalName) {
    const rows = await db.select({ name: flowVersionsTable.name }).from(flowVersionsTable);
    const maxN = rows.reduce((max, r) => {
      const m = DEFAULT_NAME_RE.exec(r.name);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0);
    finalName = `Flow Chart v${maxN + 1}`;
  }

  const [row] = await db
    .insert(flowVersionsTable)
    .values({ id: crypto.randomUUID(), name: finalName, startNodeId, nodes })
    .returning();

  req.log.info({ id: row.id, name: row.name }, "Created flow version");
  res.status(201).json(serialize(row));
});

router.patch("/versions/:id", async (req, res) => {
  const parsed = RenameFlowVersionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid version", details: parsed.error.issues });
    return;
  }

  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Name cannot be empty" });
    return;
  }

  const [row] = await db
    .update(flowVersionsTable)
    .set({ name })
    .where(eq(flowVersionsTable.id, req.params.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  res.json(serialize(row));
});

router.delete("/versions/:id", async (req, res) => {
  const [row] = await db
    .delete(flowVersionsTable)
    .where(eq(flowVersionsTable.id, req.params.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  res.status(204).end();
});

export default router;
