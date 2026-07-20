import {access, mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {getSessionPath} from "../../sessions/index.js";

async function findChromeChannel(): Promise<"chrome" | undefined> {
  const candidates =
    process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return "chrome";
    } catch {}
  }
  return undefined;
}

export async function writeBrowserCompatibilityConfig(options: {
  storageDir: string;
  sessionId: string;
}): Promise<string> {
  const sessionPath = getSessionPath(options.storageDir, options.sessionId);
  const profilePath = join(sessionPath, "browser-profile");
  const configPath = join(sessionPath, "playwright-cli.config.json");
  const channel = await findChromeChannel();
  const timezoneId = Intl.DateTimeFormat().resolvedOptions().timeZone;

  await mkdir(profilePath, {recursive: true});
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        browser: {
          browserName: "chromium",
          userDataDir: profilePath,
          launchOptions: {
            headless: true,
            ...(channel ? {channel} : {}),
            args: ["--disable-dev-shm-usage", "--remote-debugging-port=0"]
          },
          contextOptions: {
            viewport: {width: 1440, height: 900},
            screen: {width: 1440, height: 900},
            deviceScaleFactor: 2,
            locale: "en-US",
            ...(timezoneId ? {timezoneId} : {}),
            colorScheme: "dark",
            reducedMotion: "reduce",
            acceptDownloads: true
          }
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return configPath;
}
