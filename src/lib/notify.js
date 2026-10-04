// Alerts to AJ's phone. Default channel: ntfy push (free app). Optional: Twilio SMS.
// Messages never include phone numbers.

export async function notifyAdmin(env, { title, message, click, priority = 4, tags = ["bell"] }) {
  const jobs = [];
  if (env.NTFY_TOPIC) {
    let server = env.NTFY_SERVER || "https://ntfy.sh";
    while (server.endsWith("/")) server = server.slice(0, -1);
    const headers = { "Content-Type": "application/json" };
    if (env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`;
    const body = { topic: env.NTFY_TOPIC, title, message, priority, tags };
    if (click) body.click = click;
    jobs.push(
      fetch(server, { method: "POST", headers, body: JSON.stringify(body) })
        .then((r) => r.ok)
        .catch(() => false)
    );
  }
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM && env.ADMIN_SMS_TO) {
    const form = new URLSearchParams({ To: env.ADMIN_SMS_TO, From: env.TWILIO_FROM, Body: `${title}\n${message}` });
    jobs.push(
      fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      })
        .then((r) => r.ok)
        .catch(() => false)
    );
  }
  const results = await Promise.all(jobs);
  return { channels: results.length, delivered: results.filter(Boolean).length };
}

export function alertsConfigured(env) {
  return Boolean(env.NTFY_TOPIC || (env.TWILIO_ACCOUNT_SID && env.ADMIN_SMS_TO));
}
