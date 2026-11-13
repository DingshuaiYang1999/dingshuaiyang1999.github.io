# Camera projection demo: mobile compatibility notes

This note records the mobile compatibility work for `camera-projection.html` so a future maintainer or coding agent can see what changed and what still needs device-level verification.

## Changes

- Removed the remote KaTeX dependency from the demo. The live camera matrices are rendered as HTML tables, avoiding external math-font loading and improving readability on narrow screens.
- Removed the import-map requirement for loading Three.js and bumped the camera CSS/module cache versions so mobile browsers do not keep stale math and rendering assets.
- Adjusted the demo styles for small viewports and touch interaction. Touch scrolling remains available outside the interactive world canvas.
- Reduced rendering cost on compact screens by disabling antialiasing and shadows, limiting pixel ratio and frame rate, and pausing rendering while the page is hidden.
- Added pointer-cancel handling and corrected matrix value formatting, including translation precision and the rig matrix label.

## Verification

- `node --check demos/camera-projection.js`
- `node --check demos/camera-projection-view.js`
- `node --test demos/camera-projection.test.js`
- `git diff --check`
- Manually checked the page in desktop Chrome and a 400 × 759 mobile viewport using Chrome device emulation. Controls updated the displayed matrices and projected point in both layouts; no page errors appeared in the console.

Chrome device emulation is not a substitute for testing on a physical iPhone. Please verify Safari on iOS and at least one Android browser when a device is available.
