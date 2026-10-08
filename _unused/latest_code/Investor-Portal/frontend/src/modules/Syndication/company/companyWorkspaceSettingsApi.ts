import { portalAuthHeaders } from "../../../common/auth/portalAuthHeaders"
import { getApiV1Base } from "../../../common/utils/apiBaseUrl"
import {
  materializeImageFileForUpload as materializeImageFileForUploadShared,
} from "../../../common/utils/materializeImageFileForUpload"

export type WorkspaceTabKey = "settings" | "email" | "contact" | "offerings"

function authHeaders(): Record<string, string> {
  return portalAuthHeaders() as Record<string, string>
}

export async function fetchWorkspaceTabSettings(
  companyId: string,
  tabKey: WorkspaceTabKey,
): Promise<{ ok: boolean; payload: Record<string, unknown> }> {
  const base = getApiV1Base()
  if (!base) return { ok: false, payload: {} }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/workspace-settings/${tabKey}`,
      { headers: authHeaders(), credentials: "include" },
    )
    const data = (await res.json().catch(() => ({}))) as {
      payload?: unknown
    }
    if (!res.ok) return { ok: false, payload: {} }
    const p = data.payload
    if (p && typeof p === "object" && !Array.isArray(p)) {
      return { ok: true, payload: p as Record<string, unknown> }
    }
    return { ok: true, payload: {} }
  } catch {
    return { ok: false, payload: {} }
  }
}

export type PutWorkspaceResult =
  | { ok: true }
  | { ok: false; message: string; status: number }

export async function putWorkspaceTabSettings(
  companyId: string,
  tabKey: WorkspaceTabKey,
  payload: Record<string, unknown>,
): Promise<PutWorkspaceResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API is not configured (VITE_BASE_URL).", status: 0 }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/workspace-settings/${tabKey}`,
      {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ payload }),
      },
    )
    if (res.ok) return { ok: true }
    const status = res.status
    const data = (await res.json().catch(() => ({}))) as { message?: string }
    const fromServer =
      typeof data.message === "string" && data.message.trim()
        ? data.message.trim()
        : ""
    let msg =
      fromServer ||
      (status ? `Save failed (HTTP ${status}).` : "Save failed (unknown status).")
    if (status === 502 || status === 503 || status === 504) {
      const hint =
        "The dev server could not connect to the API. Start the backend (e.g. `npm run dev` in the `backend` folder) and ensure the port matches `BACKEND_PORT` / the Vite proxy, or set `VITE_DEV_API_PROXY` in the frontend `.env` to your API base URL. Check the terminal where Vite is running for proxy errors."
      if (import.meta.env.DEV) {
        msg = fromServer ? `${fromServer} ${hint}` : hint
      } else {
        msg = fromServer || msg
      }
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console -- dev-only save diagnostics
      console.warn("putWorkspaceTabSettings", status, msg)
    }
    return { ok: false, message: msg, status: status }
  } catch (e) {
    const message =
      e instanceof Error && e.message ? e.message : "Network error while saving."
    return { ok: false, message, status: 0 }
  }
}

export type CompanyBrandingAsset = "logo" | "background" | "logoIcon"

/** Logo, background image, and logo icon uploads (client + server). */
export const MAX_BRANDING_FILE_BYTES = 1 * 1024 * 1024

/** @see materializeImageFileForUpload in common utils — branding uses 1 MB cap. */
export async function materializeBrandingFile(file: File): Promise<File> {
  return materializeImageFileForUploadShared(file, {
    fallbackBasename: "upload",
    maxBytes: MAX_BRANDING_FILE_BYTES,
  })
}

/** @deprecated Prefer {@link materializeBrandingFile} for upload/preview. */
export function normalizeBrandingFileForPicker(file: File): File {
  const name = file.name?.trim()
    ? file.name.trim().slice(0, 180)
    : "upload.png"
  const type =
    file.type && file.type.length > 0
      ? file.type
      : "application/octet-stream"
  try {
    if (typeof File === "function") {
      return new File([file], name, { type, lastModified: file.lastModified })
    }
  } catch {
    /* continue */
  }
  return file
}

type PostBrandingOk = {
  ok: true
  url: string
  /** Set when the asset is on Cloudinary; `null` when stored under `/uploads/...`. */
  publicId: string | null
}
type PostBrandingErr = { ok: false; message: string }

/** Upload an image; response `url` is a full `https` URL (Cloudinary) or root-relative `/uploads/...` when the API is not using Cloudinary. */
export async function postCompanySettingsBranding(
  companyId: string,
  assetType: CompanyBrandingAsset,
  file: File,
): Promise<PostBrandingOk | PostBrandingErr> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API is not configured (VITE_BASE_URL)." }
  }
  if (!file || (typeof file.size === "number" && file.size <= 0)) {
    return { ok: false, message: "Choose a non-empty image file." }
  }
  if (typeof file.size === "number" && file.size > MAX_BRANDING_FILE_BYTES) {
    return { ok: false, message: "File too large (max 1 MB)." }
  }
  let toSend: File
  try {
    toSend = await materializeBrandingFile(file)
  } catch (e) {
    const message =
      e instanceof Error && e.message ? e.message : "Could not read the selected file."
    return { ok: false, message }
  }
  const form = new FormData()
  form.append("file", toSend, toSend.name)
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/settings/branding/${assetType}`,
      {
        method: "POST",
        headers: { ...authHeaders() },
        body: form,
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      url?: string
      publicId?: string | null
      message?: string
    }
    if (!res.ok) {
      const status = res.status
      const fromServer =
        typeof data.message === "string" && data.message.trim()
          ? data.message.trim()
          : ""
      let msg =
        fromServer ||
        (status ? `Upload failed (HTTP ${status}).` : "Upload failed (unknown status).")
      if (status === 502 || status === 503 || status === 504) {
        const hint =
          "The dev server could not connect to the API. Start the backend (e.g. `npm run dev` in the `backend` folder) and ensure the port matches `BACKEND_PORT` / the Vite proxy, or set `VITE_DEV_API_PROXY` in the frontend `.env` to your API base URL. Check the terminal where Vite is running for proxy errors."
        if (import.meta.env.DEV) {
          msg = fromServer ? `${fromServer} ${hint}` : hint
        } else {
          msg = fromServer || msg
        }
      }
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console -- dev-only upload diagnostics
        console.warn("postCompanySettingsBranding", res.status, msg)
      }
      return { ok: false, message: msg }
    }
    const u = data.url
    if (typeof u === "string" && u.trim()) {
      const publicId =
        data.publicId === null
          ? null
          : typeof data.publicId === "string" && data.publicId.trim()
            ? data.publicId.trim()
            : null
      return { ok: true, url: u.trim(), publicId }
    }
    return { ok: false, message: "Server did not return an image URL." }
  } catch (e) {
    const message = e instanceof Error && e.message ? e.message : "Network error while uploading."
    return { ok: false, message }
  }
}
