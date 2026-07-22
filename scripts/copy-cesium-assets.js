const fs = require("fs");
const path = require("path");

const cesiumSource = path.join(
  __dirname,
  "..",
  "node_modules",
  "cesium",
  "Build",
  "Cesium"
);
const cesiumDest = path.join(__dirname, "..", "public", "cesium");

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn("Cesium source not found at:", src);
    return;
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log("Copying CesiumJS static assets to /public/cesium ...");
copyRecursiveSync(cesiumSource, cesiumDest);
console.log("Cesium assets copied successfully.");