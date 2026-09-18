import { vec3, mix } from 'three/tsl';

// The shared "not part of the selected emission-band filter" look: blends a
// color node toward a darker grayscale version of itself as `dimAmount`
// (a uniform/node, 0 = normal, 1 = fully dimmed) goes from 0 to 1.
export function dimColor(colorNode, dimAmount, { fade = 0.55 } = {}) {
  const luma = colorNode.r.mul(0.299).add(colorNode.g.mul(0.587)).add(colorNode.b.mul(0.114));
  const gray = vec3(luma, luma, luma).mul(1 - fade);
  return mix(colorNode, gray, dimAmount);
}
