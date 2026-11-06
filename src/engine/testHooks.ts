// e2e hooks: exposed as window[name] only in the e2e build (VITE_E2E=1) AND with ?test in the URL.
// Vite removes the branch from normal builds; verify with `grep -c <name> dist/assets/*.js` = 0.

export function exposeTestHooks(name: string, hooks: Record<string, (...args: never[]) => unknown>): void {
  if (import.meta.env.VITE_E2E && new URLSearchParams(location.search).has("test")) {
    (window as unknown as Record<string, unknown>)[name] = hooks;
  }
}
