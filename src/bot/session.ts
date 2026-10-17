import type { Context, SessionFlavor } from "grammy";
import type { DemoType } from "../db/demoRepository.js";

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
  searchQuery?: string;
  filterType?: DemoType | "none";
  returnTo?: ReturnTo | undefined;
}

export type MyContext = Context & SessionFlavor<SessionData>;

export function initialSession(): SessionData {
  return {
    step: "idle",
    title: "",
  };
}

export type ReturnTo =
  | {
      source: "archive";
      page: number;
    }
  | {
      source: "search";
      page: number;
      query: string;
    }
  | {
      source: "type";
      page: number;
      filterType: DemoType | "none";
    };

