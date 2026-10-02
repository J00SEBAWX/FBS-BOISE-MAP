// The open build: edits, undo/redo and autosave with the server's version check.
const SAVE_DELAY = 1200;
const MAX_UNDO = 100;

export function createState(api) {
  const handlers = new Map();
  let build = null; // summary fields + canEdit
  let data = null; // { v, baseVersion, notes, items, areas }
  let undoStack = [];
  let redoStack = [];
  let gesture = null;
  let timer = null;
  let retryTimer = null;
  let saving = false;
  let queued = false;
  let saveStatus = "saved";

  const on = (ev, fn) => {
    if (!handlers.has(ev)) handlers.set(ev, new Set());
    handlers.get(ev).add(fn);
    return () => handlers.get(ev).delete(fn);
  };
  const emit = (ev, payload) => {
    for (const fn of handlers.get(ev) || []) fn(payload);
  };
  const setStatus = (s) => {
    if (saveStatus === s) return;
    saveStatus = s;
    emit("status", s);
  };

  const snap = () => JSON.stringify({ items: data.items, areas: data.areas, notes: data.notes || "" });
  const restore = (s) => {
    const o = JSON.parse(s);
    data.items = o.items;
    data.areas = o.areas;
    data.notes = o.notes;
  };

  function load(b) {
    clearTimeout(timer);
    clearTimeout(retryTimer);
    build = { ...b };
    delete build.data;
    const d = b.data || {};
    data = { v: 1, baseVersion: d.baseVersion || "", notes: d.notes || "", items: Array.isArray(d.items) ? d.items : [], areas: Array.isArray(d.areas) ? d.areas : [] };
    undoStack = [];
    redoStack = [];
    gesture = null;
    queued = false;
    setStatus(b.canEdit ? "saved" : "readonly");
    emit("load", build);
    emit("history");
    emit("change", { label: "load", load: true });
  }

  function pushUndo(before, label) {
    undoStack.push({ s: before, label });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
    emit("history");
  }

  function dirty() {
    setStatus("dirty");
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY);
  }

  /** One undoable edit. fn(data) mutates in place. */
  function change(label, fn, meta = {}) {
    if (!build || !build.canEdit) return false;
    const before = gesture || snap();
    fn(data);
    if (!gesture) {
      pushUndo(before, label);
      dirty();
    }
    emit("change", { label, ...meta });
    return true;
  }

  // Drags: begin() once, live() on every pointer move, then end() records a single undo step.
  function begin() {
    if (!build || !build.canEdit) return false;
    if (!gesture) gesture = snap();
    return true;
  }
  function live(fn) {
    if (!gesture) return;
    fn(data);
    emit("live");
  }
  function end(label, meta = {}) {
    if (!gesture) return false;
    const before = gesture;
    gesture = null;
    if (before === snap()) {
      emit("change", { label: "noop", ...meta });
      return false;
    }
    pushUndo(before, label);
    dirty();
    emit("change", { label, ...meta });
    return true;
  }
  function cancel() {
    if (!gesture) return;
    restore(gesture);
    gesture = null;
    emit("change", { label: "cancel" });
  }

  function undo() {
    if (gesture || !undoStack.length || !build.canEdit) return null;
    const u = undoStack.pop();
    redoStack.push({ s: snap(), label: u.label });
    restore(u.s);
    dirty();
    emit("history");
    emit("change", { label: `Undo: ${u.label}`, history: true });
    return u.label;
  }
  function redo() {
    if (gesture || !redoStack.length || !build.canEdit) return null;
    const r = redoStack.pop();
    undoStack.push({ s: snap(), label: r.label });
    restore(r.s);
    dirty();
    emit("history");
    emit("change", { label: `Redo: ${r.label}`, history: true });
    return r.label;
  }

  async function save(opts = {}) {
    if (!build || !build.canEdit) return;
    clearTimeout(timer);
    clearTimeout(retryTimer);
    if (saving) {
      queued = true;
      return;
    }
    if (saveStatus === "saved" && !opts.force) return;
    saving = true;
    setStatus("saving");
    const body = { version: build.version, data: { v: 1, baseVersion: data.baseVersion, notes: data.notes, items: data.items, areas: data.areas } };
    try {
      const r = await api.put(`/api/builds/${encodeURIComponent(build.id)}`, body, { keepalive: Boolean(opts.keepalive) });
      build.version = r.version;
      const statusChanged = build.status !== r.status;
      build.status = r.status;
      build.updatedAt = r.updatedAt;
      setStatus(queued ? "dirty" : "saved");
      emit("saved", { statusChanged });
    } catch (e) {
      if (e.status === 409) {
        setStatus("conflict");
        emit("conflict", e);
      } else if (e.status === 404) {
        setStatus("error");
        emit("gone", e);
      } else {
        setStatus(e.status === 0 ? "offline" : "error");
        emit("save-error", e);
        retryTimer = setTimeout(() => save({ force: true }), 6000);
      }
    } finally {
      saving = false;
      if (queued) {
        queued = false;
        if (saveStatus === "dirty") save();
      }
    }
  }

  async function rename(name) {
    if (!build || !build.canEdit) return;
    await flush();
    const r = await api.put(`/api/builds/${encodeURIComponent(build.id)}`, { version: build.version, name });
    build.version = r.version;
    build.name = r.name;
    emit("load", build);
  }

  /** Saves right away if anything is waiting. */
  async function flush(opts = {}) {
    if (saveStatus === "dirty" || saveStatus === "error" || saveStatus === "offline") await save({ ...opts, force: true });
  }

  return {
    on,
    load,
    change,
    begin,
    live,
    end,
    cancel,
    undo,
    redo,
    save,
    flush,
    rename,
    get build() {
      return build;
    },
    get data() {
      return data;
    },
    get status() {
      return saveStatus;
    },
    get canUndo() {
      return undoStack.length > 0;
    },
    get canRedo() {
      return redoStack.length > 0;
    },
    get undoLabel() {
      return undoStack.length ? undoStack[undoStack.length - 1].label : "";
    },
    get redoLabel() {
      return redoStack.length ? redoStack[redoStack.length - 1].label : "";
    },
    get inGesture() {
      return Boolean(gesture);
    },
    markSubmitted(r) {
      build.status = r.status;
      build.version = r.version;
      build.submittedAt = r.submittedAt;
      emit("load", build);
    },
  };
}
