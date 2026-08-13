export interface BrowserCommandDescriptor {
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
  return {
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
  "run-code": safe(),
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
  "tab-list": safe({visual: false}),
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
  upload: safe(),
  drop: safe(),
  "state-save": safe({visual: false}),
  "state-load": safe({visual: false}),
  "cookie-set": safe({visual: false}),
  "cookie-delete": safe({visual: false}),
  "cookie-clear": safe({visual: false}),
  "localstorage-set": safe({visual: false}),
  "localstorage-delete": safe({visual: false}),
  "localstorage-clear": safe({visual: false}),
  "sessionstorage-set": safe({visual: false}),
  "sessionstorage-delete": safe({visual: false}),
  "sessionstorage-clear": safe({visual: false}),
  route: safe({visual: false}),
  unroute: safe({visual: false}),
  "network-state-set": safe({visual: false}),
  "tracing-start": safe({visual: false}),
  "tracing-stop": safe({visual: false}),
  "video-start": safe({visual: false}),
  "video-stop": safe({visual: false}),
  "video-chapter": safe({visual: false}),
  "video-show-actions": safe({visual: false}),
  "video-hide-actions": safe({visual: false}),
  attach: safe({opens: true}),
  detach: safe({visual: false, closes: true}),
  "delete-data": safe({visual: false, closes: true}),
  "pause-at": safe({tabs: true}),
  resume: safe({tabs: true}),
  "step-over": safe({tabs: true}),
  "config-print": safe({visual: false})
};

export function getBrowserCommandDescriptor(
  command: string
): BrowserCommandDescriptor | undefined {
  return Object.hasOwn(browserCommandDescriptors, command)
    ? browserCommandDescriptors[command]
    : undefined;
}
