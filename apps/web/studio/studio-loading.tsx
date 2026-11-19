export default function StudioLoading({ children, overlay = false }: { children: string; overlay?: boolean }) {
  return <div className={overlay ? "studio-loading studio-loading-overlay" : "studio-loading"} role="status">{children}</div>;
}
