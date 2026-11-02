# Todo Tagging

**Document date:** 25 October 2026

## Overview and goals

Todo tagging provides named, colored labels for organizing todos. Users can assign multiple tags to a todo, filter the nested todo tree by tag, and manage saved tag definitions from the tag dialog.

The feature is implemented in [`../src/App.tsx`](../src/App.tsx) and styled in [`../src/App.css`](../src/App.css). The application uses a lavender canvas, translucent white surfaces, slate text, and vivid blue gradient accents; user-selected tag colors remain independent.

## User-facing behavior and flow

1. Use the tag icon in the todo toolbar to open the tag dialog.
2. Enter a name and choose a color, then select **Save tag**. Names are trimmed, and duplicate names are rejected without regard to letter case.
3. Saved tags are listed below the form. Each has edit and delete controls:
   - **Edit** loads its existing name and color into the form. Saving changes updates the tag definition while preserving its ID and existing todo assignments.
   - **Delete** opens an in-app confirmation modal. Confirming removes the tag and its assignments from todos.
4. Select tags in a todo's add or edit dialog to assign them. Assigned tags appear as colored chips beside todo titles. The same dialog lets users choose a **Subtodo tree line color**; the selected color is used for the connector lines of that todo's children.
5. When tags exist, the tag bar below the search controls offers **All tags** and one filter button per tag. Each selected tag displays a checkmark. Multiple tags can be selected; matching is OR-based, so a todo matches if it has any selected tag. Matching todos retain their ancestor paths and full descendant subtrees. Select a tag again to remove it from the selection, or choose **All tags** to clear every filter.

The tag bar has 2px of top margin beyond the normal flow after the search controls. Its horizontal scrolling allows the controls to remain on one line when the tags exceed the available width.

## Implementation, design, and persistence

### Data model and storage

Each `TodoTag` has a stable ID, display text, and hex color. Todos store tag IDs in the optional `tagIds` array rather than copying tag names and colors into each todo. This keeps tag edits consistent across todos and maintains compatibility with todos that do not have tags. Todos also have an optional `treeLineColor` hex color; older todos without it use the default branch color.

- Todo data is stored in `localStorage` under `knowledge-base-todos`.
- Tag definitions are stored in `localStorage` under `knowledge-base-todo-tags`.
- Tag definitions are also included in JSON backups. The backup type makes `tags` optional to accept older backup files.
- A stored tag's color is validated as a six-digit hex value.
- A stored todo's optional `treeLineColor` is validated as a six-digit hex value and is included automatically when todo records are persisted or backed up. Legacy todos that used either previous default line color (`#829b8a` or `#7598b2`) are migrated to the current blue-violet default (`#7b87e8`) when loaded or restored.

### Creating and editing

`saveTag` reads the form input, trims the name, and checks for a case-insensitive duplicate while excluding the tag currently being edited. Editing updates the existing record, retaining the ID; creating a tag generates a new ID.

```ts
if (editingTagId) {
  setTags((currentTags) =>
    currentTags.map((tag) =>
      tag.id === editingTagId
        ? { ...tag, text, color: tagColor.toUpperCase() }
        : tag,
    ),
  );
} else {
  setTags((currentTags) => [
    ...currentTags,
    { id: makeId(), text, color: tagColor.toUpperCase() },
  ]);
}
```

Source: [`../src/App.tsx`](../src/App.tsx), `saveTag`. The stable ID preserves tag assignments when its name or color changes.

### Deleting a tag

Deletion is staged in the shared confirmation-modal state. On confirmation, the tag definition is removed, its ID is removed from todos, and any active filter or todo-dialog selection for that tag is cleared.

```ts
setTags((currentTags) => currentTags.filter((tag) => tag.id !== tagId));
setTodos((currentTodos) =>
  currentTodos.map((todo) =>
    todo.tagIds?.includes(tagId)
      ? {
          ...todo,
          tagIds: todo.tagIds.filter((currentTagId) => currentTagId !== tagId),
        }
      : todo,
  ),
);
setSelectedTagIds((currentTagIds) =>
  currentTagIds.filter((currentTagId) => currentTagId !== tagId),
);
setSelectedTagFilterIds((currentFilterIds) => {
  const nextFilterIds = new Set(currentFilterIds);
  nextFilterIds.delete(tagId);
  return nextFilterIds;
});
```

