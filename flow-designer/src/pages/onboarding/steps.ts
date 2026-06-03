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
  "tone_generated",
  "emojis",
  "configured",
  "features",
];

export const DEFAULT_STEPS: Step[] = DEFAULT_STEP_IDS.map((id) => ({
  id,
  kind: "builtin" as const,
}));
