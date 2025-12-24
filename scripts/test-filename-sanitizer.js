/*
  Standalone filename sanitizer test (no production changes).
  Run:
    node eseekBE/scripts/test-filename-sanitizer.js
*/

function sanitizeS3KeyFilename(originalFileName) {
  if (!originalFileName || typeof originalFileName !== "string") return `${Date.now()}`;

  // Try to decode once in case name is already encoded (prevents %2520 cases)
  let decodedName = originalFileName;
  try {
    decodedName = decodeURIComponent(originalFileName);
  } catch (_) {
    // ignore
  }

  const lastDotIndex = decodedName.lastIndexOf(".");
  const base = lastDotIndex > 0 ? decodedName.slice(0, lastDotIndex) : decodedName;
  const ext = lastDotIndex > 0 ? decodedName.slice(lastDotIndex) : "";

  const normalizedBase = base
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

  const safeExt = ext.replace(/[^A-Za-z0-9.]/g, "");
  const safeName = normalizedBase || "file";
  return `${safeName}${safeExt ? safeExt : ""}`;
}

function simulatePresignKey(fileName) {
  // What current code would produce (encodeURIComponent)
  const current = `${Date.now()}-${encodeURIComponent(fileName)}`;
  // What proposed sanitizer would produce
  const proposed = `${Date.now()}-${sanitizeS3KeyFilename(fileName)}`;
  return { current, proposed };
}

const samples = [
  "ES-C100 3.webp",
  "ES-C100%25203.webp",
  "ES-C100%25204.webp",
  "ES-C100%25205.webp",
  "We Carry wide range of products... (2).png",
  "My+Photo (Final).jpeg",
  "weird__name__##.svg",
  " spaced name .png",
  "already%20encoded%20spaces.jpg",
];

console.log("Testing filename sanitizer vs encodeURIComponent (no AWS calls)\n");
for (const name of samples) {
  const { current, proposed } = simulatePresignKey(name);
  console.log("Original:", name);
  console.log(" encodeURIComponent key:", current);
  console.log(" sanitizer key      :", proposed);
  console.log(" sanitized filename :", sanitizeS3KeyFilename(name));
  console.log("-");
}


