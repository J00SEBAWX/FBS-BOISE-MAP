/* Brand sections (owner, Oct 12): every Power Tools block is one brand's section (Milwaukee, DeWalt or Makita, picked
 * when it is placed), and the Simpson Strong-Tie department is Simpson's. A brand section gets the brand's 12" x 12"
 * floor tiles, a tasteful wash of light in its colour, and a neon sign with its name and logo (plan2d/plan.js,
 * view3d/brand-zones.js).
 * Colours: the primary colour each brand's own website uses (Oct 12, 2026): Milwaukee #DB011C, DeWalt #FEBD17,
 * Makita #008290 (its site's teal; the logo itself is red), Simpson Strong-Tie #FF5308 (its logo's orange).
 * Logos: Wikimedia Commons (public domain as simple text logos: DeWalt Logo.svg, Makita Logo.svg), and the brands' own
 * site headers for Milwaukee (the same artwork as Commons' Milwaukee Logo.svg) and Simpson Strong-Tie. They are
 * trademarks of their owners (public/assets/brands/README.md). */

export const POWER_TOOLS = "power_tools";
export const SIMPSON_DEPT = "simpson_strongtie";

/**
 * Brand -> how its section looks. tiles: the two tile colours (checkerboard); light: the colour of its light and neon;
 * logoOnLight: the logo has no box of its own (Milwaukee's red mark), so the sign shows it on a lit white panel.
 */
export const BRANDS = Object.freeze({
  milwaukee: Object.freeze({key: "milwaukee", name: "Milwaukee", primary: "#DB011C", tiles: ["#DB011C", "#1C1C1C"], light: "#FF3344", logo: "/assets/brands/milwaukee.svg", logoAspect: 241 / 108, logoOnLight: true}),
  dewalt: Object.freeze({key: "dewalt", name: "DeWalt", primary: "#FEBD17", tiles: ["#FEBD17", "#1C1C1C"], light: "#FFC93C", logo: "/assets/brands/dewalt.png", logoAspect: 740 / 226}),
  makita: Object.freeze({key: "makita", name: "Makita", primary: "#008290", tiles: ["#008290", "#1C1C1C"], light: "#2FD3E0", logo: "/assets/brands/makita.png", logoAspect: 764 / 245}),
  simpson: Object.freeze({key: "simpson", name: "Simpson Strong-Tie", primary: "#FF5308", tiles: ["#FF5308", "#1C1C1C"], light: "#FF7A33", logo: "/assets/brands/simpson.svg", logoAspect: 84.5 / 53.4}),
});

/** The brands a Power Tools block must be one of, in the order the picker shows them. */
export const POWER_BRANDS = Object.freeze(["milwaukee", "dewalt", "makita"]);

/** True when placing a block of this department needs a brand picked first. */
export const needsBrand = catKey => catKey === POWER_TOOLS;

/** The brand of a department block (a BRANDS entry), or null: Power Tools blocks by their pick, Simpson's by its department. */
export function brandOf(it) {
  if (!it || it.type !== "area") return null;
  if (it.cat === SIMPSON_DEPT) return BRANDS.simpson;
  if (it.cat === POWER_TOOLS && POWER_BRANDS.includes(it.brand)) return BRANDS[it.brand];
  return null;
}

/** A Power Tools block nobody has picked a brand for yet (older maps, or a block moved into Power Tools). */
export const missingBrand = it => !!it && it.type === "area" && it.cat === POWER_TOOLS && !POWER_BRANDS.includes(it.brand);

/** The label on a block: "POWER TOOLS · MILWAUKEE"; Simpson's department already says its name. */
export function brandSuffix(it) {
  if (missingBrand(it)) return "PICK A BRAND";
  const b = brandOf(it);
  return b && it.cat === POWER_TOOLS ? b.name.toUpperCase() : "";
}
