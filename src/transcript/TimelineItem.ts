export interface TimelineItem {
  id: string;
  kind: "user" | "agent" | "tool" | "error";
  content: string;
  detail?: string;
  link?: {label: string; href: string};
  ok?: boolean;
}
