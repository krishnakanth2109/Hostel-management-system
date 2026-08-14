const TRANSFORM_MARKERS = /^(?:a|ar|b|bo|c|co|d|dpr|e|f|fl|g|h|l|o|q|r|t|u|w|x|y|z)_/i;

function isPdfPath(pathname) {
  return /\.pdf$/i.test(pathname.split("?")[0].split("#")[0]);
}

function stripLeadingTransformations(segments) {
  const next = [...segments];
  while (next.length > 1) {
    const first = next[0];
    if (/^v\d+$/i.test(first)) break;
    if (!first.includes(",") && !TRANSFORM_MARKERS.test(first)) break;
    next.shift();
  }
  return next;
}

export function optimizeCloudinaryImageUrl(value, options = {}) {
  if (value == null || value === "") return value;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return value;
  }

  if (url.hostname !== "res.cloudinary.com") return value;

  const parts = url.pathname.split("/").filter(Boolean);
  const uploadIndex = parts.findIndex((part, index) => index >= 2 && part === "upload");
  if (parts[1] !== "image" || uploadIndex === -1 || isPdfPath(url.pathname)) return value;

  const afterUpload = stripLeadingTransformations(parts.slice(uploadIndex + 1));
  if (afterUpload.length === 0) return value;

  const transform = [
    "f_auto",
    "q_auto",
    options.width ? `w_${Number(options.width)}` : null,
    options.height ? `h_${Number(options.height)}` : null,
    options.crop ? `c_${options.crop}` : null,
  ].filter(Boolean).join(",");

  url.pathname = `/${parts.slice(0, uploadIndex + 1).join("/")}/${transform}/${afterUpload.join("/")}`;
  return url.toString();
}

export function resolveOptimizedMediaUrl(src, backendUrl, options = {}) {
  if (!src) return src;
  const absoluteUrl = src.startsWith("http") ? src : `${backendUrl}${src}`;
  return optimizeCloudinaryImageUrl(absoluteUrl, options);
}
