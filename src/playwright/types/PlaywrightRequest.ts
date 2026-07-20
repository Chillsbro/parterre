export type PlaywrightArgument = string | number | boolean;

export interface PlaywrightRequest {
  id: string;
  command: string;
  args: PlaywrightArgument[];
  reason?: string;
}
