/* Undo / redo for map edits. Pure: no DOM.
 * Every edit (doc.js) returns a forward patch; the history keeps those patches, undoes by applying the
 * inverse and redoes by applying the patch again. A continuous gesture (a drag, a resize, a corner edit)
 * is wrapped in begin() / end() so the whole gesture is one undo step: its patches are composed into one.
 * Repeated small edits (arrow-key nudges) can share a mergeKey to become one step too. */
import {applyPatch, composePatches, invertPatch} from "./doc.js";

export const HISTORY_LIMIT = 200;
export const MERGE_WINDOW_MS = 1000;

/**
 * createHistory({limit, mergeWindowMs, now}) -> history
 *   push(patch, {label, mergeKey}) records an edit (ignored when the patch is empty)
 *   begin(label) / end() group everything pushed in between into one step (nested begins are counted)
 *   cancel(doc) ends an open group and returns doc with the group's edits rolled back
 *   undo(doc) / redo(doc) -> {doc, label} or null when there is nothing to undo / redo
 *   canUndo() / canRedo(), undoLabel() / redoLabel(), clear() (call it whenever a map is loaded), size()
 */
export function createHistory(opts = {}) {
  const limit = Math.max(1, Math.floor(opts.limit ?? HISTORY_LIMIT));
  const windowMs = opts.mergeWindowMs ?? MERGE_WINDOW_MS;
  const now = opts.now || (() => Date.now());
  let undoStack = [], redoStack = [];
  let group = null; // {patch, label, depth}

  function record(entry) {
    redoStack = [];
    const top = undoStack[undoStack.length - 1];
    if (top && entry.mergeKey && top.mergeKey === entry.mergeKey && entry.at - top.at <= windowMs) {
      undoStack[undoStack.length - 1] = {...top, patch: composePatches(top.patch, entry.patch), at: entry.at};
    } else {
      undoStack.push(entry);
      if (undoStack.length > limit) undoStack = undoStack.slice(undoStack.length - limit);
    }
  }
  function closeGroup() {
    const g = group; group = null;
    if (g && g.patch.length) record({patch: g.patch, label: g.label, mergeKey: null, at: now()});
  }

  return {
    push(patch, o = {}) {
      if (!Array.isArray(patch) || !patch.length) return;
      if (group) { group.patch = composePatches(group.patch, patch); if (!group.label && o.label) group.label = o.label; return; }
      record({patch, label: o.label || "", mergeKey: o.mergeKey || null, at: now()});
    },
    begin(label = "") {
      if (group) { group.depth++; return; }
      group = {patch: [], label, depth: 1};
    },
    end() {
      if (!group) return;
      if (--group.depth > 0) return;
      closeGroup();
    },
    /** Is a gesture group open? */
    get grouping() { return !!group; },
    cancel(doc) {
      if (!group) return doc;
      const g = group; group = null;
      return g.patch.length ? applyPatch(doc, invertPatch(g.patch)) : doc;
    },
    undo(doc) {
      if (group) closeGroup();
      const e = undoStack.pop();
      if (!e) return null;
      redoStack.push(e);
      return {doc: applyPatch(doc, invertPatch(e.patch)), label: e.label};
    },
    redo(doc) {
      if (group) closeGroup();
      const e = redoStack.pop();
      if (!e) return null;
      undoStack.push({...e, mergeKey: null});
      return {doc: applyPatch(doc, e.patch), label: e.label};
    },
    canUndo: () => undoStack.length > 0 || !!(group && group.patch.length),
    canRedo: () => redoStack.length > 0,
    undoLabel: () => (undoStack[undoStack.length - 1] || {}).label || "",
    redoLabel: () => (redoStack[redoStack.length - 1] || {}).label || "",
    clear() { undoStack = []; redoStack = []; group = null; },
    size: () => ({undo: undoStack.length, redo: redoStack.length}),
  };
}
