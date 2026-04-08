import openNextWorker from "./.open-next/worker.js";

const CRON_PATH = "/api/cron/process-notification-outbox";

async function runOutboxCron(env) {
  const appUrl = (env.NEXT_PUBLIC_APP_URL ?? "").trim();
  const secret = (env.NOTIFICATION_OUTBOX_CRON_SECRET ?? env.CRON_SECRET ?? "").trim();

  if (!appUrl || !secret) {
    console.error(
      "Cron skipped: missing NEXT_PUBLIC_APP_URL or NOTIFICATION_OUTBOX_CRON_SECRET/CRON_SECRET"
    );
    return;
  }

  const endpoint = new URL(CRON_PATH, appUrl).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Cron request failed (${response.status}): ${body}`);
  }
}

export default {
  fetch: openNextWorker.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runOutboxCron(env));
  }
};
