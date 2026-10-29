import { describe, it, expect, vi, afterEach } from 'vitest'
import { filenameFromContentDisposition, saveBlob } from '@/utils/download'

describe('filenameFromContentDisposition', () => {
  it('prefers the RFC 5987 form', () => {
    const header = `attachment; filename="Team A.kubeconfig"; filename*=UTF-8''Team%20%C3%84.kubeconfig`
    expect(filenameFromContentDisposition(header, 'x')).toBe('Team Ä.kubeconfig')
  })

  it('reads the plain quoted form', () => {
    expect(filenameFromContentDisposition('attachment; filename="a.kubeconfig"', 'x')).toBe('a.kubeconfig')
  })

  it('falls back when the header is missing or has no file name', () => {
    expect(filenameFromContentDisposition(undefined, 'fallback')).toBe('fallback')
    expect(filenameFromContentDisposition('attachment', 'fallback')).toBe('fallback')
  })
})

describe('saveBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clicks a temporary link and revokes the object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    saveBlob(new Blob(['x']), 'a.kubeconfig')

    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    expect(document.querySelector('a[download]')).toBeNull()
    vi.unstubAllGlobals()
  })
})
