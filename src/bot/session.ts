import type { Context, SessionFlavor } from "grammy";

export type Step =
  | "idle"
  | "title"
  | "source"
  | "search"
  | "edit_description";

export interface SessionData {
  step: Step;
  title: string;
  editDemoId?: number;
}

export type MyContext = Context & SessionFlavor<SessionData>;

export function initialSession(): SessionData {
  return {
    step: "idle",
    title: "",
  };
}
