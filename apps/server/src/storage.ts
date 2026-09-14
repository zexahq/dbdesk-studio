import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { env } from '@dbdesk-studio/env/server'
import type { ConnectionProfile } from '@common/types'

const STORAGE_FILENAME = 'connections.json'
const DEFAULT_STORAGE_DIR = join(homedir(), '.config', 'dbdesk-studio')

type StoredConnectionProfile = Omit<
  ConnectionProfile,
  'createdAt' | 'updatedAt' | 'lastConnectedAt'
> & {
  createdAt: string
  updatedAt: string
  lastConnectedAt?: string
}

const getStoragePath = (): string => {
  const storageDir = env.STORAGE_PATH || DEFAULT_STORAGE_DIR
  return join(storageDir, STORAGE_FILENAME)
}

const serializeProfile = (profile: ConnectionProfile): StoredConnectionProfile => ({
  ...profile,
  createdAt: profile.createdAt.toISOString(),
  updatedAt: profile.updatedAt.toISOString(),
  lastConnectedAt: profile.lastConnectedAt?.toISOString()
})

const deserializeProfile = (stored: StoredConnectionProfile): ConnectionProfile =>
  ({
    ...stored,
    createdAt: new Date(stored.createdAt),
    updatedAt: new Date(stored.updatedAt),
    lastConnectedAt: stored.lastConnectedAt ? new Date(stored.lastConnectedAt) : undefined
  }) as ConnectionProfile

const readProfilesFromDisk = async (): Promise<StoredConnectionProfile[]> => {
  const filePath = getStoragePath()

  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as StoredConnectionProfile[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }
}

const writeProfilesToDisk = async (profiles: StoredConnectionProfile[]): Promise<void> => {
  const filePath = getStoragePath()
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(profiles, null, 2), 'utf8')
}

export const loadProfiles = async (projectId?: string): Promise<ConnectionProfile[]> => {
  const storedProfiles = await readProfilesFromDisk()
  return storedProfiles
    .map(deserializeProfile)
    .filter((profile) => !projectId || profile.projectId === projectId)
}

export const getProfile = async (profileId: string, projectId?: string): Promise<ConnectionProfile | undefined> => {
  const profiles = await loadProfiles(projectId)
  const profile = profiles.find((profile) => profile.id === profileId)

  if (!profile) {
    return undefined
  }
  return profile
}

export const saveProfile = async (profile: ConnectionProfile, projectId?: string): Promise<void> => {
  const storedProfiles = await readProfilesFromDisk()
  const scopedProfile = projectId ? { ...profile, projectId } : profile
  const index = storedProfiles.findIndex((item) => item.id === scopedProfile.id && (!projectId || item.projectId === projectId))

  const serializedProfile = serializeProfile(scopedProfile)

  if (index >= 0) {
    storedProfiles[index] = serializedProfile
  } else {
    storedProfiles.push(serializedProfile)
  }

  await writeProfilesToDisk(storedProfiles)
}

export const deleteProfile = async (profileId: string, projectId?: string): Promise<void> => {
  const storedProfiles = await readProfilesFromDisk()
  const filteredProfiles = storedProfiles.filter((profile) =>
    profile.id !== profileId || (projectId !== undefined && profile.projectId !== projectId)
  )

  await writeProfilesToDisk(filteredProfiles)
}
