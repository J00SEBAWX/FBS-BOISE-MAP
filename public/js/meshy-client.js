// Thin client for our own /api/meshy proxy. The Meshy API key never
// touches the browser — it lives only in the Cloudflare Pages Function.

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 60; // ~3 minutes
const ACCESS_CODE_KEY = "fbs-boise-map:access-code";

// If the server has SITE_ACCESS_CODE set (see functions/api/meshy/
// _middleware.js), it 401s until we send it back. Prompt for it once,
// remember it, retry. If the server has no code configured, this header
// is just ignored and nothing here ever prompts.
async function fetchWithAccessCode(url, options = {}) {
  const attempt = () =>
    fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), "X-Access-Code": getStoredAccessCode() },
    });

  let res = await attempt();
  if (res.status === 401) {
    const code = window.prompt("Enter the site access code:");
    if (code) {
      setStoredAccessCode(code);
      res = await attempt();
    }
  }
  return res;
}

function getStoredAccessCode() {
  try {
    return localStorage.getItem(ACCESS_CODE_KEY) || "";
  } catch {
    return "";
  }
}

function setStoredAccessCode(code) {
  try {
    localStorage.setItem(ACCESS_CODE_KEY, code);
  } catch {
    // no persistence available — we'll just prompt again next time
  }
}

export async function generateModelFromText(prompt, { onProgress } = {}) {
  const startRes = await fetchWithAccessCode("/api/meshy/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const startData = await startRes.json();
  if (!startRes.ok) {
    throw new Error(startData.error || `Failed to start generation (${startRes.status}).`);
  }

  const { taskId } = startData;
  if (!taskId) {
    throw new Error("Meshy did not return a task id.");
  }

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const statusRes = await fetchWithAccessCode(`/api/meshy/status/${encodeURIComponent(taskId)}`);
    const statusData = await statusRes.json();
    if (!statusRes.ok) {
      throw new Error(statusData.error || `Failed to check status (${statusRes.status}).`);
    }

    onProgress?.(statusData);

    if (statusData.status === "SUCCEEDED") {
      if (!statusData.modelUrl) {
        throw new Error("Meshy reported success but returned no model URL.");
      }
      return statusData.modelUrl;
    }
    if (statusData.status === "FAILED" || statusData.status === "CANCELED") {
      throw new Error(statusData.taskError || `Meshy generation ${statusData.status.toLowerCase()}.`);
    }
    // PENDING / IN_PROGRESS -> keep polling
  }

  throw new Error("Timed out waiting for Meshy to finish generating the model.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
