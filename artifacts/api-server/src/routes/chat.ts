import { Router, type IRouter } from "express";
import { SendChatBody, SendChatResponse } from "@workspace/api-zod";
import { openai } from "../lib/openai";
import { getOpenRouter, SONAR_SEARCH_MODEL } from "../lib/openrouter";

const router: IRouter = Router();

// A node with this id triggers a web research step: when the conversation
// advances INTO it, the server uses Perplexity Sonar to look up preliminary
// public info about the company (from the onboarding transcript) and prepends
// that summary to the node's reply. Flow advancement is unchanged otherwise.
const RESEARCH_NODE_ID = "companyResearch";

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
- If a branch matches and it leads to a next question, briefly acknowledge the answer, then ask that next question (you may rephrase it naturally, keeping its meaning). Set offTopicQuestion to false.
- If a branch matches and it ends the conversation, give a brief, friendly closing message. Set offTopicQuestion to false.
- If no branch clearly matches, set matchedBranchId to null:
  - If the user's latest message is an off-topic question or request that needs real-world / factual information to answer well (e.g. a general knowledge question, current prices, dates, availability, news, "what is X", "how do I Y"), set offTopicQuestion to true. In that case leave "reply" as just a natural re-ask of the current question (clarifying the available options) — a separate web-search step will supply the factual answer, so do NOT try to answer the question yourself.
  - If the message is small talk, a simple comment, or just unclear/empty, set offTopicQuestion to false and simply re-ask the current question, clarifying the available options. NEVER invent facts.

Always reply in the same language as the conversation. Respond ONLY as JSON: {"matchedBranchId": <branch id string or null>, "offTopicQuestion": <boolean>, "reply": <string>}.`;

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
      offTopicQuestion?: boolean;
      reply?: string;
    };

    let matched = result.matchedBranchId
      ? currentNode.branches.find((b) => b.id === result.matchedBranchId)
      : undefined;

    // Single-branch (open-ended) nodes advance on any genuine answer, even when
    // the classifier is unsure — unless the user actually asked an off-topic
    // question (handled below). Keeps linear data-collection from stalling.
    let forcedAdvance = false;
    if (!matched && currentNode.branches.length === 1 && result.offTopicQuestion !== true) {
      matched = currentNode.branches[0];
      forcedAdvance = true;
    }

    if (!matched) {
      const reAsk = result.reply ?? currentNode.question;
      let reply = reAsk;

      // Off-script question: answer it with a real web search (Perplexity Sonar Pro),
      // then steer back by re-asking the current question. Flow does NOT advance.
      const openrouter = getOpenRouter();
      if (result.offTopicQuestion === true && openrouter) {
        try {
          const search = await openrouter.chat.completions.create(
            {
              model: SONAR_SEARCH_MODEL,
              messages: [
                {
                  role: "system",
                  content:
                    "You answer the user's question helpfully and concisely using up-to-date web information. Reply in the SAME language as the user's message. Keep it to 1-3 sentences. Do not include citation markers, footnotes, or URLs.",
                },
                { role: "user", content: lastUser.content },
              ],
            },
            { timeout: 15000 },
          );
          const answer = search.choices[0]?.message?.content?.trim();
          if (answer) reply = `${answer}\n\n${reAsk}`;
        } catch (searchErr) {
          const e = searchErr as { message?: string; status?: number; code?: string };
          req.log.error(
            { message: e?.message, status: e?.status, code: e?.code },
            "Sonar search failed; falling back to re-ask",
          );
        }
      }

      res.json(
        SendChatResponse.parse({
          reply,
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

    // Entering the research node: look up preliminary company info on the web
    // (Perplexity Sonar) using everything collected so far, then continue.
    let reply = forcedAdvance ? target.question : (result.reply ?? target.question);
    if (target.id === RESEARCH_NODE_ID) {
      const openrouter = getOpenRouter();
      if (openrouter) {
        try {
          const research = await openrouter.chat.completions.create(
            {
              model: SONAR_SEARCH_MODEL,
              messages: [
                {
                  role: "system",
                  content:
                    "During an onboarding chat the user gave their business name, tax id (CNPJ), website, Instagram and sector. Using the conversation below, search the web for preliminary public info about this company (what it does, main products/services, online presence, size). Reply in the SAME language as the conversation, briefly (2-4 sentences), starting with a short lead-in equivalent to 'I took a quick look at your company:'. Do not invent data — if you can't find it, say you'll dig deeper later. Do not include links or citation markers.",
                },
                {
                  role: "user",
                  content: `Conversa de onboarding até aqui:\n${transcript}\nUsuário: ${lastUser.content}`,
                },
              ],
            },
            { timeout: 25000 },
          );
          const summary = research.choices[0]?.message?.content?.trim();
          if (summary) reply = `${summary}\n\n${target.question}`;
        } catch (researchErr) {
          const e = researchErr as { message?: string; status?: number; code?: string };
          req.log.error(
            { message: e?.message, status: e?.status, code: e?.code },
            "Company research failed; continuing without summary",
          );
        }
      }
    }

    res.json(
      SendChatResponse.parse({
        reply,
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
