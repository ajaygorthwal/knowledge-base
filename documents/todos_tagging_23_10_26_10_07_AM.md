# Todo Tagging

**Document date:** 23 October 2026

## Overview and goals

Todo tagging lets users create named, colored tags and assign one or more of them to todos. Tags make it easier to classify work (for example, “Important” or “Hometown”), identify tagged todos at a glance, and filter the todo tree.

## User-facing behavior

1. The toolbar has an icon button to add a todo and a neighboring tag icon to create a tag.
2. Creating a tag requires a name and lets the user choose a color. Tag names are trimmed, and duplicate names are rejected without regard to letter case. Saved tags can be edited or deleted from the tag dialog. Deleting a tag asks for confirmation and removes its assignments from todos.
3. The add and edit todo dialogs list existing tags as checkboxes. A todo can have multiple tags, and its selections are saved with the todo.
4. Assigned tags appear as colored chips inline beside the todo title.
5. A tag bar below search shows **All tags** and the saved tags. It stays sticky with the search controls and scrolls horizontally when its contents exceed the available width.
6. Selecting a tag filters the tree to matching todos and their ancestor path. A matching todo includes its entire descendant subtree. Matching branches are expanded while a tag filter is active. Select **All tags**, or click the selected tag again, to clear the filter.
7. Expanded todo groups have 8px of bottom padding after their last sub-todo.

## Implementation and persistence

The feature is implemented in [`../src/App.tsx`](../src/App.tsx) and styled in [`../src/App.css`](../src/App.css).

- A `TodoTag` contains an ID, display text, and six-digit hex color. Todos store tag IDs in the optional `tagIds` array, preserving compatibility with existing todos.
- Tag definitions are stored in `localStorage` under `knowledge-base-todo-tags`; todo records continue to use `knowledge-base-todos`.
- Tag text color is chosen from the tag background luminance to maintain contrast.
- Saved tag definitions can be edited without changing their IDs, so existing todo assignments remain intact. Deleting a tag also removes its ID from assigned todos and clears that tag filter if active.
- The tag filter works on the nested todo tree: it retains ancestors for matching descendants and retains a matching node with all its descendants.
- JSON backups include the tag definitions. The upload validator accepts backups that omit `tags`, preserving compatibility with earlier backups.

### Tag data model

```ts
type Todo = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  parentId?: string | null;
  order?: number;
  tagIds?: string[];
};

type TodoTag = {
  id: string;
  text: string;
  color: string;
};
```

`tagIds` refers to IDs in the separately persisted tag list, avoiding duplicated tag text and color on every todo.

### Assigning tags when saving a todo

```ts
if (todoDialog.mode === "edit") {
  setTodos((currentTodos) =>
    currentTodos.map((todo) =>
      todo.id === todoDialog.todoId
        ? { ...todo, text, tagIds: selectedTagIds }
        : todo,
    ),
  );
} else {
  const newTodo: Todo = {
    id: makeId(),
    text,
    completed: false,
    createdAt: new Date().toISOString(),
    parentId: todoDialog.parentId,
    tagIds: selectedTagIds,
  };
  setTodos((currentTodos) => {
    const siblings = currentTodos.filter(
      (todo) => (todo.parentId ?? null) === todoDialog.parentId,
    );
    const nextOrder =
      Math.max(-1, ...siblings.map((todo) => todo.order ?? -1)) + 1;
    return [...currentTodos, { ...newTodo, order: nextOrder }];
  });
}
```

The same selected tag IDs are stored whether a todo is created or edited.

### Filtering the nested tree

```ts
function filterTreeByTag(nodes: TodoNode[]): TodoNode[] {
  if (!selectedTagFilterId) return nodes;

  return nodes.flatMap((node) => {
    const matchesTag = node.tagIds?.includes(selectedTagFilterId) ?? false;
    if (matchesTag) return [node];

    const children = filterTreeByTag(node.children);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}
```

Returning a match unchanged preserves all descendants; recursively retaining only ancestors with matching descendants preserves the path from the root. Tag filtering also disables collapsed state for the displayed tree so matching descendants remain visible.

### Styling

The tag filter bar uses `position: sticky` and `overflow-x: auto` with non-wrapping tag buttons. The tag chips beside todo names use inline-flex layout. The nested todo tree uses a vertical branch guide with a horizontal connector on each child row, making parent-child relationships visible. The vertical guide ends at the final row rather than continuing into the 8px bottom spacing. At narrow widths, the deepest indentation keeps a small gutter for the connector.

```css
.todo-children-inner {
  min-height: 0;
  overflow: hidden;
  margin-left: 28px;
  padding: 0 0 8px 8px;
  background-image: linear-gradient(#829b8a, #829b8a);
  background-position: left top;
  background-repeat: no-repeat;
  background-size: 2px calc(100% - 8px);
}

.todo-children-inner > .todo-node > .todo-row::before {
  position: absolute;
  top: 50%;
  left: -10px;
  width: 10px;
  border-top: 1px solid #829b8a;
  content: "";
}

.todo-children-inner > .todo-node > .todo-row {
  padding-left: 8px;
}
```

## Edge cases and accessibility

- Blank tag names are blocked by form validation; duplicate tag names are rejected case-insensitively.
- Stored tags are validated as objects with string IDs and names and a six-digit hex color. Todo tag IDs are validated as strings.
- Todo tag selection uses labeled checkboxes; filter buttons expose their selected state with `aria-pressed` and have accessible names.
- The filter bar supports horizontal scrolling rather than wrapping tags onto multiple lines.
- Older todos without `tagIds` remain valid and display without tags.

## Validation

- `npm run lint` completed without lint errors. Oxlint reported one warning in `src/App.tsx` for a synchronous state update inside the local-storage persistence effect.
- `npm run build` passed (`tsc -b` and Vite production build).
- Browser checks covered creating a tag and tagged todo, selecting the tag while editing, persistence after reload, filtering and clearing filters, horizontal overflow, and the full ancestor/descendant branch for a match while a tree had been collapsed.

## Limitations

- Tags are stored per browser/device in `localStorage`; they are not synchronized between devices unless moved through a JSON backup.
