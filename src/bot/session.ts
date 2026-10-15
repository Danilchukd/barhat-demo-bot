import type { Context, SessionFlavor } from "grammy";

export type Step =
  | "idle"
  | "title"
  | "source"
  | "search"
  | "edit_description"
  | "edit_title"
  | "attach_source"
  | "edit_attachment_label";

export interface SessionData {
  step: Step;
  title: string;
  editDemoId?: number;
  attachDemoId?: number;
  editAttachmentDemoId?: number;
  editAttachmentId?: number;
}

export type MyContext = Context & SessionFlavor<SessionData>;

export function initialSession(): SessionData {
  return {
    step: "idle",
    title: "",
  };
}
