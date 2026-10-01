# Council Audit: FBS MAP Planning Studio
**Model:** Gemini 3.1 Pro
**Date:** September 10, 2026

To answer your request to "extremely audit this," I bypassed surface-level feature checklists and focused entirely on the structural integrity of the application, its readiness for high-stakes sales conversations, and the security of your reference photos. 

I approached this audit by spinning up the local application environment in Chromium using Playwright, inspecting the React component logic, reverse-engineering the coordinate plane, and auditing the git tracking history. 

Here are the findings, ranked by impact.

---

### 1. Delivery Risk: The PDF is still tracked in Git (Critical)
While the `fbs-map` application folder contains only 3D models (`.glb` files) and JSON coordinates—which correctly avoids exposing photos—**your current repository structure is unsafe for a Cloudflare Pages or GitHub handoff.**

- **The Issue:** The `.git` repository was initialized at the root of your workspace (`/files/.git`), not inside the `/files/fbs-map/` application directory. 
- **The Risk:** If you push the current repository to GitHub as instructed in `docs/CLOUDFLARE.md`, the `fbs-boise-store-photos.pdf` file (located in `files/`) will be uploaded to GitHub. Even if the repository is private, this violates the specific security parameter that reference photos should not be included in the repository.
- **Evidence:** `git ls-tree -r HEAD` shows `100644 blob ... fbs-boise-store-photos.pdf` tracked on line 7 of the index.

### 2. Spatial Accuracy: The 11-foot Envelope Discrepancy (High)
The app successfully delivers a 3D visualization, but its spatial dimensions have an unverified flaw that will be exposed immediately if management audits the floor area. 
- **The Issue:** The PDF cover page (Page 1) claims an envelope of 180 ft × 80 ft. However, the application's underlying schema (`public/model.pascal.json`, `metadata.fbs.note`) explicitly states: *"Apparent drawing bays total 169 ft, not 180 ft. Overall length remains unresolved."*
- **Sales Usability Impact:** If a manager uses the measurement tool (which is accurately implemented with 1 ft snapping) to confirm aisle capacities in the West Warehouse, the 11-foot difference in the X-axis means your proposed layout may physically not fit the building.
- **Visual Evidence:** The UI safely hedges this by labeling the bottom right corner: *"180 × 80 ft Working envelope, not net area"*, but this does not resolve the physical truth of the remodeling space.

### 3. App Fidelity & Sales Usability: Immovable Object Invariants (Pass)
The core requirement—that walls, Tom's desk, and sales desks remain fixed while the West Warehouse items can move—is flawlessly enforced at the component level, not just visually.
- **Evidence:** In `src/FloorPlan.jsx:19`, the drag event evaluates `if(!isItem(node)||isLocked(node,authority))return;`. If an item is locked, the drag function terminates instantly. 
- **Validation:** In `src/App.jsx:50`, numeric input coordinates for locked items are disabled (`disabled={locked}`). The bounding-box selection explicitly removes the "Grab" pointer on locked items. 
- **Sales Usability:** In a live walkthrough, you have zero risk of accidentally moving a load-bearing wall or a permanent desk. The independent scenario tabs ("Current draft" vs. "Remodel sandbox") store separate state histories, meaning you can pivot between the current reality and the proposed vision without corrupting either. 

### 4. Presentation Quality: Hitting the Design Bar (Pass, with distinction)
The application achieves a stunning level of "Apple naturalism" and "restrained motion." It avoids the generic "AI dashboard" aesthetic entirely.
- **Typography & Scale:** The interface leverages *Satoshi* (`src/style.css:2`) via Fontshare, implementing a highly legible, clamped typographic scale (`clamp` functions in `style.css:4-7`).
- **Color & WCAG Compliance:** Using Franklin Building Supply's brand green (`#227546`), the interface maps a clean Nexus/Gravity UI palette across light and dark modes. The dark mode (`style.css:22`) properly inverts the canvas dots and grid lines (`--plan-grid:#9aac90`) so that it remains usable in low-light environments.
- **Kineticism:** The 2D-to-3D transitions and modal panels snap into place without lingering "cursor trails" or over-animated elements. 
- **Mobile Readability:** Playwright testing at 375×812 (`/home/user/workspace/mobile-view.jpg`) confirms the UI condenses to a hamburger menu and pushes the Inspector into a bottom-sheet drawer. The 3D canvas correctly dominates the mobile viewport. Other UI states captured during the audit include the primary desktop view (`/home/user/workspace/desktop-view-2.jpg`) and the 2D dark mode view (`/home/user/workspace/desktop-2d-dark.jpg`).

### 5. Architectural Orientation: The North Arrow (Pass)
A common failure in 3D-to-2D mapping tools is camera-relative cardinal directions. The app correctly anchors North.
- **Evidence:** The 2D plan (`docs/screenshots/fbs-2d-final.png`) correctly prints `NORTH - YARD / WILL CALL SIDE` at the top (negative Z in Three.js coordinates) and `SOUTH - FRONT OF STORE` at the bottom, perfectly aligning with the PDF orientation logic (Page 1: Yard doors next to Milwaukee wall). 

---

### Priority Fix List Before Handoff

1. **Destroy the current `.git` directory and re-initialize.** Run `rm -rf /home/user/workspace/projects/fbs-map-UDEjwEPFTx6OFs1.XgiSKA/files/.git` to ensure the PDF is permanently untracked. Then, `cd fbs-map && git init` so *only* the application directory is committed to GitHub.
2. **Clarify the 169 ft vs 180 ft discrepancy.** Before a live sales presentation, use a laser measure on-site along the X-axis (West to East) to confirm if the building is truly 180 feet or if the 169-foot architectural bays represent the true inner usable space. If the building is only 169 feet long, your West Warehouse merchandise plan is overly optimistic.
3. **Set Cloudflare Access.** As outlined in `docs/CLOUDFLARE.md`, deploying to Pages will expose the 3D model geometry to the public. You must enforce Cloudflare Access on the Pages preview and production URLs immediately upon deployment to keep the internal store configuration restricted to FBS employees.