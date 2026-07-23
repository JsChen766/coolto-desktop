# Resume template source snapshot

This directory pins the current Web renderer implementation that corresponds to
the runtime assets under:

```text
src/desktop/renderer/src/resume/template/
```

The three authorities are intentionally separate:

- `../cv-agent`: persisted `ResumeVariant.structured` semantics, layout manifest,
  profile hashes, and font binaries;
- `../cv_agent_frontend`: canonical Web DOM/CSS renderer and DOM measurement;
- this App: an independent local Pi Agent and renderer that must preserve both
  contracts.

Do not edit copied files directly. Refresh them with:

```bash
npm run sync:resume-template
```

Verify drift with:

```bash
npm run check:resume-template
```

The check compares the App manifest with both sibling repositories, validates
font checksums from the manifest, verifies every copied source against
`source-lock.json`, and fails when an upstream source changes.

Files ending in `.source` are read-only references. They are not compiled into
the App. The App renderer will use normal HTML/Vue rather than importing the
uni-app component directly, but it must preserve the same canonical DOM classes,
CSS-variable mapping, font rules, section/item/bullet IDs, and measurement
algorithm.

The persisted JSON shape is represented in `src/resume/types.ts`. New App
variants must store that snake_case `ResumeStructure` directly in
`ResumeVariant.structured`; no App-only translation format is allowed.

