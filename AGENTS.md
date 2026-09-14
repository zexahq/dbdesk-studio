# DBDesk Studio integration guidance

## Third-party embedding registry

[`config/third-party/autobase.yaml`](./config/third-party/autobase.yaml) is the centralized runtime registry for embedding DBDesk Studio
inside a third-party host. Autobase is the current consumer, but the contract
must remain provider-neutral so another host can reuse it without changing
feature code.

The browser loads the registry before rendering. The Vite build also publishes
it as `dist/autobase.yaml`, and the Docker image copies the source registry into
the deployment image. If the host serves Studio below a path such as
`/dbdesk/`, it must inject `window.__DBDESK_BASE_PATH__` in the bootstrap HTML so
the registry and API requests resolve from that prefix.

### What belongs in `config/third-party/autobase.yaml`

- optional surface exclusions under `features.excluded` (for example
  `dashboard` or `schema-visualizer`);
- UI policy such as `embedding.ui.hideSidebar` when the host supplies its own
  navigation;
- project-scoped profile isolation through `embedding.projects`; hosts can set
  `window.__DBDESK_PROJECT_ID__` before boot or send `projectId` with
  `dbdesk-connect`;
- iframe/embedded-mode policy;
- parent-origin allowlists and `postMessage` target origin;
- names of the ready, connect, connected, error, and theme events;
- parent-controlled UI visibility and theme synchronization;
- connection defaults, matching-profile reuse, and reload restoration;
- router/API prefixes and the post-connect route.

Do not add host-specific conditionals to individual components when a behavior
can be expressed through this registry. Read configuration through
`@common/config` or the runtime loader instead.

Use [`config/third-party/autobase.yaml.template`](./config/third-party/autobase.yaml.template) as the starting point
for a new host integration. The template documents the supported keys without
requiring collaborators to copy an environment-specific registry blindly.

### Host messaging contract

The parent should wait for the configured `messages.ready` event before sending
the configured `messages.connect` event. The connection payload currently has:

```ts
{
  host: string
  port?: number
  database?: string
  user?: string
  password?: string
  type?: string
  name?: string
  projectId?: string
}
```

Studio responds with the configured connected/error event and includes the
connection id on success. Message origins are checked against
`embedding.allowedOrigins`; production hosts should replace `"*"` with their
exact origin and set a matching `targetOrigin`.

### Change checklist for integration work

1. Update `config/third-party/autobase.yaml` and its comments first.
2. Update the shared `RuntimeConfig` type/parser when adding a key.
3. For optional surfaces, add a stable feature identifier and gate both the
   entry point and the rendered surface with `isFeatureEnabled`.
4. Keep host messaging inside `apps/web/src/lib/embedded.ts`.
5. Keep route/API prefix logic in `runtime-config.ts`, `main.tsx`, and
   `api/http-client.ts`.
6. Preserve standalone behavior when the registry is missing; defaults must
   allow the application to boot.
7. Document any new event or payload field for third-party collaborators.
8. Verify that `pnpm --filter web build` emits `dist/autobase.yaml`.

Avoid putting secrets in `autobase.yaml`; credentials are supplied at runtime
through the host message and should not be committed to the repository.
