/**
 * generate-icons.cjs
 * Genera todos los iconos PWA a partir de public/logo.png
 * El logo debe ser PNG (blanco con fondo transparente o cualquier formato).
 *
 * Ejecutar: node scripts/generate-icons.cjs
 */

const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');

// Color de fondo de la marca SmartCloud: Indigo #4f46e5
const BG_COLOR = 0x4f46e5ff;

const ROOT = path.join(__dirname, '..');
const LOGO_PATH = path.join(ROOT, 'public', 'logo.png');
const ICONS_DIR = path.join(ROOT, 'public', 'icons');

if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });

async function makeIcon(size, paddingFraction, outputPath) {
  // 1. Fondo solido con color de marca
  const bg = new Jimp({ width: size, height: size, color: BG_COLOR });

  // 2. Cargar y redimensionar el logo manteniendo proporciones
  const logoMaxSize = Math.round(size * (1 - paddingFraction * 2));
  const logo = await Jimp.read(LOGO_PATH);
  logo.contain({ w: logoMaxSize, h: logoMaxSize });

  // 3. Centrar el logo sobre el fondo
  const x = Math.round((size - logo.bitmap.width) / 2);
  const y = Math.round((size - logo.bitmap.height) / 2);
  bg.composite(logo, x, y);

  // 4. Guardar
  await bg.write(outputPath);
  console.log(`  OK: ${path.relative(ROOT, outputPath).replace(/\\/g, '/')} (${size}x${size}px)`);
}

async function run() {
  console.log('\n=== Generando iconos PWA ===\n');

  if (!fs.existsSync(LOGO_PATH)) {
    console.error('ERROR: No se encontro public/logo.png');
    console.error('       Coloca tu logo en esa ruta y vuelve a ejecutar este script.');
    process.exit(1);
  }

  // --- Android / Chrome / PC ---
  // Icono estandar (manifest.webmanifest)
  await makeIcon(192, 0.18, path.join(ICONS_DIR, 'icon-192.png'));
  await makeIcon(512, 0.18, path.join(ICONS_DIR, 'icon-512.png'));

  // Icono maskable: Android Adaptive Icon
  // La zona segura es el 80% central — padding 15% garantiza que el logo quede adentro
  await makeIcon(192, 0.15, path.join(ICONS_DIR, 'icon-maskable-192.png'));
  await makeIcon(512, 0.15, path.join(ICONS_DIR, 'icon-maskable-512.png'));

  // --- iOS ---
  // Apple Touch Icon (sin transparencia, iOS ignora alpha en home screen)
  await makeIcon(180, 0.18, path.join(ROOT, 'public', 'apple-touch-icon.png'));

  // --- Favicons (pestana del navegador) ---
  await makeIcon(32, 0.12, path.join(ROOT, 'public', 'favicon-32.png'));
  await makeIcon(16, 0.10, path.join(ROOT, 'public', 'favicon-16.png'));

  console.log('\nTodos los iconos generados correctamente.');
  console.log('Ejecuta "npm run build" para incluirlos en la PWA.\n');
}

run().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
