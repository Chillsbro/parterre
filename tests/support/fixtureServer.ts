function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`,
    {headers: {"content-type": "text/html"}}
  );
}

const routes: Record<string, () => Response | Promise<Response>> = {
  "/": () =>
    page(
      "Parterre Fixture Home",
      `<h1>Fixture home</h1>
       <a href="/form" id="to-form">Go to form</a>
       <a href="/child" target="_blank" id="open-child">Open child tab</a>`
    ),
  "/form": () =>
    page(
      "Fixture Form",
      `<form action="/form" method="get">
         <label for="name">Name</label>
         <input id="name" name="name" type="text" />
         <button type="submit" id="submit">Submit</button>
       </form>`
    ),
  "/child": () => page("Fixture Child Tab", "<h1>Child tab</h1>"),
  "/dialog": () =>
    page(
      "Fixture Dialog",
      `<button id="ask" onclick="document.title = confirm('Proceed?') ? 'Accepted' : 'Dismissed'">Ask</button>`
    ),
  "/animated": () =>
    page(
      "Fixture Animation",
      `<script>
         let step = 0;
         setInterval(() => {
           document.body.style.background = ["red", "blue", "green"][step++ % 3];
         }, 150);
       </script>`
    ),
  "/slow": async () => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return page("Fixture Slow", "<h1>Finally</h1>");
  }
};

export interface FixtureServer {
  url: string;
  stop(): void;
}

export function startFixtureServer(): FixtureServer {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const route = routes[new URL(request.url).pathname];
      return route ? route() : new Response("Not found", {status: 404});
    }
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true)
  };
}
