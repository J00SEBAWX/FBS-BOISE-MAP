/* The grab bar of a phone bottom sheet (docs/DESIGN.md 4.3 and 5: "peek = header + progress + first rows,
 * expanded = the whole list"). The Departments palette and the mode panels (Comparison, Advisor, Review) are
 * bottom sheets on phones; this adds the same 36 x 4 pill the inspector has, which switches the sheet between
 * its peek height and its expanded height (the CSS reads data-sheet). The pill only shows on phones (CSS); a
 * sheet that closes comes back at peek height. */
import {h} from "./dom.js";

export function attachSheetGrab(el) {
  const grab = h("button", {type: "button", class: "sheet-grab", aria: {label: "Show more", expanded: false}}, h("span", {class: "grab-bar"}));
  el.dataset.sheet = "peek";
  function set(s) {
    el.dataset.sheet = s;
    grab.setAttribute("aria-label", s === "expanded" ? "Show less" : "Show more");
    grab.setAttribute("aria-expanded", String(s === "expanded"));
  }
  grab.addEventListener("click", () => set(el.dataset.sheet === "expanded" ? "peek" : "expanded"));
  el.prepend(grab);
  // closing the sheet resets it, so it opens at peek height next time
  new MutationObserver(() => { if (!el.classList.contains("open") && el.dataset.sheet !== "peek") set("peek"); }).observe(el, {attributes: true, attributeFilter: ["class"]});
  return {set, get state() { return el.dataset.sheet; }};
}
