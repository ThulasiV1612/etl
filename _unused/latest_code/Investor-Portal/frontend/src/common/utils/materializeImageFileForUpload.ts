/** Deal gallery / property images (matches backend multer limit). */
export const MAX_DEAL_IMAGE_FILE_BYTES = 20 * 1024 * 1024

const MAX_MULTIPART_IMAGE_NAME_LEN = 180

/**
 * Multipart `filename` must be safe 7-bit for Chrome/Edge+Multer in some pickers/Windows locales;
 * long or non-ASCII names (e.g. CJK) can end up with empty/garbled parts in Chromium.
 */
function toSafeMultipartFilename(fromPicker: string, fallback: string): string {
  const base = (fromPicker?.trim() || fallback).trim() || fallback
  const ascii = base
    .replace(/[\u0000-\u001F\u007F]/g, "_")
    .replace(/[^ -~]+/g, "_")
    .replace(/[<>:"/\\|?*]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\s]+|[_\s]+$/g, "")
  const trimmed = (ascii || fallback).slice(0, MAX_MULTIPART_IMAGE_NAME_LEN)
  return trimmed || fallback
}

function mimeFromImageFilename(name: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim())
  const ext = m?.[1]?.toLowerCase() ?? ""
  switch (ext) {
    case "png":
      return "image/png"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "webp":
      return "image/webp"
    case "gif":
      return "image/gif"
    case "svg":
      return "image/svg+xml"
    case "ico":
      return "image/x-icon"
    case "avif":
      return "image/avif"
    case "bmp":
      return "image/bmp"
    case "heic":
      return "image/heic"
    case "heif":
      return "image/heif"
    default:
      return null
  }
}

function defaultUploadFilename(file: File, fallbackBasename: string): string {
  const t = (file.type ?? "").toLowerCase()
  if (file.name?.trim()) {
    return toSafeMultipartFilename(file.name, `${fallbackBasename}.png`)
  }
  if (t.includes("jpeg") || t === "image/jpg") {
    return toSafeMultipartFilename("", `${fallbackBasename}.jpg`)
  }
  if (t.includes("png")) return toSafeMultipartFilename("", `${fallbackBasename}.png`)
  if (t.includes("webp")) return toSafeMultipartFilename("", `${fallbackBasename}.webp`)
  if (t.includes("svg")) return toSafeMultipartFilename("", `${fallbackBasename}.svg`)
  if (t.includes("gif")) return toSafeMultipartFilename("", `${fallbackBasename}.gif`)
  if (
    t.includes("icon") ||
    t === "image/vnd.microsoft.icon" ||
    t === "image/x-icon"
  ) {
    return toSafeMultipartFilename("", `${fallbackBasename}.ico`)
  }
  return toSafeMultipartFilename("", `${fallbackBasename}.png`)
}

function imageFileMeta(
  file: File,
  fallbackBasename: string,
): { name: string; type: string } {
  const name = defaultUploadFilename(file, fallbackBasename)
  const fromFile = file.type && file.type.length > 0 ? file.type : ""
  const type = fromFile || mimeFromImageFilename(name) || "application/octet-stream"
  return { name, type }
}

export type MaterializeImageFileOptions = {
  /** Used when the picker omits or garbles `File.name` (e.g. `property-image`). */
  fallbackBasename?: string
  maxBytes?: number
}

/** True when `File.type` is empty but extension looks like an image (common in Chrome). */
export function isLikelyImageFile(f: File): boolean {
  if (f.type && f.type.startsWith("image/")) return true
  return /\.(png|jpe?g|gif|webp|svg|ico|avif|bmp|heic|heif)$/i.test(f.name || "")
}

async function readFileBytes(file: File): Promise<ArrayBuffer> {
  const buf = await file.arrayBuffer()
  if (buf.byteLength > 0 || file.size <= 0) return buf
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result)
      else reject(new Error("Could not read the selected file."))
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read the selected file."))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Copy picker bytes into a new `File` (stable name + MIME). Chromium can upload **0 bytes**
 * when the raw picker `File` is appended after the input was reset; materializing avoids that.
 */
export async function materializeImageFileForUpload(
  file: File,
  opts?: MaterializeImageFileOptions,
): Promise<File> {
  const fallbackBasename = opts?.fallbackBasename ?? "upload"
  const maxBytes = opts?.maxBytes
  const { name, type } = imageFileMeta(file, fallbackBasename)
  const buf = await readFileBytes(file)
  if (!buf.byteLength) {
    throw new Error("The selected file is empty.")
  }
  if (maxBytes != null && buf.byteLength > maxBytes) {
    throw new Error("File too large.")
  }
  return new File([buf], name, { type, lastModified: file.lastModified })
}

/** Stable key for a picker file — used to avoid uploading the same image twice. */
export function dealImageFileKey(file: File): string {
  return `${file.name}\0${file.size}\0${file.lastModified}`
}

export async function materializeImageFilesForUpload(
  files: File[],
  opts?: MaterializeImageFileOptions,
): Promise<File[]> {
  if (files.length === 0) return []
  return Promise.all(files.map((f) => materializeImageFileForUpload(f, opts)))
}
