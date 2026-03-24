import { RouterProvider, createRouter } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { setupEmbeddedConnectListener } from "./lib/embedded";

import { routeTree } from "./routeTree.gen";

// Support being served under a sub-path (e.g. /dbdesk/ in autobase console).
// The global is set in index.html and overridden by nginx sub_filter at runtime.
const basepath = (window as any).__DBDESK_BASE_PATH__ || '/';

const router = createRouter({
  routeTree,
  basepath,
  defaultPreload: "intent",
  context: {},
});

// Register the embedded-connect postMessage listener so the parent
// frame (e.g. autobase console) can auto-create a connection.
setupEmbeddedConnectListener();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>);
}
