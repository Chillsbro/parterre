export interface BrowserCommandDescriptor {
  tier: "safe" | "sensitive";
  visualChange: boolean;
  affectsTabs: boolean;
  opensBrowser: boolean;
  closesBrowser: boolean;
}

interface DescriptorFlags {
  visual?: false;
  tabs?: true;
  opens?: true;
  closes?: true;
}

function safe(flags: DescriptorFlags = {}): BrowserCommandDescriptor {
  return describe("safe", flags);
}

function sensitive(flags: DescriptorFlags = {}): BrowserCommandDescriptor {
  return describe("sensitive", flags);
}

function describe(
  tier: BrowserCommandDescriptor["tier"],
  flags: DescriptorFlags
): BrowserCommandDescriptor {
  return {
    tier,
    visualChange: flags.visual !== false,
    affectsTabs: flags.tabs === true,
    opensBrowser: flags.opens === true,
    closesBrowser: flags.closes === true
  };
}

const browserCommandDescriptors: Record<string, BrowserCommandDescriptor> = {
  open: safe({opens: true}),
  goto: safe(),
  close: safe({visual: false, closes: true}),
  type: safe(),
  click: safe(),
  dblclick: safe(),
  fill: safe(),
  drag: safe(),
  hover: safe(),
  select: safe(),
  check: safe(),
  uncheck: safe(),
  snapshot: safe({visual: false}),
  find: safe(),
  eval: safe(),
  resize: safe(),
  "go-back": safe(),
  "go-forward": safe(),
  reload: safe(),
  press: safe(),
  keydown: safe(),
  keyup: safe(),
  mousemove: safe(),
  mousedown: safe(),
  mouseup: safe(),
  mousewheel: safe(),
  screenshot: safe({visual: false}),
  pdf: safe({visual: false}),
  "tab-list": safe(),
  "tab-new": safe({tabs: true}),
  "tab-close": safe({tabs: true}),
  "tab-select": safe({tabs: true}),
  console: safe({visual: false}),
  requests: safe({visual: false}),
  request: safe({visual: false}),
  "request-headers": safe({visual: false}),
  "request-body": safe({visual: false}),
  "response-headers": safe({visual: false}),
  "response-body": safe({visual: false}),
  "route-list": safe({visual: false}),
  "cookie-list": safe({visual: false}),
  "cookie-get": safe({visual: false}),
  "localstorage-list": safe({visual: false}),
  "localstorage-get": safe({visual: false}),
  "sessionstorage-list": safe({visual: false}),
  "sessionstorage-get": safe({visual: false}),
  "dialog-accept": safe(),
  "dialog-dismiss": safe(),
  "generate-locator": safe({visual: false}),
  highlight: safe(),
  upload: sensitive(),
  drop: sensitive(),
  "run-code": sensitive(),
  "state-save": sensitive({visual: false}),
  "state-load": sensitive(),
  "cookie-set": sensitive(),
  "cookie-delete": sensitive(),
  "cookie-clear": sensitive(),
  "localstorage-set": sensitive(),
  "localstorage-delete": sensitive(),
  "localstorage-clear": sensitive(),
  "sessionstorage-set": sensitive(),
  "sessionstorage-delete": sensitive(),
  "sessionstorage-clear": sensitive(),
  route: sensitive(),
  unroute: sensitive(),
  "network-state-set": sensitive(),
  "tracing-start": sensitive({visual: false}),
  "tracing-stop": sensitive({visual: false}),
  "video-start": sensitive({visual: false}),
  "video-stop": sensitive({visual: false}),
  "video-chapter": sensitive({visual: false}),
  "video-show-actions": sensitive({visual: false}),
  "video-hide-actions": sensitive({visual: false}),
  attach: sensitive(),
  detach: sensitive({visual: false}),
  "delete-data": sensitive({visual: false})
};

export function getBrowserCommandDescriptor(
  command: string
): BrowserCommandDescriptor | undefined {
  return Object.hasOwn(browserCommandDescriptors, command)
    ? browserCommandDescriptors[command]
    : undefined;
}
