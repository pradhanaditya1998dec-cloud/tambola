// scripts/generate-audio.mjs
// Uses Google Translate TTS — free, no API key, very reliable
// Run once: node scripts/generate-audio.mjs

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/audio");

const HOUSIE_CALLS = {
  1: "Number 1, Kelly's eye",
  2: "Number 2, one little duck",
  7: "Number 7, lucky seven",
  8: "Number 8, garden gate",
  11: "Number 11, legs eleven",
  22: "Number 22, two little ducks",
  88: "Number 88, two fat ladies",
  90: "Number 90, top of the shop",
};

function getText(n) {
  return HOUSIE_CALLS[n] ?? `Number ${n}`;
}

// Google Translate TTS endpoint — free, no key needed
function buildUrl(text) {
  const encoded = encodeURIComponent(text);
  return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=en-IN&client=tw-ob`;
}

function download(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        // Must spoof a browser user-agent or Google returns 403
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://translate.google.com/",
        "Accept": "audio/webm,audio/ogg,audio/mp3,audio/*;q=0.9,*/*;q=0.8",
      },
    };

    const chunks = [];

    function get(u, redirectCount = 0) {
      if (redirectCount > 5) return reject(new Error("Too many redirects"));
      https.get(u, options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }).on("error", reject);
    }

    get(url);
  });
}

// Small delay between requests so Google doesn't rate-limit us
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function generate() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Saving to: ${OUT_DIR}\n`);

  let generated = 0;
  let skipped = 0;

  for (let n = 1; n <= 90; n++) {
    const filePath = path.join(OUT_DIR, `${n}.mp3`);

    // Skip if already exists (so you can resume if interrupted)
    if (existsSync(filePath)) {
      process.stdout.write(`⏭  ${n}.mp3 already exists\n`);
      skipped++;
      continue;
    }

    const text = getText(n);
    const url = buildUrl(text);

    try {
      const buffer = await download(url);

      if (buffer.length < 500) {
        throw new Error(`File too small (${buffer.length} bytes) — likely an error response`);
      }

      await writeFile(filePath, buffer);
      process.stdout.write(`✓  ${String(n).padStart(2)} — "${text}" (${buffer.length} bytes)\n`);
      generated++;

      // 300ms pause between requests to avoid rate limiting
      await sleep(300);
    } catch (err) {
      process.stdout.write(`✗  ${n} FAILED: ${err.message}\n`);
      // Wait longer after a failure before retrying next
      await sleep(1000);
    }
  }

  console.log(`\n✅ Done! ${generated} generated, ${skipped} skipped.`);
  console.log(`Files saved to: public/audio/`);
}

generate().catch(console.error);
