// Sign-in page. Talks only to this site's /api/auth endpoints.
const WORK_AREAS = [
  "Sales floor", "Power tools", "Hardware & fasteners", "Paint", "Decking & outdoor", "Contractor sales desk",
  "Warehouse / yard", "Receiving", "Delivery", "Office", "Management", "Other",
];

const $ = (s) => document.querySelector(s);
const panels = ["#panel-code", "#panel-request", "#panel-sent", "#panel-admin", "#panel-recover", "#panel-setup", "#panel-recovery-codes"];
const msg = $("#msg");

function show(id) {
  for (const p of panels) $(p).hidden = p !== id;
  const isCode = id === "#panel-code", isReq = id === "#panel-request";
  $("#tab-code").setAttribute("aria-selected", String(isCode));
  $("#tab-request").setAttribute("aria-selected", String(isReq));
  setMsg("");
  const first = $(id).querySelector("input, select, button");
  if (first && id !== "#panel-recovery-codes") first.focus({ preventScroll: true });
}

function setMsg(text, kind = "error") {
  msg.hidden = !text;
  msg.textContent = text || "";
  msg.className = "notice " + kind;
}

async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-FBS": "1" },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again in a minute.");
  return data;
}

function busy(form, on) {
  for (const el of form.querySelectorAll("button, input, select")) el.disabled = on;
}

// populate the area list
const sel = $("#req-area");
for (const a of WORK_AREAS) {
  const o = document.createElement("option");
  o.value = a;
  o.textContent = a;
  sel.appendChild(o);
}
sel.addEventListener("change", () => {
  $("#req-other-wrap").hidden = sel.value !== "Other";
});

$("#tab-code").addEventListener("click", () => show("#panel-code"));
$("#tab-request").addEventListener("click", () => show("#panel-request"));
$("#sent-back").addEventListener("click", () => show("#panel-code"));
$("#link-admin").addEventListener("click", () => show("#panel-admin"));
$("#link-setup").addEventListener("click", () => show("#panel-setup"));
$("#show-recover").addEventListener("click", () => show("#panel-recover"));

$("#panel-code").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const phone = $("#code-phone").value.trim();
  const code = $("#code-code").value.replace(/\D/g, "");
  if (!phone) return setMsg("Enter your mobile number.");
  if (code.length !== 6) return setMsg("Enter all 6 digits of your code.");
  busy(f, true);
  try {
    const r = await post("/api/auth/verify", { phone, code });
    setMsg("Signed in. Loading the planner…", "ok");
    location.replace(r.redirect || "/app/");
  } catch (err) {
    setMsg(err.message);
    busy(f, false);
  }
});

$("#panel-request").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const firstName = $("#req-name").value.trim();
  let workArea = sel.value;
  if (workArea === "Other") workArea = $("#req-other").value.trim();
  const phone = $("#req-phone").value.trim();
  if (!firstName) return setMsg("Enter your first name.");
  if (!workArea) return setMsg("Choose the area you work in.");
  if (!phone) return setMsg("Enter your mobile number.");
  busy(f, true);
  try {
    await post("/api/auth/request", { firstName, workArea, phone });
    $("#code-phone").value = phone;
    show("#panel-sent");
  } catch (err) {
    setMsg(err.message);
  } finally {
    busy(f, false);
  }
});

$("#panel-admin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const phone = $("#admin-phone").value.trim();
  if (!phone) return setMsg("Enter your mobile number.");
  busy(f, true);
  try {
    await post("/api/auth/admin-code", { phone });
    $("#code-phone").value = phone;
    show("#panel-code");
    setMsg("If that number is the admin number, a code is on its way to your phone. It expires in 10 minutes.", "ok");
  } catch (err) {
    setMsg(err.message);
  } finally {
    busy(f, false);
  }
});

$("#panel-recover").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  busy(f, true);
  try {
    const r = await post("/api/auth/recover", { phone: $("#rec-phone").value.trim(), recoveryCode: $("#rec-code").value.trim() });
    location.replace(r.redirect || "/admin/");
  } catch (err) {
    setMsg(err.message);
    busy(f, false);
  }
});

$("#panel-setup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  busy(f, true);
  try {
    const r = await post("/api/auth/setup", {
      setupCode: $("#setup-code").value.trim(),
      firstName: $("#setup-name").value.trim(),
      phone: $("#setup-phone").value.trim(),
    });
    const list = $("#recovery-list");
    list.replaceChildren();
    for (const c of r.recoveryCodes || []) {
      const li = document.createElement("li");
      li.textContent = c;
      list.appendChild(li);
    }
    show("#panel-recovery-codes");
  } catch (err) {
    setMsg(err.message);
  } finally {
    busy(f, false);
  }
});

$("#copy-codes").addEventListener("click", async () => {
  const text = [...document.querySelectorAll("#recovery-list li")].map((li) => li.textContent).join("\n");
  try {
    await navigator.clipboard.writeText(text);
    setMsg("Copied. Paste them somewhere private.", "ok");
  } catch {
    setMsg("Couldn't copy automatically. Select the codes and copy them.", "warn");
  }
});
$("#go-admin").addEventListener("click", () => location.replace("/admin/"));

// open the request tab directly with /login#request
if (location.hash === "#request") show("#panel-request");
else if (location.hash === "#setup") show("#panel-setup");
