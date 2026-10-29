/**
 * Browser file downloads for blobs fetched through axios.
 *
 * Authenticated downloads can't be a plain ``<a href>``: the API needs the
 * Bearer token, which only axios attaches. So the file is fetched as a blob
 * and handed to the browser through a short-lived object URL, revoked right
 * after the click so the content doesn't linger in memory.
 */

/**
 * File name from a ``Content-Disposition`` header. Prefers the RFC 5987
 * ``filename*=UTF-8''…`` form, then plain ``filename="…"``, else ``fallback``.
 */
export function filenameFromContentDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1].trim())
    } catch {
      // Malformed percent-encoding — fall through to the plain form.
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)
  return plain?.[1]?.trim() || fallback
}

/** Let the browser save ``blob`` as ``filename``. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
