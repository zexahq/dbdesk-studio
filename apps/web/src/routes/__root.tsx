import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { Toaster } from "@/components/ui/sonner";

import "@/styles/base.css";
import "@/styles/main.css";
import { MainSidebar } from "@/components/main-sidebar";

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "dbdesk-studio",
      },
      {
        name: "description",
        content: "dbdesk-studio is a web application",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <div className="flex h-screen overflow-hidden select-none">
    <MainSidebar />
    <div className="flex-1 h-full overflow-y-auto">
      <Outlet />
    </div>
    <Toaster position="top-right" />
    <TanStackRouterDevtools position="bottom-right" />
  </div>

  );
}
