/**
 * Client-side parser for OpenStack `clouds.yaml`.
 *
 * Uses js-yaml for the actual YAML decoding, then extracts and normalises the
 * one cloud entry the form cares about. The result mirrors the form fields in
 * SettingsOpenStackView so the caller can fill the inputs directly.
 */

import { load as yamlLoad, YAMLException } from 'js-yaml'
// Die geworfenen Meldungen landen unverändert in der Oberfläche
// (``SettingsOpenStackView`` zeigt ``err.message`` an), müssen also übersetzt
// sein. Hier über die globale Instanz statt ``useI18n()`` — dieses Modul ist
// kein Composable und läuft außerhalb eines Setup-Kontexts. Dasselbe Muster
// nutzt bereits ``router/index.ts``.
import i18n from '@/i18n'

export type ParsedCloudsYaml = {
  cloud_name: string
  auth_type: 'v3applicationcredential' | 'password'
  auth_url: string
  region_name: string
  interface: string
  identity_api_version: string
  identifier: string
  secret: string
  project_id: string
  project_name: string
  user_domain_name: string
  project_domain_name: string
}

type AnyMap = Record<string, unknown>

function asString(node: unknown): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  return ''
}

function asMap(node: unknown): AnyMap {
  return node && typeof node === 'object' && !Array.isArray(node) ? (node as AnyMap) : {}
}

export class CloudsYamlError extends Error {}

/**
 * Extract one cloud entry from a clouds.yaml document. If a name is given the
 * matching cloud is used; otherwise the first one wins.
 *
 * Throws `CloudsYamlError` with a user-friendly message when the document is
 * not recognisable.
 */
export function parseCloudsYaml(text: string, preferredName?: string): ParsedCloudsYaml {
  let root: unknown
  try {
    root = yamlLoad(text)
  } catch (err) {
    if (err instanceof YAMLException) {
      throw new CloudsYamlError(
        i18n.global.t('cloudsYaml.parseErrorWithReason', {
          reason: (err as YAMLException).reason,
        }),
      )
    }
    throw new CloudsYamlError(i18n.global.t('cloudsYaml.parseError'))
  }

  const rootMap = asMap(root)
  const clouds = asMap(rootMap.clouds)
  const names = Object.keys(clouds)
  if (names.length === 0) {
    throw new CloudsYamlError(i18n.global.t('cloudsYaml.noCloudsSection'))
  }

  const name = (preferredName && names.includes(preferredName) ? preferredName : names[0]) as string
  const cloud = asMap(clouds[name])
  const auth = asMap(cloud.auth)

  const declaredAuthType = asString(cloud.auth_type).toLowerCase()
  const hasAppCredFields = !!(auth.application_credential_id || auth.application_credential_secret)
  const isAppCred =
    declaredAuthType === 'v3applicationcredential' ||
    (declaredAuthType === '' && hasAppCredFields)

  const base = {
    cloud_name: name,
    auth_url: asString(auth.auth_url),
    region_name: asString(cloud.region_name),
    interface: asString(cloud.interface) || 'public',
    identity_api_version: asString(cloud.identity_api_version) || '3',
  }

  if (isAppCred) {
    return {
      ...base,
      auth_type: 'v3applicationcredential',
      identifier: asString(auth.application_credential_id),
      secret: asString(auth.application_credential_secret),
      project_id: '',
      project_name: '',
      user_domain_name: '',
      project_domain_name: '',
    }
  }

  return {
    ...base,
    auth_type: 'password',
    identifier: asString(auth.username),
    secret: asString(auth.password),
    project_id: asString(auth.project_id),
    project_name: asString(auth.project_name),
    user_domain_name: asString(auth.user_domain_name) || 'Default',
    project_domain_name: asString(auth.project_domain_name),
  }
}
