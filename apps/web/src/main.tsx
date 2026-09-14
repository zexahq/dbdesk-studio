import { RouterProvider, createRouter } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { setupEmbeddedConnectListener } from "./lib/embedded";
import { loadRuntimeConfig, getRuntimeBasePath } from "./lib/runtime-config";

import { routeTree } from "./routeTree.gen";

function createAppRouter() {
  return createRouter({
    routeTree,
    basepath: getRuntimeBasePath(),
    defaultPreload: "intent",
    context: {},
  });
}

type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}

async function bootstrap() {
  // Load the shared third-party integration registry before creating the
  // router or rendering UI. This prevents host behavior from being scattered
  // across compile-time constants and component-specific conditionals.
  await loadRuntimeConfig();
  const router = createAppRouter();
  setupEmbeddedConnectListener();

  const rootElement = document.getElementById("app");
  if (!rootElement) throw new Error("Root element not found");

  if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>);
  }
}

void bootstrap();
