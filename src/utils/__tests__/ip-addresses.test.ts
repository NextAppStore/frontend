import { describe, it, expect } from 'vitest'

import { splitFixedIps } from '@/utils/ip-addresses'

const V4 = '10.200.3.147'
const V6 = '2001:7c0:1b20:c913:1::134'

describe('splitFixedIps', () => {
  it.each([
    ['dual-stack', { fixed_ip: V4, fixed_ip_v6: V6 }, { v4: V4, v6: V6 }],
    ['IPv4 only', { fixed_ip: V4, fixed_ip_v6: null }, { v4: V4, v6: null }],
    // Backend fallback: no IPv4 on the network -> fixed_ip carries the v6 address.
    ['IPv6 only (backend fallback)', { fixed_ip: V6, fixed_ip_v6: V6 }, { v4: null, v6: V6 }],
    ['IPv6 only, v6 field missing', { fixed_ip: V6, fixed_ip_v6: null }, { v4: null, v6: V6 }],
    ['nothing', { fixed_ip: null, fixed_ip_v6: null }, { v4: null, v6: null }],
  ])('%s', (_name, entry, expected) => {
    expect(splitFixedIps(entry)).toEqual(expected)
  })

  it('never reports an IPv6 literal as the IPv4 address', () => {
    expect(splitFixedIps({ fixed_ip: V6, fixed_ip_v6: V6 }).v4).toBeNull()
  })
})
