// App Router aliases `react` to a vendored canary build that exports
// <ViewTransition>. Opt into the canary type surface so `import { ViewTransition }
// from "react"` typechecks (runtime export is the named `ViewTransition`).
/// <reference types="react/canary" />
