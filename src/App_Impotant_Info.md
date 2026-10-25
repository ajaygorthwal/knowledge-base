## Question: now tell me how to use this skill file for a feauter, like what prompt and what input i need to provide

---

In VS Code Copilot Chat, start a prompt with the skill’s slash command:

```text
/developer-feature-documenter
```

For a feature you just implemented **in the current chat/session**, you can usually provide just the feature name:

```text
/developer-feature-documenter Document the todos grouping feature.
Use the current chat and the implementation in the workspace as your source.
```

The skill will inspect relevant files and create a document in `documents/` with a name like `todos_group_23_10_26_08_30_AM.md`.

For a feature from an **earlier session**, provide more context. A session ID by itself does not give the skill access to that session’s history. For example:

```text
/developer-feature-documenter Document the todos grouping feature.

Feature name: todos group
Behavior: Users can group todos by category and expand or collapse each group.
Relevant files: src/App.tsx, src/App.css
Source of context: Here is the feature summary or diff: [paste it here]
Validation: npm run lint passed; npm run build passed.
```

Useful inputs are the feature name, a short description of its behavior, and—if the feature isn’t in the current chat—the relevant summary, diff, or commit and any validation results. The skill instructions are in `SKILL.md`.

---
