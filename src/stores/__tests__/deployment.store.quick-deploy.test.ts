import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDeploymentStore } from '../deployment.store'
import type { AppVariable } from '@/types'

/**
 * Covers ``prepareQuickDeploy`` (issue #11): the express path that fills the
 * whole wizard draft from an app tile. The interesting part is not the happy
 * path but the bail-outs — every value that cannot be defaulted has to send the
 * user back into the wizard rather than silently deploying something wrong.
 */

vi.mock('@/api/app.api', () => ({
  appApi: {
    getById: vi.fn(),
    getVariables: vi.fn(),
  },
}))

vi.mock('@/api/deployment.api', () => ({
  deploymentApi: {
    list: vi.fn(),
    create: vi.fn(),
  },
}))

const mockFetchAppVariables = vi.fn()
const mockFetchApps = vi.fn()
let mockApps: unknown[] = []
vi.mock('../app.store', () => ({
  useAppStore: () => ({
    get apps() { return mockApps },
    fetchApps: mockFetchApps,
    fetchAppVariables: mockFetchAppVariables,
  }),
}))

let mockUser: { keycloak_id?: string | null; username?: string } | null = {
  keycloak_id: 'kc-lecturer-1',
  username: 'michael.eichberg',
}
vi.mock('../auth.store', () => ({
  useAuthStore: () => ({
    get user() { return mockUser },
    userId: 'db-user-1',
  }),
}))

const variable = (over: Partial<AppVariable> = {}): AppVariable => ({
  name: 'flavor',
  type: 'string',
  default: 'm1.small',
  required: false,
  source: 'terraform',
  ...over,
})

