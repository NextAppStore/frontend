import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ScholarStackLogo from '@/components/ScholarStackLogo.vue'

describe('ScholarStackLogo', () => {
  it('renders the S and the wordmark in theme colours', () => {
    const svg = mount(ScholarStackLogo).get('svg')

    expect(svg.attributes('viewBox')).toBe('130 27 1285 936')
    expect(svg.findAll('path')).toHaveLength(8)
    expect(svg.find('path.fill-content-primary').exists()).toBe(true)
    expect(svg.find('path.fill-primary').exists()).toBe(true)
  })

  it('shows only the S, cropped to it, as mark', () => {
    const svg = mount(ScholarStackLogo, { props: { mark: true } }).get('svg')

    expect(svg.attributes('viewBox')).toBe('462 27 630 751')
    expect(svg.findAll('path')).toHaveLength(6)
  })

  it('gives every instance on a page its own gradient id', () => {
    // Both logos in one app — ``useId`` is unique per app, like sidebar + dashboard.
    const page = mount(defineComponent({ render: () => h('div', [h(ScholarStackLogo), h(ScholarStackLogo)]) }))
    const ids = page.findAll('svg').map(svg => {
      const id = svg.get('linearGradient').attributes('id')
      expect(svg.get('g path').attributes('fill')).toBe(`url(#${id})`)
      return id
    })

    expect(ids[0]).not.toBe(ids[1])
  })
})
