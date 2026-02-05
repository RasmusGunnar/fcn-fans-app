#!/usr/bin/env node

/**
 * Fix PNG assets for Android AAPT2 compatibility
 * Re-encodes PNG files using sharp with optimal settings
 *
 * Usage: node scripts/fix-png.js <path-to-png>
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function fixPng(filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Error: File not found: ${filePath}`);
      process.exit(1);
    }

    // Get absolute path
    const absPath = path.resolve(filePath);

    // Get original file size
    const originalStats = fs.statSync(absPath);
    const originalSize = originalStats.size;

    console.log(`📝 Processing: ${absPath}`);
    console.log(`   Original size: ${(originalSize / 1024).toFixed(2)} KB`);

    // Read and re-encode PNG with optimal settings for Android
    const buffer = await sharp(absPath)
      .png({
        force: true,
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: false,
      })
      .toBuffer();

    // Write back to original file
    fs.writeFileSync(absPath, buffer);

    // Get new file size
    const newStats = fs.statSync(absPath);
    const newSize = newStats.size;

    console.log(`   New size: ${(newSize / 1024).toFixed(2)} KB`);
    console.log(`✅ Fixed PNG: ${absPath}\n`);
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    process.exit(1);
  }
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('❌ Usage: node scripts/fix-png.js <path-to-png>');
  process.exit(1);
}

fixPng(args[0]);
