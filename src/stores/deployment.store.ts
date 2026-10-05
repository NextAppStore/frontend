import { defineStore } from 'pinia'
// Fallback-Fehlertexte werden hier über die globale i18n-Instanz
// übersetzt: Ein Store ist kein Setup-Kontext, ``useI18n()`` steht also
// nicht zur Verfügung. Dasselbe Muster nutzt ``router/index.ts``.
import i18n from '@/i18n'
import { deploymentApi } from '@/api/deployment.api'
import { appApi } from '@/api/app.api'
import { useAppStore } from './app.store'
import { useAuthStore } from './auth.store'
import { runRequest } from './_request'
import { formatDate } from '@/utils/format'

import type {
  Deployment,
  DeploymentWithRelations,
  DeploymentCreate,
  DeploymentStatus,
  DeploymentDraft,
  AppVariable
} from '@/types'

/**
 * Why a quick deploy could not skip the wizard.
 *
 * - ``noIdentity`` — the session carries no Keycloak subject, so there is
 *   nobody to put in the team.
 * - ``noVersion``  — the app has no release tag yet and cannot be deployed
 *   at all, by any route.
 * - ``needsInput`` — at least one variable has no usable default (see
 *   ``prepareQuickDeploy``).
 */
export type QuickDeployBlocker = 'noIdentity' | 'noVersion' | 'needsInput'

/**
 * Result of ``prepareQuickDeploy``. ``ready`` means the draft holds everything
 * the summary step needs. Otherwise ``reason`` says what is missing, so the
 * view can explain the detour instead of dropping the user into step 1 without
 * a word.
 */
export type QuickDeployOutcome =
  | { ready: true }
  | { ready: false; reason: QuickDeployBlocker }

/** Team name for a quick deploy — one team, one member. */
const QUICK_DEPLOY_TEAM_NAME = 'Team 1'

const defaultDraft: DeploymentDraft = {
  appId: null,
  name: '',
  releaseTag: '',
  courseIds: [],
  studentIds: [],
  groupMode: 'one',
  groupCount: 1,
  assignments: [],

  // --- These must match the interface ---
  version: 'latest',
  variables: {},
  userInputVar: {},
  groupNames: [],
  variableDefinitions: [] as AppVariable[], // stores the API definitions for the variables
  // ``fileUploads`` is the wizard-side staging area for files. Each
  // ``@openstack:file:<scope>``-marked variable contributes one entry
  // here, with inner-keys driven by the scope. ``submitDraft`` ships
  // the whole map under ``DeploymentCreate.files``.
  fileUploads: {}
}

