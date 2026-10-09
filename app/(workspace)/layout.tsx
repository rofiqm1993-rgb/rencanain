import RencanainApp from "@/components/rencanain-app";

// Keep authentication, projects and the current draft mounted across workspace routes.
export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <><RencanainApp />{children}</>;
}
