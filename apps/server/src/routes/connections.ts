import { randomUUID } from 'node:crypto'
import type { Application } from 'express'
import type { ConnectionProfile } from '@common/types'
import { connectionManager } from '../connectionManager'
import { parseConnectionURI, postgresConnectionError } from '../lib/postgres/connection'
import { getProjectId } from '../project-scope'
import { loadProfiles, saveProfile } from '../storage'

/** Collection routes must be registered before the connection-ID access guard. */
export function registerConnectionURIRoute(app: Application): void {
  app.post('/api/connections/from-uri', async (req, res, next) => {
    try {
      const projectId = getProjectId(req)
      const { options, name } = parseConnectionURI(req.body?.uri)
      const profiles = await loadProfiles(projectId)
      const existing = profiles.find((profile) => {
        if (profile.type !== 'postgres') return false
        const previous = profile.options
        return previous.host === options.host && previous.port === options.port &&
          previous.database === options.database && previous.user === options.user
      })
      const now = new Date()
      const profile = {
        ...existing, id: existing?.id ?? randomUUID(), name: existing?.name ?? name,
        type: 'postgres', options, projectId,
        createdAt: existing?.createdAt ?? now, updatedAt: now, lastConnectedAt: now
      } as ConnectionProfile
      // Reusing the old pool would ignore updated passwords and SSL settings.
      if (existing) await connectionManager.closeConnection(existing.id)
      try {
        await connectionManager.createConnection(profile.id, 'postgres', options)
        await saveProfile(profile, projectId)
      } catch (error) {
        await connectionManager.closeConnection(profile.id)
        throw postgresConnectionError(error, options)
      }
      res.status(existing ? 200 : 201).json(profile)
    } catch (error) { next(error) }
  })
}