Source: [`../src/App.tsx`](../src/App.tsx), `confirmTagDeletion`. The modal explains that the tag will be removed from all todos and requires explicit confirmation.

### Filtering

The filter retains a matching node with its full subtree. A node matches when any of its tag IDs is in the selected filter set. For a nonmatching node, it recursively retains only children that match or contain a match; this preserves the path to matching descendants.

```ts
function filterTreeByTag(nodes: TodoNode[]): TodoNode[] {
  if (selectedTagFilterIds.size === 0) return nodes;

  return nodes.flatMap((node) => {
    const matchesTag =
      node.tagIds?.some((tagId) => selectedTagFilterIds.has(tagId)) ?? false;
    if (matchesTag) return [node];

    const children = filterTreeByTag(node.children);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}
```

Source: [`../src/App.tsx`](../src/App.tsx), `filterTreeByTag`.

### Tag bar spacing and appearance

The tag bar is sticky, horizontally scrollable, and spaced below the search controls. Tag chip text color is selected from the background luminance to retain contrast.

```css
.tag-filter-bar {
  position: sticky;
  z-index: 5;
  top: 0;
  margin: 2px 28px 12px auto;
  display: flex;
  gap: 7px;
  overflow-x: auto;
}
```

Source: [`../src/App.css`](../src/App.css), `.tag-filter-bar`. The mobile rule also uses `margin: 2px 0 12px`, retaining the same additional 5px of separation.

### Per-todo child branch colors

The todo editor stores the chosen hex value on the todo. Each expanded child container receives the parent's color through a CSS custom property; both its vertical guide and horizontal child connectors use that value. Consequently, a todo's children share its chosen color, while each child can define a different color for its own children.

```tsx
style={
  {
    "--todo-branch-color": todo.treeLineColor ?? DEFAULT_TREE_LINE_COLOR,
  } as CSSProperties
}
```

```css
.todo-children-inner {
  background-image: linear-gradient(
    var(--todo-branch-color, #829b8a),
    var(--todo-branch-color, #829b8a)
  );
}

.todo-children-inner > .todo-node > .todo-row::before {
  border-top: 1px solid var(--todo-branch-color, #829b8a);
}
```

Source: [`../src/App.tsx`](../src/App.tsx) and [`../src/App.css`](../src/App.css). New todos default to `#7b87e8`; editing an older todo without a saved color displays that same default.

## Edge cases and accessibility

- Blank names are prevented by required form validation. Duplicate names are rejected case-insensitively, while a tag may retain its own current name during editing.
- Deleting a tag also removes its assignments and clears its active filter, avoiding references to a missing tag.
- Todos without `tagIds` remain valid. Backup files without a `tags` field remain accepted.
- Todos without `treeLineColor` remain valid and use the default connector color.
- Filter buttons expose their state with `aria-pressed`; the filter bar is an accessible labeled group.
- Each selected tag button includes a decorative checkmark; `aria-pressed` communicates its selected state to assistive technology.
- Saved-tag edit and delete buttons have tag-specific accessible names.
- Tag deletion uses an `alertdialog` with a descriptive label and text. The confirmation flow supports Escape and backdrop dismissal, defaults focus to Cancel, traps Tab navigation, and restores focus when closed.
- The filter bar scrolls horizontally instead of wrapping, including at narrow viewport widths.

## Validation performed

- `npm.cmd run lint` passed after the tag edit/delete implementation. Oxlint reported the existing `react(set-state-in-effect)` warning in `src/App.tsx` for the local-storage persistence effect.
- `npm.cmd run build` passed after the tag edit/delete implementation and again after the subsequent tag-bar spacing changes.
- The latest tag-bar spacing change was verified with `npm.cmd run build`; no browser interaction checks for the new tag edit/delete controls were performed in that validation.
- Multi-tag selection and checkmarks were validated with `npm.cmd run lint` and `npm.cmd run build`; browser interaction was not performed.
- Per-todo branch colors were validated with `npm.cmd run lint` and `npm.cmd run build`; browser interaction was not performed.
- The lavender/blue theme update was validated with `npm.cmd run lint` and `npm.cmd run build`; visual browser review was not performed.

## Limitations and follow-up

- Tags are stored in browser `localStorage`; they are not synchronized between devices except by moving them in a JSON backup.
- The latest edit/delete behavior was validated with lint and build, but was not separately verified through browser interaction in this work.
