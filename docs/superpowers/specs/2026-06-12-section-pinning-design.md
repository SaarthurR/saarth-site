# Section pinning + plateau particle morph

**Date:** 2026-06-12
**Status:** Approved

## Problem

Particle shapes only fully materialize at the exact scroll instant a section's
center crosses the viewport center (`main.js` maps viewport center continuously
between section centers). Any further scroll immediately starts morphing toward
the next shape, and sections flow past without ever holding position.

## Decision

Pin every `[data-shape]` section (hero, projects intro, 4 projects, Now, Tabla,
Contact) at viewport center for **+40% of a viewport height** of extra scroll,
using GSAP ScrollTrigger (`start: "center center"`, `end: "+=40%"`, `pin: true`,
default pinSpacing).

Pair the short pins with **Lenis snap** (`lenis/snap`, type `mandatory`): when
the user stops scrolling, the page glides to the middle of the nearest pin
window, so sections settle centered on their own instead of requiring a full
scroll-through. Snap points rebuild on ScrollTrigger refresh (resize). Skipped
for reduced-motion users (no Lenis).

Drive the particle morph from the pin windows instead of section-center anchors:

- Inside section *i*'s pin window (`trigger.start <= scrollY <= trigger.end`):
  shape index is exactly *i* — fully formed and stable.
- Between section *i*'s pin end and section *i+1*'s pin start: index
  interpolates linearly *i → i+1*, so morphing happens only during travel.

The manual `refreshAnchors` bookkeeping is deleted; ScrollTrigger's own refresh
recomputes pin positions on resize.

## Alternatives rejected

- **Scroll snapping** — snaps to a section but doesn't hold it; easy to flick
  past and doesn't create a morph plateau.
- **Fixed-viewport virtual slides** — full page rebuild for the same feel.

## Notes

- Pinned sections remain live DOM, so the tabla pads stay playable while held.
- Reduced-motion users keep pins (positional, not animated); Lenis stays off.
- Pins are created before the reveal/stat ScrollTriggers so refresh ordering
  accounts for pin spacers.
