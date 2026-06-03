// Modelo de etapas do onboarding — extraído num módulo leve para que o mapper
// (flowToOnboarding, importado de forma eager pelo FlowEditor) NÃO arraste o
// componente pesado OnboardingFlow.tsx para o bundle principal. O wizard
// continua carregando via lazy import.

export type StepKind = "builtin" | "message" | "input" | "choice";

export interface Step {
  id: string;
  kind: StepKind;
  title?: string; // only for custom steps
}

// Ordem canônica do onboarding. carro_chefe e emojis ficam logo após suas etapas
// "mãe" (catalog e tone_generated) — no chat não há contador de etapas, então
// perguntas consecutivas fluem como uma só conversa (a fusão pedida). As etapas
// OPERACIONAIS (fulfillment, payment, escalation, tasks) + a `review` final são o
// que permite ao time de IA realmente atender, cobrar e operar — não só descrever.
export const DEFAULT_STEP_IDS = [
  "welcome",
  "ask_city",
  "place_pick",
  "confirm_contact",
  "confirm_site",
  "instagram",
  "ifood",
  "catalog",
  "carro_chefe",
  "fulfillment",
  "payment",
  "tone_generated",
  "emojis",
  "escalation",
  "tasks",
  "review",
  "configured",
  "features",
];

export const DEFAULT_STEPS: Step[] = DEFAULT_STEP_IDS.map((id) => ({
  id,
  kind: "builtin" as const,
}));