describe('deployment.store — prepareQuickDeploy', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUser = { keycloak_id: 'kc-lecturer-1', username: 'michael.eichberg' }
    mockApps = []
    const { appApi } = await import('@/api/app.api')
    vi.mocked(appApi.getById).mockResolvedValue({
      data: { versions: [{ version: 'v2.0.0' }, { version: 'v1.0.0' }] },
    } as any)
    mockFetchAppVariables.mockResolvedValue([variable()])
  })

  it('fills the draft with one team holding the current user', async () => {
    const store = useDeploymentStore()
    const outcome = await store.prepareQuickDeploy('app-1', 'Jupyter-Notebook')

    expect(outcome).toEqual({ ready: true })
    expect(store.draft.appId).toBe('app-1')
    expect(store.draft.studentIds).toEqual(['kc-lecturer-1'])
    expect(store.draft.groupMode).toBe('one')
    expect(store.draft.groupCount).toBe(1)
    expect(store.draft.assignments).toEqual({ 0: ['kc-lecturer-1'] })
    expect(store.draft.name).toContain('Jupyter-Notebook')
  })

  it('loads the app list so the summary can name the app', async () => {
    const store = useDeploymentStore()
    await store.prepareQuickDeploy('app-1', 'App')

    // The summary resolves the app out of ``appStore.apps``; coming from a
    // tile that list is empty and would render "App nicht gefunden".
    expect(mockFetchApps).toHaveBeenCalled()
  })

  it('skips the app list reload when it is already populated', async () => {
    mockApps = [{ appId: 'app-1', name: 'App' }]

    const store = useDeploymentStore()
    await store.prepareQuickDeploy('app-1', 'App')

    expect(mockFetchApps).not.toHaveBeenCalled()
  })

  it('caches the member so the summary can show a name instead of a UUID', async () => {
    const store = useDeploymentStore()
    await store.prepareQuickDeploy('app-1', 'App')

    expect(store.studentCache.get('kc-lecturer-1')).toMatchObject({
      username: 'michael.eichberg',
    })
  })

  it('takes the first version from the detail endpoint when none is given', async () => {
    const store = useDeploymentStore()
    await store.prepareQuickDeploy('app-1', 'Jupyter-Notebook')

    expect(store.draft.releaseTag).toBe('v2.0.0')
  })

  it('skips the detail call when the caller already knows the version', async () => {
    const { appApi } = await import('@/api/app.api')
    const store = useDeploymentStore()

    await store.prepareQuickDeploy('app-1', 'Jupyter-Notebook', 'v9.9.9')

    expect(appApi.getById).not.toHaveBeenCalled()
    expect(store.draft.releaseTag).toBe('v9.9.9')
  })

  it('seeds every default into draft.variables and leaves userInputVar empty', async () => {
    mockFetchAppVariables.mockResolvedValue([
      variable({ name: 'flavor', default: 'm1.small' }),
      variable({ name: 'count', type: 'number', default: 3 }),
    ])

    const store = useDeploymentStore()
    await store.prepareQuickDeploy('app-1', 'App')

    expect(store.draft.variables).toEqual({ flavor: 'm1.small', count: 3 })
    // Only values a user changed belong in ``userInputVar`` — a quick deploy
    // changes none, so it stays at the empty default.
    expect(store.draft.userInputVar).toEqual({})
  })

  it('nests packer values per template for multi-image apps', async () => {
    mockFetchAppVariables.mockResolvedValue([
      variable({ name: 'image', source: 'packer', template_key: 'ubuntu', default: 'jammy' }),
      variable({ name: 'image', source: 'packer', template_key: 'debian', default: 'bookworm' }),
    ])

    const store = useDeploymentStore()
    await store.prepareQuickDeploy('app-1', 'App')

    expect(store.draft.variables).toEqual({
      packer: { ubuntu: { image: 'jammy' }, debian: { image: 'bookworm' } },
    })
  })

  it('falls back to the wizard when a variable is required', async () => {
    mockFetchAppVariables.mockResolvedValue([variable({ required: true, default: null })])

    const store = useDeploymentStore()
    const outcome = await store.prepareQuickDeploy('app-1', 'App')

    expect(outcome).toEqual({ ready: false, reason: 'needsInput' })
    // App, version and name survive, so step 1 opens prefilled.
    expect(store.draft.appId).toBe('app-1')
    expect(store.draft.releaseTag).toBe('v2.0.0')
    expect(store.draft.name).toContain('App')
    // Membership must NOT be prefilled on a fallback: the config step resolves
    // its member list through a view-local cache and would show "0 selected"
    // while the draft silently held one.
    expect(store.draft.studentIds).toEqual([])
    expect(store.draft.assignments).toEqual([])
  })

  it('keeps file variables out of draft.variables instead of blocking', async () => {
    mockFetchAppVariables.mockResolvedValue([
      variable({ name: 'assignment_files', osType: 'file', varScope: 'team', default: {} }),
      variable({ name: 'flavor', default: 'm1.small' }),
    ])

    const store = useDeploymentStore()
    // Issue #11 only bails out on ``required``; files travel through
    // ``draft.fileUploads`` and a quick deploy simply uploads none.
    expect(await store.prepareQuickDeploy('app-1', 'App')).toEqual({ ready: true })
    expect(store.draft.variables).toEqual({ flavor: 'm1.small' })
  })

  it('seeds a team-scoped variable that has a real default', async () => {
    mockFetchAppVariables.mockResolvedValue([
      variable({ name: 'team_flavor_ids', varScope: 'team', default: { 'Team 1': 'm1.small' } }),
    ])

    const store = useDeploymentStore()
    expect(await store.prepareQuickDeploy('app-1', 'App')).toEqual({ ready: true })
    expect(store.draft.variables).toEqual({ team_flavor_ids: { 'Team 1': 'm1.small' } })
  })

  it('falls back when a scoped variable has an empty default', async () => {
    mockFetchAppVariables.mockResolvedValue([
      variable({ name: 'team_flavor_ids', varScope: 'team', default: {} }),
    ])

    const store = useDeploymentStore()
    // ``required`` is false here, but spreading ``{}`` across the slots leaves
    // every team without a flavor — nothing to prefill after all.
    expect(await store.prepareQuickDeploy('app-1', 'App')).toEqual({
      ready: false,
      reason: 'needsInput',
    })
  })

  it('does not fall back for a non-scoped empty list default', async () => {
    mockFetchAppVariables.mockResolvedValue([
      variable({ name: 'extra_networks', type: 'list(string)', default: [] }),
    ])

    const store = useDeploymentStore()
    // Outside a scope the default *is* the value the author chose.
    expect(await store.prepareQuickDeploy('app-1', 'App')).toEqual({ ready: true })
    expect(store.draft.variables).toEqual({ extra_networks: [] })
  })

  it('reports noVersion when the app has no release tag', async () => {
    const { appApi } = await import('@/api/app.api')
    vi.mocked(appApi.getById).mockResolvedValue({ data: { versions: [] } } as any)

    const store = useDeploymentStore()
    expect(await store.prepareQuickDeploy('app-1', 'App')).toEqual({
      ready: false,
      reason: 'noVersion',
    })
  })

  it('reports noIdentity when the session carries no Keycloak subject', async () => {
    mockUser = { keycloak_id: null }

    const store = useDeploymentStore()
    expect(await store.prepareQuickDeploy('app-1', 'App')).toEqual({
      ready: false,
      reason: 'noIdentity',
    })
    expect(mockFetchAppVariables).not.toHaveBeenCalled()
  })

  it('surfaces a failing variables call as an error and rethrows', async () => {
    mockFetchAppVariables.mockRejectedValue({
      response: { data: { detail: 'boom' } },
    })

    const store = useDeploymentStore()
    await expect(store.prepareQuickDeploy('app-1', 'App')).rejects.toBeTruthy()
    expect(store.error).toBe('boom')
    expect(store.isLoading).toBe(false)
  })
})
