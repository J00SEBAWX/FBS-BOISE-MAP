/* The editing session: the open map's document, the normalised layout the views draw, the selection, the
 * undo history and the Structure lock, in one place. Pure: no DOM (the app subscribes with onChange).
 *
 * Every edit comes from doc.js / areas.js as {doc, patch, inverse, error?}; apply() records it in the history and
 * swaps the document in. A gesture (drag, resize) is wrapped in begin() / end() so it is one undo step. */
import {normalizeLayout} from "./model.js";
import {normalizeDoc, isLocked as lockedBy, findItem, applyPatch} from "./doc.js";
import {createHistory} from "./history.js";
import {buildSnapTargets} from "./snap.js";
import {categoriesOf} from "./areas.js";

/** A layout for the views from any doc (an empty map still gives a drawable, empty layout). */
export function toLayout(doc, building) {
  const b = (doc && doc.building) || building || {};
  try { return normalizeLayout({items: doc.items, building: {length: b.length ?? b.L, width: b.width ?? b.W}}); }
  catch {
    const L = Number(b.length ?? b.L) || 169, W = Number(b.width ?? b.W) || 80;
    return Object.freeze({version: "", building: Object.freeze({L, W}), items: Object.freeze([]), byId: new Map()});
  }
}

/**
 * createSession({onChange(kind, info)}) kinds: "load", "doc", "selection", "lock", "history"
 */
export function createSession(o = {}) {
  const history = createHistory();
  let doc = normalizeDoc({items: []}), layout = toLayout(doc), cats = categoriesOf(doc), targets = null;
  let sel = [], unlocked = false, building = {length: 169, width: 80};
  const emit = (kind, info) => { if (o.onChange) o.onChange(kind, info); };

  function setDoc(next, kind = "doc", info = {}) {
    doc = normalizeDoc(next);
    if (doc.building) building = {...building, ...doc.building};
    layout = toLayout(doc, building);
    cats = categoriesOf(doc);
    targets = null;
    // the selection keeps only items that still exist
    const keep = sel.filter(id => layout.byId.has(id));
    const selChanged = keep.length !== sel.length;
    sel = keep;
    emit(kind, info);
    if (selChanged) emit("selection", {});
  }

  return {
    get doc() { return doc; },
    get layout() { return layout; },
    /** The merged categories (defaults + this map's overrides and custom ones). */
    get categories() { return cats; },
    get building() { return layout.building; },
    /** Snap targets (walls, columns and department blocks) for the current layout, built on demand. */
    get snapTargets() {
      if (!targets) targets = buildSnapTargets(layout.items, {rects: layout.items.filter(it => it.type === "area" && it.shape !== "poly")});
      return targets;
    },
    history,
    /** Loads a map's data (clears the history and the selection). */
    load(data, opts = {}) {
      history.clear();
      sel = [];
      if (opts.building) building = {...building, ...opts.building};
      setDoc(data, "load", {});
    },
    /**
     * Applies an edit result. Returns the result; result.error means nothing changed (the caller shows it).
     * opts: label (undo label), mergeKey (repeated nudges become one step).
     */
    apply(result, opts = {}) {
      if (!result || result.error) return result || {error: "Nothing happened."};
      if (!result.patch || !result.patch.length) return result;
      history.push(result.patch, {label: opts.label || "", mergeKey: opts.mergeKey || null});
      setDoc(result.doc, "doc", {label: opts.label || "", ids: result.ids || (result.id ? [result.id] : [])});
      emit("history", {});
      return result;
    },
    /** Replaces the whole document without an undo step (a reload, a draft). */
    replace(data) { history.clear(); setDoc(data, "doc", {replaced: true}); emit("history", {}); },
    begin(label) { history.begin(label); },
    end() { history.end(); emit("history", {}); },
    /** Ends an open gesture and rolls its edits back (Esc during a drag). */
    cancel() { if (history.grouping) { setDoc(history.cancel(doc), "doc", {cancelled: true}); emit("history", {}); } },
    undo() { const r = history.undo(doc); if (r) { setDoc(r.doc, "doc", {undo: true}); emit("history", {}); } return r; },
    redo() { const r = history.redo(doc); if (r) { setDoc(r.doc, "doc", {redo: true}); emit("history", {}); } return r; },
    /** Re-applies a patch (the toast's Undo after a delete puts the items back). */
    applyPatch(patch, label) { if (!patch || !patch.length) return; history.push(patch, {label}); setDoc(applyPatch(doc, patch), "doc", {label}); emit("history", {}); },

    /* ---------- selection (ids) ---------- */
    get selection() { return sel; },
    /** The selected items (normalised, from the layout). */
    selected() { return sel.map(id => layout.byId.get(id)).filter(Boolean); },
    /** One selected item, or null when none or several. */
    get single() { return sel.length === 1 ? layout.byId.get(sel[0]) || null : null; },
    isSelected: id => sel.includes(id),
    /** select(ids, {add: true}) adds, {toggle: true} toggles, else replaces. */
    select(ids, opts = {}) {
      const list = (Array.isArray(ids) ? ids : ids ? [ids] : []).filter(id => layout.byId.has(id));
      let next;
      if (opts.toggle) { next = [...sel]; for (const id of list) { const i = next.indexOf(id); if (i >= 0) next.splice(i, 1); else next.push(id); } }
      else if (opts.add) next = [...new Set([...sel, ...list])];
      else next = [...new Set(list)];
      if (next.length === sel.length && next.every((id, i) => id === sel[i])) return;
      sel = next;
      emit("selection", {});
    },
    clearSelection() { if (sel.length) { sel = []; emit("selection", {}); } },

    /* ---------- the Structure lock ---------- */
    get unlocked() { return unlocked; },
    setUnlocked(on) { on = !!on; if (on !== unlocked) { unlocked = on; emit("lock", {unlocked}); } },
    /** Can this item be moved / resized / deleted right now? */
    isLocked: it => lockedBy(typeof it === "string" ? findItem(doc, it) : it, {unlocked}),
    /** The options every doc.js edit takes. */
    get editOpts() { return {unlocked}; },
    /** The raw (doc) item by id, for edits that need it. */
    item: id => findItem(doc, id),
  };
}
