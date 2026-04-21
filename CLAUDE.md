# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Type-check and build for production (tsc -b && vite build)
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

No test suite is configured.

## Architecture

SuperLens is a single-page React app for adding magnifier/zoom annotations to images. The entire application lives in one React component (`src/components/SuperLens.tsx`) backed by a flat `AppState` object (`src/types.ts`).

**Rendering:** The canvas is a Konva `<Stage>` via `react-konva`. The layer order matters: base image → black opacity overlay → connection lines → source shape → magnifier group → transformers.

**Two-shape model:** There is a **source** shape (the region being magnified, shown with a dashed border) and a **target** shape (the magnifier lens, shows the zoomed content). Both are stored as `ShapeConfig` in `AppState` and can be either `'rect'` or `'circle'`.

**Coordinate conventions (critical):**
- `Rect` shapes: `(x, y)` is the **top-left corner** (Konva default)
- `Circle` shapes: `(x, y)` is the **center** (Konva default)
- `width` on a circle stores the **diameter** (radius = width/2)
- Shape conversion (`convertShapePreserveCenter`) normalizes between the two systems when switching shape types

**Magnifier rendering:** The target group uses a Konva `clipFunc` to clip a scaled copy of the full image. The image offset is calculated so the source region appears centered inside the target:
```
imgX = targetCenterInGroup.x - sourceCenter.x * magnification
imgY = targetCenterInGroup.y - sourceCenter.y * magnification
```

**Transformers:** Konva `<Transformer>` nodes attach to `sourceRef`/`targetRef`. After a transform, `handleTransformEnd` bakes the scale into `width`/`height` and resets `scaleX`/`scaleY` to 1. The target shape lives inside a `<Group>` (the magnifier group), so its local position is reset to `(0,0)` and the group is moved to the absolute position instead.

**Connection lines:** `src/utils/geometry.ts` provides two functions:
- `getRectConnectionPoints` — connects matching corners of two rects (TL↔TL, TR↔TR, etc.)
- `getCircleTangents` — computes external tangent lines between two circles

Mixed shape types (one rect, one circle) fall back to the rect corner strategy by converting the circle to its bounding box.

**Export:** Uses `stage.toDataURL()` with `pixelRatio = originalImageWidth / displayedWidth` to output at the original image's resolution. "Magnifier only" mode hides the source shape and connection lines before capturing.

**Background dimming:** Implemented as a black `<Rect>` overlay with `opacity = 1 - backgroundOpacity` on top of the base image, rather than changing the image's own opacity.

**Sidebar:** Right-side panel with a draggable resizer (250–600px wide). Controls map directly to `AppState` fields via `setState` spread updates.

## Stack

- React 19 + TypeScript, built with Vite
- Konva / react-konva for canvas rendering
- Tailwind CSS v3 for sidebar styling
- `use-image` for async image loading into Konva
- `lucide-react` for icons
