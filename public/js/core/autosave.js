/* Autosave: a small state machine that saves a little after the last change and tells the UI how it is going.
 * Pure: no DOM, no fetch; the caller passes save(), the clock and (optionally) an online() check, so it can
 * be tested with fake timers.
 *
 * States (status()):
 *   saved     everything is on the server
 *   dirty     changed; a save is scheduled `delay` ms after the last change
 *   saving    a save is in flight
 *   retry     the save failed (network / 5xx); it is retried after `retryDelay` ms
 *   offline   online() says no; retried like `retry`
 *   rejected  the server refused the data (400 / 403 / 404 / 413); kept locally, saved again on the next change
 *   conflict  409: the map changed somewhere else; nothing is saved until reload() is called
 *   locked    423: the master is locked; nothing is saved until reload() is called
 *
 * save() must return (or resolve to) {ok: true} or {ok: false, status, error}; a thrown error counts as status 0.
 * onState(state, {error, pending}) is called on every state change. */
export const SAVE_DELAY = 1500;
export const RETRY_DELAY = 10000;

export function createAutosave(o) {
  const delay = o.delay ?? SAVE_DELAY, retryDelay = o.retryDelay ?? RETRY_DELAY;
  const setT = o.setTimeout || ((fn, ms) => setTimeout(fn, ms)), clearT = o.clearTimeout || (t => clearTimeout(t));
  const online = o.online || (() => true);
  let state = "saved", timer = 0, pending = false, inflight = false, inflightP = null, error = "", seq = 0;
  const halted = () => state === "conflict" || state === "locked";

  function set(s) {
    if (s !== state || s === "saving") { state = s; if (o.onState) o.onState(s, {error, pending: pending || inflight}); }
  }
  function schedule(ms) { clearT(timer); timer = setT(() => { timer = 0; run(); }, ms); }

  /** One save attempt, if there is something to save and nothing already in flight. Resolves when it has finished. */
  function run() {
    if (inflight || !pending || halted()) return Promise.resolve();
    if (!online()) { set("offline"); schedule(retryDelay); return Promise.resolve(); }
    inflight = true; pending = false; error = "";
    const my = ++seq;
    set("saving");
    const p = attempt(my).finally(() => { if (inflightP === p) inflightP = null; });
    inflightP = p;
    return p;
  }
  async function attempt(my) {
    let r;
    try { r = await o.save(); } catch (e) { r = {ok: false, status: 0, error: String((e && e.message) || e)}; }
    if (my !== seq) return; // reset() happened while saving: that result belongs to the old map
    inflight = false;
    if (r && r.ok) {
      if (pending) { set("dirty"); schedule(delay); } else set("saved");
      return;
    }
    pending = true;
    const st = (r && r.status) || 0;
    error = (r && r.error) || (st ? "Couldn't save." : "Couldn't reach the site.");
    if (st === 409) set("conflict");
    else if (st === 423) set("locked");
    else if (st === 400 || st === 403 || st === 404 || st === 413) set("rejected");
    else { set(!online() ? "offline" : "retry"); schedule(retryDelay); }
  }

  return {
    /** Something changed: save `delay` ms after the last call (unless halted by a conflict / lock). */
    change() {
      pending = true;
      if (halted()) return;
      if (!inflight) { set("dirty"); schedule(delay); }
    },
    /**
     * Save right now (opening another map, closing the tab, the "Try now" button) and resolve when everything that
     * was changed has been tried: a save already in flight is waited for, and edits made while it flew are sent
     * in a second save. Check `pending` afterwards: it stays true when the last attempt failed.
     */
    async flush() {
      clearT(timer); timer = 0;
      if (inflightP) { await inflightP; clearT(timer); timer = 0; } // the follow-up it scheduled is sent now instead
      return run();
    },
    /** The person asked to try again (also called when the browser comes back online). */
    tryNow() { if (pending && !inflight && !halted()) { clearT(timer); timer = 0; return run(); } return Promise.resolve(); },
    /** The map was reloaded after a conflict / lock: start clean (any pending edits are the caller's to re-apply). */
    reset() { clearT(timer); timer = 0; pending = false; inflight = false; inflightP = null; error = ""; seq++; set("saved"); },
    status: () => state,
    get error() { return error; },
    /** Are there edits not yet on the server (scheduled, retrying or in flight)? */
    get pending() { return pending || inflight; },
  };
}
