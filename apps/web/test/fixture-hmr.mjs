// Parallel fixtures share the app directory. Next broadcasts additions/removals
// to every dev page, even before that page's router has initialized.
// Preserve HMR for this fixture and every other message; isolate only unrelated
// route churn created by another test. Real reloads and page errors stay visible.
export async function isolateFixtureHmr(page, fixturePath) {
  await page.routeWebSocket(/\/_next\/webpack-hmr(?:\?|$)/, socket => {
    const upstream = socket.connectToServer();
    upstream.onMessage(message => {
      try {
        const value = JSON.parse(String(message));
        if (['addedPage', 'removedPage'].includes(value.type ?? value.action)
          && Array.isArray(value.data) && value.data.length > 0
          && value.data.every(path => typeof path === 'string' && path.startsWith('/') && path !== fixturePath)) return;
      } catch { /* Unknown messages keep their original transport and validation. */ }
      socket.send(message);
    });
  });
}
