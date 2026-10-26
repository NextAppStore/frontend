/**
 * The quick-deploy suggestion used to append the current date, which made two
 * deployments of the same app on one day collide and changed shape with the
 * UI language. These tests pin the replacement.
 */
import { describe, it, expect } from 'vitest'

import { slugifyAppName, suggestDeploymentName } from '@/utils/deployment-name'

describe('slugifyAppName', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyAppName('Jupyter Notebook')).toBe('jupyter-notebook')
  })

  it('folds umlauts to ASCII', () => {
    expect(slugifyAppName('Übung für Öl')).toBe('ubung-fur-ol')
  })

  it('replaces characters that do not decompose, such as ß', () => {
    // ``ß`` has no combining form, so it is treated like any other
    // non-alphanumeric and becomes a separator.
    expect(slugifyAppName('Größe')).toBe('gro-e')
  })

  it('collapses runs of separators into one hyphen', () => {
    expect(slugifyAppName('Web  LaTeX __ 2.0')).toBe('web-latex-2-0')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugifyAppName('  !Ubuntu!  ')).toBe('ubuntu')
  })

  it('yields an empty string when nothing survives', () => {
    expect(slugifyAppName('!!!')).toBe('')
  })
})

describe('suggestDeploymentName', () => {
  it('appends a short suffix to the slug', () => {
    expect(suggestDeploymentName('Ubuntu App')).toMatch(/^ubuntu-app-[a-z2-9]{4}$/)
  })

  it('carries no date', () => {
    // The whole point of the change: nothing that looks like a date.
    expect(suggestDeploymentName('Ubuntu App')).not.toMatch(/\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/)
  })

  it('falls back when the app name has no usable characters', () => {
    expect(suggestDeploymentName('???')).toMatch(/^deployment-[a-z2-9]{4}$/)
  })

  it('suggests a different name on repeated calls', () => {
    // Two quick deploys of the same app must not collide — that was the
    // failure mode of the date-based name.
    const names = new Set(Array.from({ length: 20 }, () => suggestDeploymentName('Ubuntu App')))

    expect(names.size).toBeGreaterThan(1)
  })

  it('never uses characters that are easy to misread', () => {
    const suffixes = Array.from({ length: 50 }, () =>
      suggestDeploymentName('App').split('-').pop() ?? '',
    )

    expect(suffixes.join('')).not.toMatch(/[lo01]/)
  })
})
