/* "Which brand is this section?": the must-pick step before a Power Tools block is placed (core/brands.js). Three
 * big buttons with each brand's logo; nothing is placed until one is picked (Cancel or Esc places nothing). */
import {h, modal} from "./dom.js";
import {BRANDS, POWER_BRANDS} from "../core/brands.js";

/** createBrandPicker() -> {pick(deptName) -> Promise<brand key | null>} */
export function createBrandPicker() {
  let resolve = null, chosen = null;
  const title = h("h2", {id: "brandPickTitle", tabindex: -1, text: "Which brand is this section?"});
  const buttons = POWER_BRANDS.map(k => {
    const b = BRANDS[k];
    return h("button", {type: "button", class: "brand-pick", data: {brand: k}, style: {"--brand": b.primary}, onclick: () => { chosen = k; dlg.close("ok"); }},
      h("img", {src: b.logo, alt: "", width: 120, height: Math.round(120 / b.logoAspect)}),
      h("span", {class: "brand-pick-name", text: b.name}));
  });
  const el = h("dialog", {class: "small-dialog brand-dlg", aria: {labelledby: "brandPickTitle", describedby: "brandPickText"}},
    h("div", {class: "dialog"},
      h("div", {class: "dialog-head"}, title),
      h("p", {id: "brandPickText", class: "brand-pick-text", text: "Each Power Tools block is one brand's section, with that brand's floor tiles, lights and sign. Pick one to place it."}),
      h("div", {class: "brand-pick-row"}, ...buttons),
      h("div", {class: "foot"}, h("button", {type: "button", class: "btn ghost", onclick: () => dlg.close("cancel")}, "Cancel"))));
  document.body.appendChild(el);
  const dlg = modal(el, {onClose: () => { const r = resolve; resolve = null; if (r) r(chosen); }});
  return {
    pick(deptName) {
      chosen = null;
      title.textContent = `${deptName || "Power Tools"}: which brand is this section?`;
      return new Promise(res => { resolve = res; dlg.open(buttons[0]); });
    },
  };
}
