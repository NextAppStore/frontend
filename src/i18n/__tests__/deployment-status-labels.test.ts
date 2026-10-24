/**
 * The deployment list used to print the backend value verbatim, which put
 * strings like ``pause_failed`` on screen and left them English in both
 * languages. These tests pin the registry that replaced it: every status the
 * backend can send must resolve to a key, and an unknown one must not leak
 * the raw value.
 */
import { describe, it, expect } from 'vitest'

import { deploymentStatusLabelKey } from '@/i18n/deployment-status-labels'
import de from '@/i18n/locales/de'
import en from '@/i18n/locales/en'
import type { DeploymentStatus } from '@/types'

/** Every value of the ``DeploymentStatus`` union, kept in sync by hand. */
const ALL_STATUSES: DeploymentStatus[] = [
  'pending',
  'running',
  'success',
  'failed',
  'destroying',
  'destroyed',
  'cancelled',
  'pausing',
  'paused',
  'resuming',
  'pause_failed',
  'resume_failed',
]

/** Resolves a dotted key against a locale object. */
const lookup = (bundle: Record<string, unknown>, key: string): unknown =>
  key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], bundle)

describe('deploymentStatusLabelKey', () => {
  it.each(ALL_STATUSES)('maps %s to a key that exists in both locales', (status) => {
    const key = deploymentStatusLabelKey(status)

    expect(key).not.toBe('DeploymentsView.noStatus')
    expect(typeof lookup(de as Record<string, unknown>, key)).toBe('string')
    expect(typeof lookup(en as Record<string, unknown>, key)).toBe('string')
  })

  it('gives every status its own key', () => {
    const keys = ALL_STATUSES.map(deploymentStatusLabelKey)

    expect(new Set(keys).size).toBe(ALL_STATUSES.length)
  })

  it('falls back to a neutral key for a status the frontend does not know', () => {
    // A status the backend adds before the frontend learns about it must not
    // reach the page as a raw value.
    expect(deploymentStatusLabelKey('teleporting')).toBe('DeploymentsView.noStatus')
  })

  it('falls back for null and undefined', () => {
    expect(deploymentStatusLabelKey(null)).toBe('DeploymentsView.noStatus')
    expect(deploymentStatusLabelKey(undefined)).toBe('DeploymentsView.noStatus')
  })

  it('has a translation for the fallback key itself', () => {
    expect(typeof lookup(de as Record<string, unknown>, 'DeploymentsView.noStatus')).toBe('string')
    expect(typeof lookup(en as Record<string, unknown>, 'DeploymentsView.noStatus')).toBe('string')
  })
})
