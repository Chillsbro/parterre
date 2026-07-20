export interface TimelineItem {
  id: string;
  kind: "user" | "agent" | "tool" | "error";
  content: string;
  detail?: string;
  ok?: boolean;
}
