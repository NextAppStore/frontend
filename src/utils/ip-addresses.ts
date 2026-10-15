/**
 * Helpers for the fixed-IP pair the infrastructure endpoints return.
 *
 * ``fixed_ip`` is the first fixed IPv4 address and ``fixed_ip_v6`` the first
 * fixed IPv6 address. On a network without any IPv4 address the backend keeps
 * its legacy fallback and puts the IPv6 address into ``fixed_ip`` as well. The
 * UI labels the two slots "IPv4" and "IPv6", so it must not trust ``fixed_ip``
 * to be IPv4 — and it must never depend on the order OpenStack returned.
 */
export interface FixedIpPair {
  fixed_ip: string | null
  fixed_ip_v6: string | null
}

export interface SplitFixedIps {
  v4: string | null
  v6: string | null
}

/** IPv6 literals always contain ``:``, IPv4 literals never do. */
const isIpv6Literal = (address: string): boolean => address.includes(':')

export function splitFixedIps(entry: FixedIpPair): SplitFixedIps {
  const v6 = entry.fixed_ip_v6 || (entry.fixed_ip && isIpv6Literal(entry.fixed_ip) ? entry.fixed_ip : null)
  const v4 = entry.fixed_ip && !isIpv6Literal(entry.fixed_ip) ? entry.fixed_ip : null
  return { v4, v6 }
}
