# Spider Pulsar

An interactive 3D visualization of a transitional millisecond pulsar, loosely modeled on **PSR J1023+0038**: a
neutron star and a low-mass companion star that periodically switches
between a rotation-powered radio pulsar state and an accretion-powered
X-ray state.

**Live demo:** https://maksatsat.github.io/spiders-animation/

This is an illustrative animation only — sizes, distances, and timescales
are not to scale, and the physics is simplified for clarity rather than
precision.

## What it shows

The main slider drives four states:

- **Rotation-powered** — the neutron star spins down as an ordinary radio
  pulsar, its radio and gamma-ray beams sweeping past, with an intrabinary
  shock where the pulsar wind slams into the companion's ablated wind.
- **Low X-ray mode** and **High X-ray mode** — the pulsar wind shuts off and
  an accretion disk forms instead, truncated at different radii, with a
  compact jet and (in high mode) hot spots where infalling material funnels
  onto the magnetic poles.
- **Mode switching** — the system flips between the low and high states on
  randomized timescales (drawn from an exponential distribution around a
  mean of a few seconds), the way PSR J1023+0038 itself was observed to do,
  with live strip-chart telemetry of X-ray/gamma-ray/radio behavior across
  each switch.

Other panels let you explore the system further:

- **Light curves (2 orbits)** — gamma-ray, X-ray, optical, and radio flux
  vs. orbital phase over two cycles, with a marker tracking the live
  orbital position. The X-ray shape is digitized from real double-peaked
  orbital modulation data (`lc.txt`); radio shows a smooth eclipse at
  superior conjunction; optical blends between an irradiation-dominated
  curve and a lower-amplitude ellipsoidal-modulation curve as you move the
  irradiation slider.
- **Irradiation slider** — controls how strongly the pulsar heats the
  companion's facing hemisphere, from a uniform, dark, unirradiated star up
  to the fully heated/glowing look, and correspondingly reshapes the
  optical light curve.
- **Filter** — pick an emission band (radio, optical, X-ray, gamma-ray) to
  highlight only the sources that actually emit in that band for the
  current mode; everything else fades to grayscale.
- **Camera** — jump between an Earth-like sightline, the orbital plane, a
  top-down view, or a free `OrbitControls` camera, plus a one-click reset
  that places the system at orbital phase 0 (the pulsar's ascending node,
  with the two stars on the line perpendicular to the line of sight) and
  restarts the light-curve phase.

Every panel can be dragged to a new position, hidden with its own close
button, and brought back from the hamburger menu (top-right), which also
lists a hidden **About** panel with credits and sources.

## Running locally

```bash
npm install
npm run dev       # start the dev server
npm run build     # production build to dist/
npm run preview   # preview the production build
```

Requires a browser with WebGPU support (recent Chrome/Edge).

## Tech

Plain [Vite](https://vitejs.dev/) + [three.js](https://threejs.org/)
(WebGPU renderer, TSL node materials), no framework — a small hand-rolled
state store and DOM-based control panel.

## Credits

Made by Maksat Satybaldiev, built entirely with
[Claude Code](https://claude.com/claude-code).

Visually inspired by:

- [singularity.misterprada.com](https://singularity.misterprada.com/)
- [NASA SVS 11567](https://svs.gsfc.nasa.gov/11567)
- [NASA SVS 11215](https://svs.gsfc.nasa.gov/11215)

It represents the phenomena (physical effects) and models from the
following works:

- [Satybaldiev & Linares 2026](https://ui.adsabs.harvard.edu/abs/2026arXiv260713019S/abstract)
- [Satybaldiev, Linares, Vecchiotti 2026](https://ui.adsabs.harvard.edu/abs/2026ApJ...998...94S/abstract)
- [Baglio et al. 2023](https://ui.adsabs.harvard.edu/abs/2023A%26A...677A..30B/abstract)
- [Turchetta et al. 2023](https://ui.adsabs.harvard.edu/abs/2023MNRAS.525.2565T)
- [Papitto et al. 2019](https://ui.adsabs.harvard.edu/abs/2019ApJ...882..104P)
- [Veledina et al. 2019](https://ui.adsabs.harvard.edu/abs/2019ApJ...884..144V)
- [Bogdanov et al. 2018](https://ui.adsabs.harvard.edu/abs/2018ApJ...856...54B)
- [Wadiasingh et al. 2017](https://ui.adsabs.harvard.edu/abs/2017ApJ...839...80W), [2018](https://ui.adsabs.harvard.edu/abs/2018ApJ...869..120W)
- [Romani & Sanchez 2016](https://ui.adsabs.harvard.edu/abs/2016ApJ...828....7R/abstract)
- [Linares 2014](https://ui.adsabs.harvard.edu/abs/2014ApJ...795...72L)
- [Papitto et al. 2013](https://ui.adsabs.harvard.edu/abs/2013Natur.501..517P/)
- [Archibald et al. 2009](https://ui.adsabs.harvard.edu/abs/2009Sci...324.1411A)
