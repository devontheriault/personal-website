/*
  Textures and materials for the pictures the studio draws.
*/

import * as THREE from "three";

/*
  A texture whose picture arrives later, from the studio (art/studio.js),
  as an ImageBitmap already stored upside down, the way WebGL wants it.
  `mirror` runs the image the other way across (a verso, which lies on
  the back of its Leaf); `upsideDown` turns it half round.
*/
export function pictureTexture({ anisotropy = 1, srgb = true, repeat = false, mirror = false, upsideDown = false } = {}) {
  const t = new THREE.Texture();
  t.flipY = false;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (mirror) {
    t.repeat.x = -1;
    t.offset.x = 1;
  }
  if (upsideDown) {
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI;
  }
  return t;
}

/*
  Put a picture on a texture. Once it is uploaded the bitmap is let go
  (the GPU has its own copy), unless it's to be `kept` for another
  texture. A texture never changes size: a new size needs a new texture.
*/
export function show(texture, image, { keep = false } = {}) {
  texture.image = image;
  texture.onUpdate = keep ? null : () => image.close();
  texture.needsUpdate = true;
}

// cloth stamped in foil or blind (cover-art.js): colour, roughness/metal, height
export function stampedMaterial(maps) {
  return new THREE.MeshStandardMaterial({
    map: maps.color,
    roughnessMap: maps.orm,
    metalnessMap: maps.orm,
    roughness: 1,
    metalness: 1,
    bumpMap: maps.bump,
    bumpScale: 1.4,
  });
}

// the three maps of a stamped face, waiting for their pictures
export function stampedMaps(opts) {
  return {
    color: pictureTexture(opts),
    orm: pictureTexture({ ...opts, srgb: false }),
    bump: pictureTexture({ ...opts, srgb: false }),
  };
}

// the soft dark pool the Journal casts on the table
export function radialShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(0, 0, 0, 0.9)");
  g.addColorStop(0.45, "rgba(0, 0, 0, 0.55)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
