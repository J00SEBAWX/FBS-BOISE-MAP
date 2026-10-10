// Applying selected changes from a map (or a proposal's snapshot) to the master map.
// Pure ES module (imports only ./schema.js). Used by POST /api/master/apply and by approving a proposal with
// changes; the browser loads the identical public/js/shared/apply.js to preview the result. The two files
// must stay byte-identical.
//
// A change is {id, action: "upsert" | "delete"} for an item, or {category, action: "upsert" | "delete"} for a
// category definition:
//   upsert item      copy the item with that id from the source into the master (replace in place, or add at the end)
//   delete item      remove that id from the master
//   upsert category  copy the source's definition (a default the source no longer overrides goes back to default)
//   delete category  remove the master's definition (a custom category, or an override of a default)
// An upserted department block whose custom category the master lacks brings that category definition along.
// The caller validates the result (validateMapData) before saving it.
import { ID_RE, CATEGORY_KEY_RE } from "./schema.js";

export const MAX_CHANGES = 2000;
const ACTIONS = new Set(["upsert", "delete"]);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Checks a request's change list. -> {ok: true, changes} (clean copies) | {ok: false, error, field: "changes"} */
export function validateChanges(raw) {
  const bad = (error) => ({ ok: false, error, field: "changes", itemId: null });
  if (!Array.isArray(raw)) return bad("changes must be a list.");
  if (raw.length > MAX_CHANGES) return bad(`At most ${MAX_CHANGES} changes at a time.`);
  const changes = [];
  for (const c of raw) {
    if (!isObj(c) || !ACTIONS.has(c.action)) return bad("Each change needs an action: upsert or delete.");
    const hasId = c.id !== undefined;
    const hasCat = c.category !== undefined;
    if (hasId === hasCat) return bad("Each change names either an item id or a category.");
    if (hasId) {
      if (typeof c.id !== "string" || !ID_RE.test(c.id)) return bad("A change names a bad item id.");
      changes.push({ id: c.id, action: c.action });
    } else {
      if (typeof c.category !== "string" || !CATEGORY_KEY_RE.test(c.category)) return bad("A change names a bad category.");
      changes.push({ category: c.category, action: c.action });
    }
  }
  return { ok: true, changes };
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const isCustomKey = (k) => /^c_/.test(k);

/**
 * master, source: validated map data ({items, categories}); changes: from validateChanges.
 * -> {ok: true, data, applied, addedCategories} | {ok: false, error, field, itemId}
 * Never changes its inputs.
 */
export function applyChanges(master, source, changes) {
  const items = clone(master.items || []);
  const cats = clone(master.categories || []);
  const srcItems = new Map((source.items || []).map((it) => [it.id, it]));
  const srcCats = new Map((source.categories || []).map((c) => [c.key, c]));
  let applied = 0;
  const upserted = [];
  for (const ch of changes) {
    if (ch.id !== undefined) {
      const i = items.findIndex((it) => it.id === ch.id);
      if (ch.action === "delete") {
        if (i >= 0) {
          items.splice(i, 1);
          applied++;
        }
        continue;
      }
      const it = srcItems.get(ch.id);
      if (!it) return { ok: false, error: "A change names an item that isn't in that map.", field: "changes", itemId: ch.id };
      if (i >= 0) items[i] = clone(it);
      else items.push(clone(it));
      upserted.push(it);
      applied++;
    } else {
      const key = ch.category;
      const i = cats.findIndex((c) => c.key === key);
      if (ch.action === "delete") {
        if (i >= 0) {
          cats.splice(i, 1);
          applied++;
        }
        continue;
      }
      const def = srcCats.get(key);
      if (def) {
        if (i >= 0) cats[i] = clone(def);
        else cats.push(clone(def));
        applied++;
      } else if (!isCustomKey(key)) {
        // the map uses the default as it is: drop the master's override
        if (i >= 0) cats.splice(i, 1);
        applied++;
      } else {
        return { ok: false, error: "A change names a category that isn't in that map.", field: "changes", itemId: null, category: key };
      }
    }
  }
  // department blocks bring their custom category along when the master doesn't have it yet
  const addedCategories = [];
  for (const it of upserted) {
    if (it.type !== "area" || typeof it.cat !== "string" || !isCustomKey(it.cat)) continue;
    if (cats.some((c) => c.key === it.cat) || !items.some((x) => x.id === it.id)) continue;
    const def = srcCats.get(it.cat);
    if (def) {
      cats.push(clone(def));
      addedCategories.push(it.cat);
    }
  }
  const data = { ...clone(master), items, categories: cats };
  return { ok: true, data, applied, addedCategories };
}
