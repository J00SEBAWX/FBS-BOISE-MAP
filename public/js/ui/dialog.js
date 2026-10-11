/* The Controls dialog (help). A native <dialog>: it traps focus, Esc closes it, focus goes back to the
 * button that opened it. */
export function initHelp({onOpen} = {}) {
  const help = document.getElementById("help");
  const openers = [document.getElementById("helpBtn")].filter(Boolean);
  let opener = null;
  function open(from) {
    if (help.open) return;
    opener = from || document.activeElement;
    if (onOpen) onOpen();
    if (typeof help.showModal === "function") help.showModal(); else help.setAttribute("open", "");
    document.getElementById("helpTitle").focus({preventScroll: true});
    help.scrollTop = 0; // start at the top, not at the "Got it" button
  }
  function close() { if (typeof help.close === "function") help.close(); else help.removeAttribute("open"); }
  for (const b of openers) b.addEventListener("click", () => open(b));
  document.getElementById("helpClose").addEventListener("click", close);
  document.getElementById("helpX").addEventListener("click", close);
  help.addEventListener("click", e => { if (e.target === help) close(); }); // click on the backdrop
  help.addEventListener("close", () => { if (opener && opener.focus) opener.focus(); });
  help.addEventListener("keydown", e => e.stopPropagation()); // the map's keys don't fire behind the dialog
  return {open, close, get isOpen() { return help.open; }};
}
