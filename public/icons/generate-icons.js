/**
 * Run: node public/icons/generate-icons.js
 * Generates PWA icons from SVG using canvas (Node 18+ with --experimental-fetch)
 * For production, replace with pre-rendered PNGs.
 */
const { createCanvas } = require("canvas"); // npm i canvas
const fs = require("fs");
const path = require("path");

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const s = size;

  // Background
  ctx.fillStyle = "#030308";
  ctx.fillRect(0, 0, s, s);

  // Shield shape
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.35;

  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r, cy - r * 0.7, cx + r, cy);
  ctx.quadraticCurveTo(cx + r, cy + r * 0.8, cx, cy + r);
  ctx.quadraticCurveTo(cx - r, cy + r * 0.8, cx - r, cy);
  ctx.quadraticCurveTo(cx - r, cy - r * 0.7, cx, cy - r);
  ctx.closePath();

  const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, "#00e5ff");
  grad.addColorStop(1, "#0066aa");
  ctx.fillStyle = grad;
  ctx.fill();

  // Orbit ring
  ctx.strokeStyle = "rgba(255,109,0,0.8)";
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.7, r * 0.35, -0.4, 0, Math.PI * 2);
  ctx.stroke();

  // Asteroid dot
  ctx.fillStyle = "#ff6d00";
  ctx.beginPath();
  ctx.arc(cx + r * 0.5, cy - r * 0.2, s * 0.04, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toBuffer("image/png");
}

SIZES.forEach((size) => {
  const buf = drawIcon(size);
  const outPath = path.join(__dirname, `icon-${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`✓ icon-${size}.png`);
});