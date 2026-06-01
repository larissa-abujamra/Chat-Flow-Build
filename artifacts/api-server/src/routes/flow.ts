import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, flowsTable, type FlowRow } from "@workspace/db";
import { GetFlowResponse, UpdateFlowBody, UpdateFlowResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const FLOW_ID = "default";

function serialize(row: FlowRow) {
  return {
    id: row.id,
    name: row.name,
    startNodeId: row.startNodeId,
    nodes: row.nodes,
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/flow", async (req, res) => {
  let [row] = await db
    .select()
    .from(flowsTable)
    .where(eq(flowsTable.id, FLOW_ID));

  if (!row) {
    [row] = await db
      .insert(flowsTable)
      .values({ id: FLOW_ID, name: "Untitled Flow", startNodeId: null, nodes: [] })
      .returning();
    req.log.info("Created default flow");
  }

  res.json(GetFlowResponse.parse(serialize(row)));
});

router.put("/flow", async (req, res) => {
  const parsed = UpdateFlowBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid flow", details: parsed.error.issues });
    return;
  }

  const { name, startNodeId, nodes } = parsed.data;

  const [row] = await db
    .insert(flowsTable)
    .values({ id: FLOW_ID, name, startNodeId, nodes })
    .onConflictDoUpdate({
      target: flowsTable.id,
      set: { name, startNodeId, nodes },
    })
    .returning();

  res.json(UpdateFlowResponse.parse(serialize(row)));
});

export default router;
