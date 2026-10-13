import type { Context, SessionFlavor } from "grammy";

export type Step = "idle" | "title" | "source";

export interface SessionData {
  step: Step;
  title: string;
}

export type MyContext = Context & SessionFlavor<SessionData>;

export function initialSession(): SessionData {
  return {
    step: "idle",
    title: "",
  };
}
