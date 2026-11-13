# Camera projection demo: mobile compatibility notes

This note records the mobile compatibility work for `camera-projection.html` so a future maintainer or coding agent can see what changed and what still needs device-level verification.

## Changes

- Removed the remote KaTeX dependency from the demo. The live camera matrices are rendered as HTML tables, avoiding external math-font loading and improving readability on narrow screens.
- Removed the import-map requirement for loading Three.js and bumped the camera CSS/module cache versions so mobile browsers do not keep stale math and rendering assets.
- Adjusted the demo styles for small viewports and touch interaction. Touch scrolling remains available outside the interactive world canvas.
- Reduced rendering cost on compact screens by disabling antialiasing and shadows, limiting pixel ratio and frame rate, and pausing rendering while the page is hidden.
- Added pointer-cancel handling and corrected matrix value formatting, including translation precision and the rig matrix label.
- Typeset the technical-detail equations and static rotation matrices with LaTeX rendered to SVG by MathJax, loaded only when the disclosure is opened. The live numeric matrices remain HTML so they update without a math-rendering dependency.
- Changed the live matrix delimiters to explicit square brackets; the previous plain vertical rules looked like determinant notation.
- Added a visible status note when WebGL renderer creation fails or its context is lost. This keeps the rotation readout and controls available and explains that browser restrictions such as iPhone Lockdown Mode can prevent the 3D scene from rendering.
- Made the rotation visualizer canvas use its rendered width (including narrow phone widths) and redraw when its expanded panel changes size.

## Verification

- `node --check demos/camera-projection.js`
- `node --check demos/camera-projection-view.js`
- `node --test demos/camera-projection.test.js`
- `git diff --check`
- Manually checked MathJax SVG rendering in desktop Chrome at a 390 px viewport. Equations and rotation matrices rendered without horizontal page overflow, and the console had no errors.
- Physical iPhone Safari and Chrome checks remain necessary. Lockdown Mode/WebGL behavior cannot be confirmed by desktop emulation.

Chrome device emulation is not a substitute for testing on a physical iPhone. Please verify Safari on iOS and at least one Android browser when a device is available.
