import { Router, type IRouter } from "express";
import { SendChatBody, SendChatResponse } from "@workspace/api-zod";
import { openai } from "../lib/openai";

const router: IRouter = Router();

interface Branch {
  id: string;
  label: string;
  targetNodeId: string | null;
}
interface Node {
  id: string;
  question: string;
  branches: Branch[];
}

router.post("/chat", async (req, res) => {
  const parsed = SendChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid chat input", details: parsed.error.issues });
    return;
  }

  const { flow, messages, currentNodeId } = parsed.data;
  const nodes = (flow.nodes ?? []) as Node[];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Empty flow guard
  if (nodes.length === 0 || !flow.startNodeId || !nodeMap.has(flow.startNodeId)) {
    res.json(
      SendChatResponse.parse({
        reply:
          "This flow has no questions yet. Add a node and pick a start node to begin.",
        currentNodeId: null,
        matchedBranchId: null,
        done: true,
      }),
    );
    return;
  }

  // Start of conversation: present the start node's question.
  if (!currentNodeId) {
    const startNode = nodeMap.get(flow.startNodeId)!;
    res.json(
      SendChatResponse.parse({
        reply: startNode.question,
        currentNodeId: startNode.id,
        matchedBranchId: null,
        done: startNode.branches.length === 0,
      }),
    );
    return;
  }

  const currentNode = nodeMap.get(currentNodeId);
  if (!currentNode || currentNode.branches.length === 0) {
    res.json(
      SendChatResponse.parse({
        reply: "This conversation has ended. Restart to try a different path.",
        currentNodeId: null,
        matchedBranchId: null,
        done: true,
      }),
    );
    return;
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    res.json(
      SendChatResponse.parse({
        reply: currentNode.question,
        currentNodeId: currentNode.id,
        matchedBranchId: null,
        done: false,
      }),
    );
    return;
  }

  // Describe each branch and where it leads so the LLM can phrase a natural reply.
  const branchDescriptions = currentNode.branches.map((b) => {
    const target = b.targetNodeId ? nodeMap.get(b.targetNodeId) : null;
    const next = target
      ? `next question: "${target.question}"`
      : "ends the conversation";
    return `- id "${b.id}": answer means "${b.label}" -> ${next}`;
  });

  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const systemPrompt = `You are driving a branching conversational flow. The user is currently being asked this question:
"${currentNode.question}"

The possible answer branches are:
${branchDescriptions.join("\n")}

Decide which branch the user's latest message best matches. Then write a short, natural assistant reply:
- If a branch matches and it leads to a next question, briefly acknowledge the answer, then ask that next question (you may rephrase it naturally, keeping its meaning).
- If a branch matches and it ends the conversation, give a brief, friendly closing message.
- If no branch clearly matches, set matchedBranchId to null and handle it like a helpful assistant:
  - If the user's message is an off-topic question, comment, or request (e.g. a general question, a doubt, small talk), ANSWER it helpfully and naturally first, staying in the same persona, language, and tone as the conversation so far. Then smoothly steer back by re-asking the current question.
  - NEVER invent facts you do not have — especially prices, dates, availability, or policies. If you don't know, say you'll confirm and continue.
  - If the message is just unclear or empty, simply re-ask the current question, clarifying the available options.

Always reply in the same language as the conversation. Respond ONLY as JSON: {"matchedBranchId": <branch id string or null>, "reply": <string>}.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Conversation so far:\n${transcript}\n\nThe user's latest message: "${lastUser.content}"`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const result = JSON.parse(raw) as {
      matchedBranchId?: string | null;
      reply?: string;
    };

    const matched = result.matchedBranchId
      ? currentNode.branches.find((b) => b.id === result.matchedBranchId)
      : undefined;

    if (!matched) {
      res.json(
        SendChatResponse.parse({
          reply: result.reply ?? currentNode.question,
          currentNodeId: currentNode.id,
          matchedBranchId: null,
          done: false,
        }),
      );
      return;
    }

    const target = matched.targetNodeId ? nodeMap.get(matched.targetNodeId) : null;
    if (!target) {
      res.json(
        SendChatResponse.parse({
          reply: result.reply ?? "Thanks, that's everything for now.",
          currentNodeId: null,
          matchedBranchId: matched.id,
          done: true,
        }),
      );
      return;
    }

    res.json(
      SendChatResponse.parse({
        reply: result.reply ?? target.question,
        currentNodeId: target.id,
        matchedBranchId: matched.id,
        done: target.branches.length === 0,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Chat completion failed");
    res.status(502).json({ error: "Failed to generate a reply" });
  }
});

export default router;
