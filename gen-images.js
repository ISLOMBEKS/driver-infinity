// Generates placeholder PNG images for the Base Mini App
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

function crc32(buf) {
  let c = 0xFFFFFFFF;
  const t = [];
  for (let i = 0; i < 256; i++) {
    let v = i;
    for (let j = 0; j < 8; j++) v = (v & 1) ? (0xEDB88320 ^ (v >>> 1)) : (v >>> 1);
    t[i] = v;
  }
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const tb  = Buffer.from(type);
  const crcB = Buffer.alloc(4); crcB.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([len, tb, data, crcB]);
}

function makePNG(width, height, pixelFn) {
  const sig  = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]=8; ihdr[9]=2; // 8-bit RGB

  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const [r,g,b] = pixelFn(x, y, width, height);
      row[1+x*3]=r; row[2+x*3]=g; row[3+x*3]=b;
    }
    rows.push(row);
  }
  const idat = zlib.deflateSync(Buffer.concat(rows));

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, 'public');

// icon.png — 1024×1024, Base blue circle on dark bg
fs.writeFileSync(path.join(out, 'icon.png'), makePNG(1024, 1024, (x, y, w, h) => {
  const cx = w/2, cy = h/2, r = w*0.48;
  const dist = Math.sqrt((x-cx)**2 + (y-cy)**2);
  if (dist < r) {
    // Blue circle (Base blue #0052FF)
    const inner = dist < r * 0.6;
    return inner ? [0, 60, 220] : [0, 82, 255];
  }
  return [13, 17, 23]; // dark bg
}));
console.log('✓ icon.png');

// splash.png — 200×200
fs.writeFileSync(path.join(out, 'splash.png'), makePNG(200, 200, (x, y, w, h) => {
  const cx=w/2, cy=h/2, r=w*0.42;
  const dist = Math.sqrt((x-cx)**2+(y-cy)**2);
  return dist < r ? [0,82,255] : [13,17,23];
}));
console.log('✓ splash.png');

// hero.png — 1200×630, gradient blue→dark
fs.writeFileSync(path.join(out, 'hero.png'), makePNG(1200, 630, (x, y, w, h) => {
  const t = x / w;
  const r = Math.round(0   + t * 13);
  const g = Math.round(52  - t * 35);
  const b = Math.round(255 - t * 232);
  // Road stripe in middle
  const mid = h / 2;
  if (Math.abs(y - mid) < h * 0.08) return [44, 44, 44];
  if (Math.abs(y - mid) < h * 0.09) return [255, 204, 0];
  return [Math.max(0,r), Math.max(0,g), Math.max(10,b)];
}));
console.log('✓ hero.png');

console.log('\nAll images generated in public/');