export const useDeploymentStore = defineStore('deployment', {
  state: () => ({
    deployments: [] as Deployment[],

    currentDeployment: null as DeploymentWithRelations | null,
    isLoading: false,
    error: null as string | null,

    // The wizard state (draft).
    draft: JSON.parse(JSON.stringify(defaultDraft)) as DeploymentDraft,

    // Global cache for students and courses (userId/courseId → object).
    studentCache: new Map<string, any>(),
    courseCache: new Map<string, any>(),
  }),

  getters: {
    myDeployments: (state) => {
      const authStore = useAuthStore()
      return state.deployments.filter((d) => d.userId === authStore.userId)
    },

    deploymentsByStatus: (state) => {
      return (status: DeploymentStatus) =>
        state.deployments.filter((d) => d.status === status)
    },

    draftAppDetails: (state) => {
      const appStore = useAppStore()
      if (!state.draft.appId) return null
      return appStore.apps.find(a => a.appId === state.draft.appId) || null
    }
  },
  actions: {
    async fetchDeployments(params?: { userId?: string; appId?: string; status?: DeploymentStatus }) {
      this.isLoading = true; this.error = null
      try {
        const response = await deploymentApi.list(params)
        this.deployments = response.data
      } catch (err: any) {
        this.error = err.response?.data?.detail || i18n.global.t('errors.fetchDeployments')
      } finally {
        this.isLoading = false
      }
    },

    async fetchDeploymentById(id: string) {
      this.isLoading = true; this.error = null
      try {
        const response = await deploymentApi.getById(id)
        this.currentDeployment = response.data
      } catch (err: any) {
        // 404 = deployment was soft-deleted upstream (e.g. after a successful
        // destroy). This is not a UI error state: the DetailView's stream-ended
        // watcher checks ``currentDeployment === null`` as a soft-delete signal
        // and navigates to the list with a success toast. Other status codes
        // (5xx, network timeout) keep the error path intact.
        const status = err?.response?.status
        if (status === 404) {
          this.currentDeployment = null
        } else {
          this.error = err.response?.data?.detail || i18n.global.t('errors.fetchDeployment')
        }
      } finally {
        this.isLoading = false
      }
    },

    async createDeployment(data: DeploymentCreate) {
      this.isLoading = true; this.error = null
      try {
        const response = await deploymentApi.create(data)
        this.deployments.push(response.data)
        return response.data
      } catch (err: any) {
        this.error = err.response?.data?.detail || i18n.global.t('errors.createDeployment')
        throw err
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Delete a deployment. Returns the raw HTTP response so the caller
     * can branch on status (202 = destroy task dispatched, watch the
     * SSE stream; 204 = soft-deleted immediately).
     *
     * Drops the row from the local list either way — the deployment
     * either disappears now (204) or shortly when the destroy task
     * completes and auto-soft-deletes it (202). Keeping it in the
     * sidebar list while it's running would only confuse the user;
     * the live progress lives in the detail view that issued the call.
     */
    async deleteDeployment(id: string) {
      this.isLoading = true; this.error = null
      try {
        const response = await deploymentApi.delete(id)
        this.deployments = this.deployments.filter((d: any) => d.deploymentId !== id)
        return response
      } catch (err: any) {
        this.error = err.response?.data?.detail || i18n.global.t('errors.deleteDeployment')
        throw err
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Pause a running deployment. Returns the raw HTTP response (202
     * with ``{task_id, status: "pausing"}``) so the detail view can
     * attach the SSE stream and switch into the live-progress UI.
     *
     * Unlike ``deleteDeployment``, the deployment row stays in the
     * list — pausing isn't a destruction, the user expects to find
     * it again under the new "paused" status. Status refresh comes
     * via the next list fetch or the SSE ``succeeded`` event.
     */
    async pauseDeployment(id: string) {
      this.isLoading = true; this.error = null
      try {
        return await deploymentApi.pause(id)
      } catch (err: any) {
        this.error = err.response?.data?.detail || i18n.global.t('errors.pauseDeployment')
        throw err
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Resume a paused deployment. Mirrors ``pauseDeployment`` —
     * returns the 202 ``{task_id, status: "resuming"}`` response so
     * the detail view can attach the live stream.
     */
    async resumeDeployment(id: string) {
      this.isLoading = true; this.error = null
      try {
        return await deploymentApi.resume(id)
      } catch (err: any) {
        this.error = err.response?.data?.detail || i18n.global.t('errors.resumeDeployment')
        throw err
      } finally {
        this.isLoading = false
      }
    },

    resetDraft() {
      this.draft = JSON.parse(JSON.stringify(defaultDraft))
    },

    /**
     * Express deploy — fill the entire wizard draft straight from an app tile.
     *
     * The four wizard steps exist because a course deployment needs decisions:
     * who takes part, how they are split into teams, what the variables are.
     * A lecturer who just wants the app running for themselves makes none of
     * those, so this prefills the draft the way that lecturer would: one team,
     * themselves as its only member, every variable left on the author's
     * default. The summary step stays in front of the actual deploy, so the
     * result is reviewed and still editable before anything is created.
     *
     * Membership is keyed by the Keycloak subject (``DeploymentCreate.teams[]
     * .userIds``), never by ``userId`` — see ``NewDeploymentConfigView``, which
     * collects ``keycloak_id`` as well.
     *
     * Falls back to the full wizard when a variable is ``required`` — in the
     * backend that flag is exactly ``default is None``, so it marks the one
     * case where there is nothing to prefill. Scoped and file variables go
     * through: a scoped default is written as the author left it (an empty map
     * stays empty, which is what the wizard would produce for an untouched
     * slot), and files are skipped because they travel in their own channel.
     *
     * The draft keeps app, version and name on a fallback, so step 1 opens
     * prefilled instead of empty.
     */
    async prepareQuickDeploy(
      appId: string,
      appName: string,
      version?: string,
      /**
       * Keycloak-Subjects der Teilnehmer, aus dem Schnell-Deploy-Dialog.
       * Leer oder nicht gesetzt heißt „nur ich" — dann zieht der Dozent selbst
       * ein. Ohne mindestens ein Mitglied hätte das Deployment keine VM, die
       * Mitgliedschaft ist im Datenmodell die einzige Zuweisung.
       */
      memberIds?: string[],
    ): Promise<QuickDeployOutcome> {
      const ctx = {
        setLoading: (v: boolean) => { this.isLoading = v },
        setError: (e: string | null) => { this.error = e },
      }

      return runRequest(ctx, async (): Promise<QuickDeployOutcome> => {
        const authStore = useAuthStore()
        const appStore = useAppStore()

        this.resetDraft()
        this.draft.appId = appId

        const memberId = authStore.user?.keycloak_id
        if (!memberId) return { ready: false, reason: 'noIdentity' }

        // A tile only carries what ``GET /apps/`` returns, and that response
        // has no versions — the deployable tag has to come from the detail
        // endpoint. Same pick as ``AppsDetailView``: the first entry.
        let releaseTag = version
        if (!releaseTag) {
          const { data } = await appApi.getById(appId)
          releaseTag = (data.versions ?? [])
            .map((v) => v.version || v.releaseTag || '')
            .find((v) => Boolean(v))
        }
        if (!releaseTag) return { ready: false, reason: 'noVersion' }
        this.draft.releaseTag = releaseTag

        this.draft.name = `${appName} ${formatDate(new Date())}`

        // Same dedup key as ``NewDeploymentVariableView``: a Packer variable is
        // identified by its template, a Terraform one by its bare name.
        const rawVariables = await appStore.fetchAppVariables(appId, releaseTag)
        const unique = new Map<string, AppVariable>()
        for (const v of rawVariables) {
          const key = v.source === 'packer' ? `${v.template_key ?? 'default'}.${v.name}` : v.name
          if (!unique.has(key)) unique.set(key, v)
        }
        const definitions = Array.from(unique.values())
        this.draft.variableDefinitions = definitions

        // Issue #11 draws the line at required variables, and in the backend
        // ``required`` is exactly ``default is None``.
        //
        // That flag misses one case. A ``team``/``user``-scoped variable is
        // seeded by spreading its default across the slots, so a default of
        // ``{}`` leaves every slot empty while still counting as "has a
        // default" — ``Online-IDE``'s ``team_flavor_ids`` is exactly that, and
        // a summary built from it carries no flavor for the team VM. Treat an
        // empty scoped default as input the user still owes us. A non-scoped
        // empty list stays untouched: there the default *is* the value.
        const hasNoSeedableValue = (v: AppVariable): boolean => {
          if (v.varScope !== 'team' && v.varScope !== 'user') return false
          const d = v.default
          if (Array.isArray(d)) return d.length === 0
          if (d && typeof d === 'object') return Object.keys(d).length === 0
          return d === undefined || d === null || d === ''
        }

        const needsInput = definitions.some(
          // Files are never seeded, so an empty file default is no reason to
          // send the user to the wizard.
          (v) => v.required === true || (v.osType !== 'file' && hasNoSeedableValue(v)),
        )
        if (needsInput) return { ready: false, reason: 'needsInput' }

        // The summary resolves the app name out of ``appStore.apps``. Coming
        // from a tile that list can still be empty — ``AppsView`` keeps its
        // apps in a view-local ref — and the summary's own lazy load is
        // skipped because the draft already carries the variable definitions.
        // Without this it reads "App nicht gefunden".
        if (appStore.apps.length === 0) await appStore.fetchApps()

        // Membership is set only on the direct-to-summary path. On a fallback
        // the wizard has to behave like any other run: ``NewDeploymentConfigView``
        // resolves its member list through a view-local cache, so a prefilled
        // ``studentIds`` would sit in the draft while the step shows "0
        // selected" — state the user cannot see or correct.
        // Teilnehmer aus dem Dialog, sonst der Dozent selbst. Ein leeres Array
        // wird wie „nicht gesetzt" behandelt — ohne Mitglied gäbe es keine VM.
        const members = memberIds && memberIds.length > 0 ? memberIds : [memberId]
        this.draft.studentIds = members
        // The summary renders member names out of ``studentCache`` and falls
        // back to the raw id — without this the lecturer would read their own
        // Keycloak UUID instead of their name. Für Kursteilnehmer füllt der
        // Dialog den Cache bereits beim Laden der Kursliste.
        if (!this.studentCache.has(memberId)) {
          this.studentCache.set(memberId, authStore.user)
        }
        this.draft.groupMode = 'one'
        this.draft.groupCount = 1
        this.draft.groupNames = [QUICK_DEPLOY_TEAM_NAME]
        // Als ARRAY, nicht als ``{ 0: [...] }``. Der deklarierte Typ
        // ``Record<number, string[]>`` legt ein Objekt nahe, der Code erwartet
        // zur Laufzeit aber durchgängig ein Array: ``defaultDraft`` setzt ``[]``,
        // ``submitDraft`` prüft ``Array.isArray``, und
        // ``NewDeploymentGroupsAssignmentView`` ruft ``.filter()`` / ``.forEach()``
        // darauf auf — mit einem Objekt stürzt die Ansicht beim Mounten ab.
        this.draft.assignments = [members]

        // Mirrors how ``NewDeploymentVariableView.handleNext`` writes the draft:
        // ``variables`` holds every value, and multi-image Packer apps nest
        // theirs under ``packer[<template_key>]``. ``userInputVar`` stays empty
        // on purpose — it carries only the values a user changed, and a quick
        // deploy changes none.
        const packerKeys = new Set(
          definitions.filter((v) => v.source === 'packer').map((v) => v.template_key ?? 'default'),
        )
        const isMultiImagePacker =
          packerKeys.size > 1 || (packerKeys.size === 1 && !packerKeys.has('default'))

        const values: Record<string, unknown> = {}
        const packerNested: Record<string, Record<string, unknown>> = {}
        for (const v of definitions) {
          // File variables travel through ``draft.fileUploads``, never through
          // ``draft.variables`` — same split as ``NewDeploymentVariableView``.
          // A quick deploy uploads nothing, so they are simply left out.
          if (v.osType === 'file') continue
          if (v.default === undefined || v.default === null) continue
          if (v.source === 'packer' && isMultiImagePacker) {
            const tkey = v.template_key ?? 'default'
            ;(packerNested[tkey] ??= {})[v.name] = v.default
          } else {
            values[v.name] = v.default
          }
        }
        if (Object.keys(packerNested).length > 0) values.packer = packerNested
        this.draft.variables = values

        return { ready: true }
      }, 'Failed to prepare quick deploy')
    },

    async submitDraft() {
      /**
       * Prepare and submit the current draft as a DeploymentCreate payload.
       * - Normalizes `releaseTag` which may come as string or object from UI
       * - Packs wizard selections (courses, groups, variables) into `userInputVar`
       * - Delegates creation to the API and returns the created deployment
       */
      if (!this.draft.appId || !this.draft.name) {
        throw new Error("App und Name sind Pflichtfelder")
      }

      const rawTag: any = this.draft.releaseTag
      let finalVersion = 'latest'

      if (rawTag && typeof rawTag === 'object') {
        finalVersion = rawTag.version || rawTag.name || 'latest'
      } else if (typeof rawTag === 'string' && rawTag.trim() !== '') {
        finalVersion = rawTag
      }

      // Teams: Array<{ name: string, userIds: string[] }>
      let teams: Array<{ name: string; userIds: string[] }> = []
      if (Array.isArray(this.draft.groupNames) && Array.isArray(this.draft.assignments)) {
        // assignments: Record<number, string[]>; groupNames: string[]
        teams = this.draft.groupNames.map((name: string, idx: number) => ({
          name,
          userIds: Array.isArray((this.draft.assignments as any)[idx]) ? (this.draft.assignments as any)[idx] : []
        }))
      }

      // Fallback: if no teams are defined, auto-create teams based on studentIds.
      if (teams.length === 0 && this.draft.studentIds.length > 0) {
        // Create teams based on groupCount.
        const groupCount = this.draft.groupCount
        const studentsPerGroup = Math.floor(this.draft.studentIds.length / groupCount)
        const remainder = this.draft.studentIds.length % groupCount
        
        teams = []
        let currentIndex = 0
        for (let i = 0; i < groupCount; i++) {
          const groupSize = studentsPerGroup + (i < remainder ? 1 : 0)
          const groupStudents = this.draft.studentIds.slice(currentIndex, currentIndex + groupSize)
          teams.push({
            name: this.draft.groupNames[i] || `Team-${i + 1}`,
            userIds: groupStudents
          })
          currentIndex += groupSize
        }
      }

      // Ensure all userIds are formatted as UUID strings.
      teams = teams.map(team => ({
        name: team.name,
        userIds: team.userIds.map(id => typeof id === 'string' ? id : String(id))
      }))

      // userInputVar: { packer: {...}, terraform: {...} }
      let userInputVarObj: any = { packer: {}, terraform: {} }
      if (this.draft.variables && typeof this.draft.variables === 'object') {
        // Detect multi-image Packer layout: such apps store Packer values nested
        // under ``draft.variables.packer[<template_key>][<name>]`` rather than
        // flat under ``draft.variables[<name>]``. Reading only flat would leave
        // ``val`` undefined for those variables. Same detection/resolution as in
        // ``NewDeploymentSummaryView``.
        const draftVars = this.draft.variables as Record<string, any>
        const packerContainer = draftVars.packer
        const isMultiImagePackerLayout =
          packerContainer
          && typeof packerContainer === 'object'
          && !Array.isArray(packerContainer)
          && Object.keys(packerContainer).length > 0
          && Object.keys(packerContainer).every((k) => {
            const slot = packerContainer[k]
            return slot && typeof slot === 'object' && !Array.isArray(slot)
          })

        const resolveValue = (def: AppVariable): any => {
          if (def.source === 'packer' && isMultiImagePackerLayout) {
            const tkey = def.template_key ?? 'default'
            const fromNested = packerContainer?.[tkey]?.[def.name]
            if (fromNested !== undefined) return fromNested
          }
          return draftVars[def.name]
        }

        // variableDefinitions carries whether each var is packer/terraform.
        if (Array.isArray(this.draft.variableDefinitions)) {
          for (const def of this.draft.variableDefinitions) {
            // File-typed variables travel through ``files`` instead of
            // ``userInputVar``. Skipping them here keeps the variables
            // dict free of accidental ``undefined`` entries that would
            // confuse the backend's terraform encoder.
            if (def.osType === 'file') continue
            const val = resolveValue(def)
            // Skip empty / undefined values — they would otherwise be
            // forwarded to Terraform as ``-var=name=null`` and bypass
            // the variable's HCL ``default = ...``. Critical for any
            // variable whose default is structurally non-trivial
            // (e.g. ``map(object(...))``) — the user not touching it
            // must mean "use the default", not "set to null". An
            // empty string is also treated as "no input".
            if (val === undefined || val === null) continue
            if (typeof val === 'string' && val.trim() === '') continue
            // Scoped variables (``varScope = team|user``) arrive as a
            // map. An empty map means no slot was filled — same logic
            // applies: ship nothing so the HCL default wins.
            if (
              typeof val === 'object'
              && !Array.isArray(val)
              && (def.varScope === 'team' || def.varScope === 'user')
              && Object.keys(val).length === 0
            ) {
              continue
            }
            if (def.source === 'packer') {
              // Multi-image: nest under the template key so the worker
              // finds it at ``user_vars["packer"][template_key][name]``
              // (siehe worker/app/tasks.py). Single-image/legacy stays
              // flat at ``user_vars["packer"][name]``.
              if (isMultiImagePackerLayout) {
                const tkey = def.template_key ?? 'default'
                ;(userInputVarObj.packer[tkey] ??= {})[def.name] = val
              } else {
                userInputVarObj.packer[def.name] = val
              }
            }
            else if (def.source === 'terraform') userInputVarObj.terraform[def.name] = val
          }
        } else {
          // Fallback: alles in terraform
          userInputVarObj.terraform = { ...this.draft.variables }
        }
      }

      // Drop empty file-variable entries — the wizard may have rendered
      // a slot that the user never filled (optional file with default
      // ``{}``). Sending it would still hit the backend's ``file_var_empty``
      // guard with a confusing error.
      const fileUploads: Record<string, Record<string, any>> = {}
      if (this.draft.fileUploads) {
        for (const [varName, slotMap] of Object.entries(this.draft.fileUploads)) {
          const filledSlots: Record<string, any> = {}
          for (const [slotKey, file] of Object.entries(slotMap || {})) {
            if (file && file.content_b64) {
              filledSlots[slotKey] = file
            }
          }
          if (Object.keys(filledSlots).length > 0) {
            fileUploads[varName] = filledSlots
          }
        }
      }

      const payload: any = {
        name: this.draft.name,
        appId: this.draft.appId,
        releaseTag: finalVersion,
        userInputVar: userInputVarObj,
        teams
      }
      if (Object.keys(fileUploads).length > 0) {
        payload.files = fileUploads
      }

      const response = await this.createDeployment(payload as DeploymentCreate)
      return response
    }
  }
})