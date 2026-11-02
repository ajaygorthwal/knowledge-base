---
name: developer-feature-documenter
description: "Use when asked to create developer-focused documentation for a newly implemented or changed software feature, including a concise user-action timeline, exact code changes, triggered code blocks, and brief explanations."
argument-hint: "Feature name to document"
---

# Developer Feature Documenter

Create one readable, standalone developer document for the requested feature. Save it in the workspace-root `documents/` folder.

## Procedure

1. Identify the feature from the user's request and the current conversation. Use the current chat/session context as the primary source for requirements and rationale.
2. Inspect the relevant source files and, when available, the current changes or diff. Confirm that every documented behavior and code detail is supported by the actual implementation.
3. Create the workspace-root `documents/` folder if it does not exist.
4. Name the file using this format:

   `<feature_name>_<DD>_<MM>_<YY>_<HH>_<MM>_<AM|PM>.md`

   Use a lowercase, underscore-separated feature name (for example, `todos_group`) and the current local date and time in 12-hour format (for example, `todos_group_23_10_26_08_30_AM.md`). Use the current system time; do not infer the time from the feature implementation date. If a file with that name already exists, append `_2`, `_3`, and so on before `.md` rather than overwriting it.

5. Write a concise, developer-focused document. Prefer this structure:
   - Feature title and document date
   - Short overview of the feature and files changed
   - `User Action Timeline` showing the sequence of user interactions and code execution
   - For each timeline step: user action, code location/block, and one short explanation of what the block does
   - Exact or closely accurate code snippets; use ellipses only when the omitted code is unrelated
   - Key styling or configuration changes, when relevant
   - Validation performed, including exact commands and whether they passed
   - Short limitations or follow-up work, if applicable
6. Keep the document concise and implementation-oriented. Favor this pattern:

   ~~~markdown
   ### 1. User types in the todo description

   **User action:** Types `memo`.

   **Code hit:** `SpellCheckedEditor.onInput` in [`src/App.tsx`](../src/App.tsx).

   ~~~tsx
   onInput={(event) => onChange(event.currentTarget.textContent ?? "")}
   ~~~

   **What it does:** Updates the controlled description value.
   ~~~

   Do not include long feature introductions, repeated summaries, or prose that restates the code. Link source files using paths relative to the `documents/` folder when practical. Include only short, relevant snippets and never expose secrets.
7. Be explicit about evidence and uncertainty. Do not invent implementation details, tests, requirements, or outcomes. If the current session context or available source does not establish a detail, say that it was not verified instead of guessing.
8. After creating the file, report its path and briefly summarize what it covers.

## Source and session boundaries

- Prefer the current conversation/session and the checked-out workspace; do not assume a session ID provides access to another session's history.
- If documenting a feature from another session, use only source material the user provides or makes available, such as a diff, commit, or summary.
- If the feature cannot be identified confidently, ask the user which feature to document before creating a file.
