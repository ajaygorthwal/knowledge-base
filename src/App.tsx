import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import "./App.css";

type Todo = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  parentId?: string | null;
  order?: number;
  tagIds?: string[];
  treeLineColor?: string;
};

type TodoTag = {
  id: string;
  text: string;
  color: string;
};

type TodoNode = Todo & { children: TodoNode[] };

type TodoDialogState =
  | { mode: "add"; parentId: string | null }
  | { mode: "edit"; todoId: string };

type DeleteConfirmationState =
  | {
      kind: "todo";
      todoText: string;
      descendantCount: number;
      todoIds: Set<string>;
    }
  | { kind: "tag"; tagId: string; tagText: string };

type BackupFile = {
  format: "knowledge-base-todos";
  version: 1;
  exportedAt: string;
  todos: Todo[];
  tags?: TodoTag[];
};

const STORAGE_KEY = "knowledge-base-todos";
const SORT_STORAGE_KEY = "knowledge-base-todo-sort";
const TAGS_STORAGE_KEY = "knowledge-base-todo-tags";
const DEFAULT_TREE_LINE_COLOR = "#7b87e8";
const PREVIOUS_DEFAULT_TREE_LINE_COLORS = new Set(["#829b8a", "#7598b2"]);

function isTodo(value: unknown): value is Todo {
  if (typeof value !== "object" || value === null) return false;

  const todo = value as Partial<Todo>;
  return (
    typeof todo.id === "string" &&
    typeof todo.text === "string" &&
    typeof todo.completed === "boolean" &&
    typeof todo.createdAt === "string" &&
    (todo.parentId === undefined ||
      todo.parentId === null ||
      typeof todo.parentId === "string") &&
    (todo.order === undefined || typeof todo.order === "number") &&
    (todo.treeLineColor === undefined ||
      (typeof todo.treeLineColor === "string" &&
        /^#[\da-f]{6}$/i.test(todo.treeLineColor))) &&
    (todo.tagIds === undefined ||
      (Array.isArray(todo.tagIds) &&
        todo.tagIds.every((tagId) => typeof tagId === "string")))
  );
}

function migrateTodoTreeLineColor(todo: Todo): Todo {
  return PREVIOUS_DEFAULT_TREE_LINE_COLORS.has(todo.treeLineColor?.toLowerCase() ?? "")
    ? { ...todo, treeLineColor: DEFAULT_TREE_LINE_COLOR }
    : todo;
}

function isTodoTag(value: unknown): value is TodoTag {
  if (typeof value !== "object" || value === null) return false;

  const tag = value as Partial<TodoTag>;
  return (
    typeof tag.id === "string" &&
    typeof tag.text === "string" &&
    typeof tag.color === "string" &&
    /^#[\da-f]{6}$/i.test(tag.color)
  );
}

function buildTodoTree(todos: Todo[]): TodoNode[] {
  const nodes = new Map<string, TodoNode>();
  for (const todo of todos) nodes.set(todo.id, { ...todo, children: [] });

  const roots: TodoNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function readTodos(): Todo[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every(isTodo)
      ? parsed.map(migrateTodoTreeLineColor)
      : [];
  } catch {
    return [];
  }
}

function readTodoTags(): TodoTag[] {
  try {
    const stored = localStorage.getItem(TAGS_STORAGE_KEY);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every(isTodoTag) ? parsed : [];
  } catch {
    return [];
  }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function getTagTextColor(color: string): string {
  const colorValue = Number.parseInt(color.slice(1), 16);
  const red = (colorValue >> 16) & 255;
  const green = (colorValue >> 8) & 255;
  const blue = colorValue & 255;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#243c50" : "#ffffff";
}

function App() {
  const [todos, setTodos] = useState<Todo[]>(readTodos);
  const [tags, setTags] = useState<TodoTag[]>(readTodoTags);
  const [todoText, setTodoText] = useState("");
  const [treeLineColor, setTreeLineColor] = useState(
    DEFAULT_TREE_LINE_COLOR,
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [todoDialog, setTodoDialog] = useState<TodoDialogState | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] =
    useState<DeleteConfirmationState | null>(null);
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [tagText, setTagText] = useState("");
  const [tagColor, setTagColor] = useState("#536bea");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [selectedTagFilterIds, setSelectedTagFilterIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showTodoActions, setShowTodoActions] = useState(true);
  const [collapsedTodoIds, setCollapsedTodoIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapseAllActive, setCollapseAllActive] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [sortOrder, setSortOrder] = useState(() => {
    try {
      return localStorage.getItem(SORT_STORAGE_KEY) || "newest";
    } catch {
      return "newest";
    }
  });
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const todoInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const deleteCancelButtonRef = useRef<HTMLButtonElement>(null);
  const deleteDialogRef = useRef<HTMLElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const previousRowPositionsRef = useRef<Map<string, DOMRect> | null>(null);

  useEffect(() => {
    let storageError = "";
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch {
      storageError = "Your browser could not save the changes.";
    }
    try {
      localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags));
    } catch {
      storageError = "Your browser could not save tags.";
    }
    if (storageError) {
      setNotice(`${storageError} Check available storage.`);
    }
  }, [todos, tags]);

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, sortOrder);
    } catch {
      // Sorting still works for this session when browser storage is unavailable.
    }
  }, [sortOrder]);

  useEffect(() => {
    if (!deleteConfirmation) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    deleteCancelButtonRef.current?.focus();

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDeleteConfirmation(null);
        return;
      }

      if (event.key !== "Tab") return;
      const focusableElements =
        deleteDialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        );
      if (!focusableElements?.length) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [deleteConfirmation]);

  useLayoutEffect(() => {
    const previousPositions = previousRowPositionsRef.current;
    if (!previousPositions) return;

    previousRowPositionsRef.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rows = document.querySelectorAll<HTMLElement>("[data-todo-id]");
    for (const row of rows) {
      const id = row.dataset.todoId;
      const previous = id ? previousPositions.get(id) : undefined;
      if (!previous) continue;

      const current = row.getBoundingClientRect();
      const offsetY = previous.top - current.top;
      if (Math.abs(offsetY) < 1) continue;

      row.animate(
        [
          { transform: `translateY(${offsetY}px)` },
          { transform: "translateY(0)" },
        ],
        {
          duration: 1000,
          easing: "cubic-bezier(0.22, 0.75, 0.25, 1)",
        },
      );
    }
  }, [todos]);

  useEffect(() => {
    if (deleteConfirmation || (!todoDialog && !isTagDialogOpen)) return;
    if (todoDialog) todoInputRef.current?.focus();
    if (isTagDialogOpen) tagInputRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isTagDialogOpen) setIsTagDialogOpen(false);
        else closeTodoDialog();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [todoDialog, isTagDialogOpen, deleteConfirmation]);

  useEffect(() => {
    if (!isSortMenuOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !sortMenuRef.current?.contains(event.target)
      ) {
        setIsSortMenuOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSortMenuOpen(false);
        sortButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isSortMenuOpen]);

  const normalizedSearch = searchText.trim().toLocaleLowerCase();
  const sortTodos = (first: Todo, second: Todo) => {
    switch (sortOrder) {
      case "oldest":
        return first.createdAt.localeCompare(second.createdAt);
      case "title-asc":
        return first.text.localeCompare(second.text, undefined, {
          sensitivity: "base",
        });
      case "title-desc":
        return second.text.localeCompare(first.text, undefined, {
          sensitivity: "base",
        });
      case "status":
        return Number(first.completed) - Number(second.completed);
      case "manual":
        return (
          (first.order ?? Number.MAX_SAFE_INTEGER) -
          (second.order ?? Number.MAX_SAFE_INTEGER)
        );
      case "newest":
      default:
        return second.createdAt.localeCompare(first.createdAt);
    }
  };
  const todoTree = buildTodoTree(todos);

  function getSortedTree(nodes: TodoNode[]): TodoNode[] {
    return nodes
      .map((node) => ({
        ...node,
        children: getSortedTree(node.children),
      }))
      .sort(sortTodos);
  }

  const sortedTree = getSortedTree(todoTree);
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));

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

  const visibleTree = filterTreeByTag(sortedTree);

  function getParentTodoIds(nodes: TodoNode[]): string[] {
    return nodes.flatMap((node) => [
      ...(node.children.length > 0 ? [node.id] : []),
      ...getParentTodoIds(node.children),
    ]);
  }
  const parentTodoIds = getParentTodoIds(sortedTree);

  function getMatchingTodoIds(nodes: TodoNode[]): string[] {
    const matchingIds: string[] = [];
    for (const node of nodes) {
      if (node.text.toLocaleLowerCase().includes(normalizedSearch)) {
        matchingIds.push(node.id);
      }
      matchingIds.push(...getMatchingTodoIds(node.children));
    }
    return matchingIds;
  }

  const matchingTodoIds = normalizedSearch
    ? getMatchingTodoIds(visibleTree)
    : [];
  const activeMatchId =
    matchingTodoIds.length > 0
      ? matchingTodoIds[searchMatchIndex % matchingTodoIds.length]
      : null;
  const searchExpandedTodoIds = new Set<string>();
  const todoById = new Map(todos.map((todo) => [todo.id, todo]));
  let matchingTodo = activeMatchId ? todoById.get(activeMatchId) : undefined;
  while (matchingTodo?.parentId) {
    searchExpandedTodoIds.add(matchingTodo.parentId);
    matchingTodo = todoById.get(matchingTodo.parentId);
  }

  function navigateSearchMatch(direction: -1 | 1) {
    if (matchingTodoIds.length === 0) return;
    setSearchMatchIndex(
      (currentIndex) =>
        (currentIndex + direction + matchingTodoIds.length) %
        matchingTodoIds.length,
    );
  }

  useEffect(() => {
    if (!activeMatchId) return;
    const matchingRow = Array.from(
      document.querySelectorAll<HTMLElement>("[data-todo-id]"),
    ).find((row) => row.dataset.todoId === activeMatchId);
    matchingRow?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
    });
  }, [
    activeMatchId,
    collapsedTodoIds,
    normalizedSearch,
    selectedTagFilterIds,
    todos,
  ]);

  function renderHighlightedText(text: string, todoId: string): ReactNode {
    if (!normalizedSearch) return text;

    const escapedSearch = normalizedSearch.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const matches = Array.from(text.matchAll(new RegExp(escapedSearch, "giu")));
    if (matches.length === 0) return text;

    const highlightedParts: ReactNode[] = [];
    let cursor = 0;
    for (const [index, match] of matches.entries()) {
      const start = match.index;
      if (start === undefined) continue;
      if (start > cursor) highlightedParts.push(text.slice(cursor, start));
      highlightedParts.push(
        <mark
          className={`search-match${todoId === activeMatchId ? " search-match-current" : ""}`}
          key={index}
        >
          {match[0]}
        </mark>,
      );
      cursor = start + match[0].length;
    }
    if (cursor < text.length) highlightedParts.push(text.slice(cursor));
    return highlightedParts;
  }

  function getSiblingTodos(parentId: string | null | undefined): Todo[] {
    return todos
      .filter((todo) => (todo.parentId ?? null) === (parentId ?? null))
      .sort(sortTodos);
  }

  function openAddDialog(parentId: string | null = null) {
    setTodoText("");
    setTreeLineColor(DEFAULT_TREE_LINE_COLOR);
    setSelectedTagIds([]);
    setTodoDialog({ mode: "add", parentId });
    window.setTimeout(() => todoInputRef.current?.focus(), 0);
  }

  function openEditDialog(todo: Todo) {
    setTodoText(todo.text);
    setTreeLineColor(todo.treeLineColor ?? DEFAULT_TREE_LINE_COLOR);
    setSelectedTagIds(todo.tagIds ?? []);
    setTodoDialog({ mode: "edit", todoId: todo.id });
    window.setTimeout(() => todoInputRef.current?.focus(), 0);
  }

  function closeTodoDialog() {
    setTodoDialog(null);
    setTodoText("");
    setTreeLineColor(DEFAULT_TREE_LINE_COLOR);
    setSelectedTagIds([]);
  }

  function saveTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = todoInputRef.current?.value.trim() ?? "";
    if (!text || !todoDialog) return;

    if (todoDialog.mode === "edit") {
      setTodos((currentTodos) =>
        currentTodos.map((todo) =>
          todo.id === todoDialog.todoId
            ? {
                ...todo,
                text,
                tagIds: selectedTagIds,
                treeLineColor: treeLineColor.toUpperCase(),
              }
            : todo,
        ),
      );
      setNotice("Todo updated.");
    } else {
      const newTodo: Todo = {
        id: makeId(),
        text,
        completed: false,
        createdAt: new Date().toISOString(),
        parentId: todoDialog.parentId,
        tagIds: selectedTagIds,
        treeLineColor: treeLineColor.toUpperCase(),
      };
      setTodos((currentTodos) => {
        const siblings = currentTodos.filter(
          (todo) => (todo.parentId ?? null) === todoDialog.parentId,
        );
        const nextOrder =
          Math.max(-1, ...siblings.map((todo) => todo.order ?? -1)) + 1;
        return [...currentTodos, { ...newTodo, order: nextOrder }];
      });
      setNotice(
        todoDialog.parentId
          ? "Sub todo added."
          : "Todo added and saved on this device.",
      );
    }

    closeTodoDialog();
  }

  function saveTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = tagInputRef.current?.value.trim() ?? "";
    if (!text) return;

    if (
      tags.some(
        (tag) =>
          tag.id !== editingTagId &&
          tag.text.toLocaleLowerCase() === text.toLocaleLowerCase(),
      )
    ) {
      setNotice("A tag with that name already exists.");
      return;
    }

    if (editingTagId) {
      setTags((currentTags) =>
        currentTags.map((tag) =>
          tag.id === editingTagId
            ? { ...tag, text, color: tagColor.toUpperCase() }
            : tag,
        ),
      );
      setNotice(`Tag "${text}" updated.`);
    } else {
      setTags((currentTags) => [
        ...currentTags,
        { id: makeId(), text, color: tagColor.toUpperCase() },
      ]);
      setNotice(`Tag "${text}" added.`);
    }
    setTagText("");
    setTagColor("#536bea");
    setEditingTagId(null);
  }

  function editTag(tag: TodoTag) {
    setEditingTagId(tag.id);
    setTagText(tag.text);
    setTagColor(tag.color);
    window.setTimeout(() => tagInputRef.current?.focus(), 0);
  }

  function requestTagDeletion(tag: TodoTag) {
    setDeleteConfirmation({ kind: "tag", tagId: tag.id, tagText: tag.text });
  }

  function toggleSelectedTag(tagId: string) {
    setSelectedTagIds((currentTagIds) =>
      currentTagIds.includes(tagId)
        ? currentTagIds.filter((currentTagId) => currentTagId !== tagId)
        : [...currentTagIds, tagId],
    );
  }

  function requestTodoDeletion(id: string) {
    const todoToDelete = todos.find((todo) => todo.id === id);
    if (!todoToDelete) return;

    const idsToDelete = new Set([id]);
    let foundDescendant = true;
    while (foundDescendant) {
      foundDescendant = false;
      for (const todo of todos) {
        if (
          todo.parentId &&
          idsToDelete.has(todo.parentId) &&
          !idsToDelete.has(todo.id)
        ) {
          idsToDelete.add(todo.id);
          foundDescendant = true;
        }
      }
    }

    setDeleteConfirmation({
      kind: "todo",
      todoText: todoToDelete.text,
      descendantCount: idsToDelete.size - 1,
      todoIds: idsToDelete,
    });
  }

  function confirmTodoDeletion() {
    if (!deleteConfirmation || deleteConfirmation.kind !== "todo") return;
    setTodos((currentTodos) =>
      currentTodos.filter((todo) => !deleteConfirmation.todoIds.has(todo.id)),
    );
    setNotice(
      deleteConfirmation.descendantCount > 0
        ? "Todo and its subtodos removed."
        : "Todo removed.",
    );
    setDeleteConfirmation(null);
  }

  function confirmTagDeletion() {
    if (!deleteConfirmation || deleteConfirmation.kind !== "tag") return;
    const { tagId, tagText: removedTagText } = deleteConfirmation;
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
    if (editingTagId === tagId) {
      setEditingTagId(null);
      setTagText("");
      setTagColor("#536bea");
    }
    setNotice(`Tag "${removedTagText}" and its todo assignments were removed.`);
    setDeleteConfirmation(null);
  }

  function moveTodo(id: string, direction: -1 | 1) {
    const current = todos.find((todo) => todo.id === id);
    if (!current) return;

    const siblings = getSiblingTodos(current.parentId);
    const currentIndex = siblings.findIndex((todo) => todo.id === id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length)
      return;

    [siblings[currentIndex], siblings[targetIndex]] = [
      siblings[targetIndex],
      siblings[currentIndex],
    ];
    const orderById = new Map(siblings.map((todo, index) => [todo.id, index]));
    previousRowPositionsRef.current = new Map(
      Array.from(document.querySelectorAll<HTMLElement>("[data-todo-id]"))
        .map((row) => {
          const rowId = row.dataset.todoId;
          return rowId ? ([rowId, row.getBoundingClientRect()] as const) : null;
        })
        .filter((entry): entry is readonly [string, DOMRect] => entry !== null),
    );
    setTodos((currentTodos) =>
      currentTodos.map((todo) =>
        orderById.has(todo.id)
          ? { ...todo, order: orderById.get(todo.id) }
          : todo,
      ),
    );
    setSortOrder("manual");
    setNotice(`Moved ${direction < 0 ? "up" : "down"}.`);
  }

  function getParentPath(parentId: string): string {
    const todoById = new Map(todos.map((todo) => [todo.id, todo]));
    const path: string[] = [];
    let current = todoById.get(parentId);
    while (current) {
      path.unshift(current.text);
      current = current.parentId ? todoById.get(current.parentId) : undefined;
    }
    return path.join(" › ");
  }

  function toggleTodoCollapsed(todoId: string) {
    setCollapsedTodoIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(todoId)) nextIds.delete(todoId);
      else nextIds.add(todoId);
      return nextIds;
    });
  }

  function renderTodoRows(nodes: TodoNode[], depth = 0): ReactNode[] {
    return nodes.map((todo) => {
      const hasChildren = todo.children.length > 0;
      const isCollapsed =
        selectedTagFilterIds.size === 0 &&
        collapsedTodoIds.has(todo.id) &&
        (collapseAllActive || !searchExpandedTodoIds.has(todo.id));

      return (
        <div className="todo-node" key={todo.id}>
          <div
            data-todo-id={todo.id}
            className={`todo-row${showTodoActions ? "" : " todo-row-actions-hidden"}${hasChildren ? " todo-row-has-children" : ""}`}
          >
            <div className="todo-text todo-title-cell">
              {hasChildren ? (
                <button
                  className="todo-expand-button"
                  type="button"
                  aria-expanded={!isCollapsed}
                  aria-controls={`todo-children-${todo.id}`}
                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} subtodos for ${todo.text}`}
                  onClick={() => toggleTodoCollapsed(todo.id)}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m7 4 6 6-6 6" />
                  </svg>
                  <span className="todo-title">
                    {renderHighlightedText(todo.text, todo.id)}
                  </span>
                </button>
              ) : (
                <span className="todo-title">
                  {renderHighlightedText(todo.text, todo.id)}
                </span>
              )}
              {todo.tagIds && todo.tagIds.length > 0 && (
                <span className="todo-tags" role="list" aria-label="Todo tags">
                  {todo.tagIds.map((tagId) => {
                    const tag = tagsById.get(tagId);
                    if (!tag) return null;

                    return (
                      <span
                        className="todo-tag"
                        key={tag.id}
                        role="listitem"
                        style={{
                          backgroundColor: tag.color,
                          color: getTagTextColor(tag.color),
                        }}
                      >
                        {tag.text}
                      </span>
                    );
                  })}
                </span>
              )}
            </div>
            <div className="row-actions-cell" hidden={!showTodoActions}>
              <div className="row-actions">
                <button
                  className="move-todo-button"
                  type="button"
                  onClick={() => moveTodo(todo.id, -1)}
                  disabled={getSiblingTodos(todo.parentId)[0]?.id === todo.id}
                  aria-label={`Move ${todo.text} up`}
                  title="Move up"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m5 12 5-5 5 5" />
                  </svg>
                </button>
                <button
                  className="move-todo-button"
                  type="button"
                  onClick={() => moveTodo(todo.id, 1)}
                  disabled={getSiblingTodos(todo.parentId).at(-1)?.id === todo.id}
                  aria-label={`Move ${todo.text} down`}
                  title="Move down"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m5 8 5 5 5-5" />
                  </svg>
                </button>
                <button
                  className="add-subtodo-button"
                  type="button"
                  onClick={() => openAddDialog(todo.id)}
                  aria-label={`Add sub todo under ${todo.text}`}
                  title="Add sub todo"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M10 4v12M4 10h12" />
                  </svg>
                </button>
                <button
                  className="edit-todo-button"
                  type="button"
                  onClick={() => openEditDialog(todo)}
                  aria-label={`Edit todo: ${todo.text}`}
                  title="Edit todo"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m12.5 4.5 3 3M4 16l3.5-.7L16 6.8 13.2 4 4.7 12.5 4 16Z" />
                  </svg>
                </button>
                <button
                  className="delete-button"
                  type="button"
                  onClick={() => requestTodoDeletion(todo.id)}
                  aria-label={`Delete todo: ${todo.text}`}
                  title="Delete todo and its subtodos"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M4.5 6h11m-9.5 0 .6 10h5.8l.6-10M8 6V4h4v2m-3 3v4m2-4v4" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          {hasChildren && (
            <div
              className="todo-children"
              id={`todo-children-${todo.id}`}
              data-collapsed={isCollapsed}
              aria-hidden={isCollapsed}
              inert={isCollapsed || undefined}
            >
              <div
                className={`todo-children-inner${depth >= 3 ? " todo-children-indent-capped" : ""}`}
                style={
                  {
                    "--todo-branch-color":
                      todo.treeLineColor ?? DEFAULT_TREE_LINE_COLOR,
                  } as CSSProperties
                }
              >
                {renderTodoRows(todo.children, depth + 1)}
              </div>
            </div>
          )}
        </div>
      );
    });
  }

  function downloadBackup() {
    const exportedAt = new Date();
    const backup: BackupFile = {
      format: "knowledge-base-todos",
      version: 1,
      exportedAt: exportedAt.toISOString(),
      todos,
      tags,
    };
    const file = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    const filenameDate = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(exportedAt);
    const filenameParts = Object.fromEntries(
      filenameDate.map(({ type, value }) => [type, value]),
    );
    link.download = `kb_${filenameParts.day}_${filenameParts.month}_${filenameParts.hour}_${filenameParts.minute}_${filenameParts.dayPeriod}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Your todo backup has been downloaded.");
  }

  async function uploadBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("format" in parsed) ||
        parsed.format !== "knowledge-base-todos" ||
        !("version" in parsed) ||
        parsed.version !== 1 ||
        !("todos" in parsed) ||
        !Array.isArray(parsed.todos) ||
        !parsed.todos.every(isTodo) ||
        ("tags" in parsed &&
          (!Array.isArray(parsed.tags) || !parsed.tags.every(isTodoTag)))
      ) {
        throw new Error("This file is not a valid Knowledge Base backup.");
      }

      setTodos(parsed.todos.map(migrateTodoTreeLineColor));
      if ("tags" in parsed && Array.isArray(parsed.tags)) setTags(parsed.tags);
      setNotice(
        `Backup restored: ${parsed.todos.length} todo${parsed.todos.length === 1 ? "" : "s"} imported.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error && error.message.startsWith("This file")
          ? error.message
          : "Could not read that file. Choose a valid Knowledge Base JSON backup.",
      );
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Knowledge Base home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M5 4.75A2.75 2.75 0 0 1 7.75 2H20v17H7.75A2.75 2.75 0 0 0 5 21.75v-17Z" />
              <path d="M5 5v16.75M9 7h7M9 11h7" />
            </svg>
          </span>
          <span>Knowledge Base</span>
        </a>

        <div className="header-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={downloadBackup}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 2.5v9m0 0 3.5-3.5M10 11.5 6.5 8M3.5 13v3.5h13V13" />
            </svg>
            <span>Download data</span>
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 13.5v-9m0 0L6.5 8M10 4.5 13.5 8M3.5 13v3.5h13V13" />
            </svg>
            <span>Upload data</span>
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            aria-label="Choose a Knowledge Base JSON backup"
            onChange={uploadBackup}
          />
        </div>
      </header>

      <main id="top" className="main-content">
        <section className="todo-card" aria-labelledby="todo-heading">
          <div className="card-heading">
            <div className="todo-tools">
              <div className="todo-create-actions">
                <button
                  className="todo-action-icon add-button"
                  type="button"
                  onClick={() => openAddDialog()}
                  aria-label="Add todo"
                  title="Add todo"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M10 4v12M4 10h12" />
                  </svg>
                </button>
                <button
                  className="todo-action-icon"
                  type="button"
                  onClick={() => {
                    setTagText("");
                    setTagColor("#536bea");
                    setEditingTagId(null);
                    setIsTagDialogOpen(true);
                  }}
                  aria-label="Add tag"
                  title="Add tag"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M3.5 4.5h7l6 6-6 6-7-7v-5Z" />
                    <circle cx="7" cy="8" r="1" />
                  </svg>
                </button>
              </div>
              <div className="todo-toolbar-actions">
                <div className="sort-menu-container" ref={sortMenuRef}>
                  <button
                    ref={sortButtonRef}
                    className="sort-menu-button"
                    type="button"
                    aria-label="Sort todos"
                    aria-haspopup="menu"
                    aria-expanded={isSortMenuOpen}
                    aria-controls="todo-sort-menu"
                    title="Sort todos"
                    onClick={() => setIsSortMenuOpen((open) => !open)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        setIsSortMenuOpen(true);
                        window.setTimeout(() => {
                          const items =
                            sortMenuRef.current?.querySelectorAll<HTMLButtonElement>(
                              '[role="menuitemradio"]',
                            );
                          items?.[
                            event.key === "ArrowDown" ? 0 : items.length - 1
                          ]?.focus();
                        }, 0);
                      }
                    }}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M4 5h12M6.5 10h7M9 15h2" />
                      <path d="m13 8 3 2-3 2" />
                    </svg>
                  </button>
                  {isSortMenuOpen && (
                    <div
                      className="sort-menu"
                      id="todo-sort-menu"
                      role="menu"
                      aria-label="Sort todos"
                      onKeyDown={(event) => {
                        if (
                          !["ArrowDown", "ArrowUp", "Home", "End"].includes(
                            event.key,
                          )
                        ) {
                          return;
                        }
                        event.preventDefault();
                        const items = Array.from(
                          event.currentTarget.querySelectorAll<HTMLButtonElement>(
                            '[role="menuitemradio"]',
                          ),
                        );
                        const currentIndex = items.indexOf(
                          document.activeElement as HTMLButtonElement,
                        );
                        const nextIndex =
                          event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? items.length - 1
                              : (currentIndex +
                                  (event.key === "ArrowDown" ? 1 : -1) +
                                  items.length) %
                                items.length;
                        items[nextIndex]?.focus();
                      }}
                    >
                      {[
                        ["newest", "Newest first"],
                        ["oldest", "Oldest first"],
                        ["title-asc", "Title A–Z"],
                        ["title-desc", "Title Z–A"],
                        ["status", "To do first"],
                        ["manual", "Manual order"],
                      ].map(([value, label]) => (
                        <button
                          className="sort-menu-item"
                          key={value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={sortOrder === value}
                          onClick={() => {
                            setSortOrder(value);
                            setIsSortMenuOpen(false);
                            sortButtonRef.current?.focus();
                          }}
                        >
                          <span>{label}</span>
                          {sortOrder === value && (
                            <svg viewBox="0 0 20 20" aria-hidden="true">
                              <path d="m4 10 4 4 8-8" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="todo-tree-button"
                  type="button"
                  aria-label="Collapse all todos"
                  title="Collapse all todos"
                  disabled={parentTodoIds.length === 0}
                  onClick={() => {
                    setCollapsedTodoIds(new Set(parentTodoIds));
                    setCollapseAllActive(true);
                  }}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m4 9 6 6 6-6M4 5l6 6 6-6" />
                  </svg>
                </button>
                <button
                  className="todo-tree-button"
                  type="button"
                  aria-label="Expand all todos"
                  title="Expand all todos"
                  disabled={parentTodoIds.length === 0}
                  onClick={() => {
                    setCollapsedTodoIds(new Set());
                    setCollapseAllActive(false);
                  }}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m4 11 6-6 6 6M4 15l6-6 6 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div className="search-sort-tools">
            <label className="search-control">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="8.75" cy="8.75" r="5.75" />
                <path d="m13 13 4 4" />
              </svg>
              <span className="visually-hidden">Search todos</span>
              <input
                type="search"
                value={searchText}
                onChange={(event) => {
                  setSearchText(event.target.value);
                  setSearchMatchIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || matchingTodoIds.length === 0) {
                    return;
                  }
                  event.preventDefault();
                  navigateSearchMatch(1);
                }}
                placeholder="Search todos"
                aria-label="Search todos"
              />
            </label>
            <button
              className="search-match-button"
              type="button"
              onClick={() => navigateSearchMatch(-1)}
              disabled={matchingTodoIds.length === 0}
              aria-label="Find previous matching todo"
              title="Find previous"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m12.5 4.5-5.5 5.5 5.5 5.5" />
              </svg>
            </button>
            <button
              className="search-match-button"
              type="button"
              onClick={() => navigateSearchMatch(1)}
              disabled={matchingTodoIds.length === 0}
              aria-label="Find next matching todo"
              title="Find next"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
              </svg>
            </button>
            <button
              className="button button-secondary toggle-actions-button sticky-actions-toggle"
              type="button"
              onClick={() => setShowTodoActions((visible) => !visible)}
              aria-pressed={!showTodoActions}
              aria-label={`${showTodoActions ? "Hide" : "Show"} todo actions`}
              title={`${showTodoActions ? "Hide" : "Show"} actions`}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                {showTodoActions ? (
                  <>
                    <path d="M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5Z" />
                    <circle cx="10" cy="10" r="2" />
                  </>
                ) : (
                  <>
                    <path d="m3 3 14 14M8.6 5.2A8.2 8.2 0 0 1 10 5c4.8 0 7.5 5 7.5 5a11 11 0 0 1-2.2 2.8M6.2 6.2C3.8 7.5 2.5 10 2.5 10s2.7 5 7.5 5c.8 0 1.6-.2 2.3-.4" />
                    <path d="M8.6 8.6a2 2 0 0 0 2.8 2.8" />
                  </>
                )}
              </svg>
              <span>{showTodoActions ? "Hide actions" : "Show actions"}</span>
            </button>
          </div>
          {tags.length > 0 && (
            <div
              className="tag-filter-bar"
              role="group"
              aria-label="Filter todos by tag"
              tabIndex={0}
            >
              <button
                className={`tag-filter-button tag-filter-all${selectedTagFilterIds.size === 0 ? " tag-filter-selected" : ""}`}
                type="button"
                aria-pressed={selectedTagFilterIds.size === 0}
                onClick={() => setSelectedTagFilterIds(new Set())}
              >
                All tags
              </button>
              {tags.map((tag) => {
                const isSelected = selectedTagFilterIds.has(tag.id);
                return (
                  <button
                    className={`tag-filter-button${isSelected ? " tag-filter-selected" : ""}`}
                    key={tag.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      setSelectedTagFilterIds((currentFilterIds) => {
                        const nextFilterIds = new Set(currentFilterIds);
                        if (nextFilterIds.has(tag.id)) {
                          nextFilterIds.delete(tag.id);
                        } else {
                          nextFilterIds.add(tag.id);
                        }
                        return nextFilterIds;
                      })
                    }
                    style={{
                      backgroundColor: tag.color,
                      color: getTagTextColor(tag.color),
                    }}
                  >
                    {isSelected && (
                      <svg
                        className="tag-filter-check"
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                      >
                        <path d="m3 8 3.2 3.2L13 4.5" />
                      </svg>
                    )}
                    {tag.text}
                  </button>
                );
              })}
            </div>
          )}
          <div className="table-wrap">
            <div className="todo-list">
              <div
                className={`todo-list-header${showTodoActions ? "" : " todo-list-header-actions-hidden"}`}
                aria-hidden="true"
              >
                <span>Todo</span>
                {showTodoActions && <span>Actions</span>}
              </div>
              {todos.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon" aria-hidden="true">
                    ✳
                  </span>
                  <strong>Your list is taking a breath.</strong>
                  <span>Add your first todo above to get started.</span>
                </div>
              ) : visibleTree.length > 0 ? (
                renderTodoRows(visibleTree)
              ) : (
                <div className="empty-state tag-filter-empty">
                  <strong>No todos have this tag.</strong>
                  <span>Select another tag or choose All tags.</span>
                </div>
              )}
            </div>
          </div>
          <p className="storage-note">
            <span className="storage-dot" aria-hidden="true" /> Saved in this
            browser on this device
          </p>
          <p className="visually-hidden" aria-live="polite">
            {notice}
          </p>
        </section>
      </main>

      {todoDialog && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeTodoDialog();
          }}
        >
          <section
            className="add-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="todo-dialog-title"
          >
            <div className="dialog-heading">
              <div>
                <p className="dialog-eyebrow">
                  {todoDialog.mode === "edit"
                    ? "EDIT TODO"
                    : todoDialog.parentId
                      ? "NESTED TODO"
                      : "NEW ITEM"}
                </p>
                <h2 id="todo-dialog-title">
                  {todoDialog.mode === "edit"
                    ? "Edit todo"
                    : todoDialog.parentId
                      ? "Add a sub todo"
                      : "Add a todo"}
                </h2>
              </div>
              <button
                className="dialog-close"
                type="button"
                onClick={closeTodoDialog}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            {todoDialog.mode === "add" && todoDialog.parentId && (
              <p className="parent-context">
                This sub todo will be added under{" "}
                <strong>{getParentPath(todoDialog.parentId)}</strong>
              </p>
            )}
            <form className="dialog-form" onSubmit={saveTodo}>
              <label htmlFor="todo-name">Todo name</label>
              <input
                ref={todoInputRef}
                id="todo-name"
                type="text"
                defaultValue={todoText}
                placeholder="What would you like to get done?"
                maxLength={240}
                required
              />
              <div className="tree-line-color-control">
                <label htmlFor="todo-tree-line-color">
                  Subtodo tree line color
                </label>
                <input
                  id="todo-tree-line-color"
                  type="color"
                  value={treeLineColor}
                  onChange={(event) => setTreeLineColor(event.target.value)}
                  aria-describedby="todo-tree-line-color-help"
                />
                <span
                  className="tree-line-color-help"
                  id="todo-tree-line-color-help"
                >
                  Used for the connector lines of this todo&apos;s subtodos.
                </span>
              </div>
              <fieldset className="todo-tag-picker">
                <legend>Tags</legend>
                {tags.length === 0 ? (
                  <p className="tag-picker-empty">
                    No tags yet. Use the tag icon above to create one.
                  </p>
                ) : (
                  <div className="tag-picker-options">
                    {tags.map((tag) => (
                      <label className="tag-picker-option" key={tag.id}>
                        <input
                          type="checkbox"
                          checked={selectedTagIds.includes(tag.id)}
                          onChange={() => toggleSelectedTag(tag.id)}
                        />
                        <span
                          className="todo-tag"
                          style={{
                            backgroundColor: tag.color,
                            color: getTagTextColor(tag.color),
                          }}
                        >
                          {tag.text}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              <div className="dialog-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={closeTodoDialog}
                >
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                >
                  {todoDialog.mode === "edit"
                    ? "Save changes"
                    : todoDialog.parentId
                      ? "Add sub todo"
                      : "Add todo"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {deleteConfirmation && (
        <div
          className="dialog-backdrop delete-confirmation-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDeleteConfirmation(null);
            }
          }}
        >
          <section
            ref={deleteDialogRef}
            className="add-dialog delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
          >
            <div className="dialog-heading">
              <div>
                <p className="dialog-eyebrow">CONFIRM DELETION</p>
                <h2 id="delete-dialog-title">
                  {deleteConfirmation.kind === "tag"
                    ? "Delete this tag?"
                    : "Delete this todo?"}
                </h2>
              </div>
              <button
                className="dialog-close"
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                aria-label="Cancel deletion"
              >
                ×
              </button>
            </div>
            <p className="delete-confirmation-copy" id="delete-dialog-description">
              {deleteConfirmation.kind === "tag" ? (
                <>
                  The tag &quot;{deleteConfirmation.tagText}&quot; will be
                  deleted and removed from all todos. This action cannot be
                  undone.
                </>
              ) : (
                <>
                  {deleteConfirmation.descendantCount > 0
                    ? `"${deleteConfirmation.todoText}" and ${deleteConfirmation.descendantCount} ${
                        deleteConfirmation.descendantCount === 1
                          ? "subtodo"
                          : "subtodos"
                      } will be permanently deleted.`
                    : `"${deleteConfirmation.todoText}" will be permanently deleted.`}{" "}
                  This action cannot be undone.
                </>
              )}
            </p>
            <div className="dialog-actions">
              <button
                ref={deleteCancelButtonRef}
                className="button button-secondary"
                type="button"
                onClick={() => setDeleteConfirmation(null)}
              >
                Cancel
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={
                  deleteConfirmation.kind === "tag"
                    ? confirmTagDeletion
                    : confirmTodoDeletion
                }
              >
                Delete {deleteConfirmation.kind}
              </button>
            </div>
          </section>
        </div>
      )}

      {isTagDialogOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsTagDialogOpen(false);
            }
          }}
        >
          <section
            className="add-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tag-dialog-title"
          >
            <div className="dialog-heading">
              <div>
                <p className="dialog-eyebrow">TODO TAGS</p>
                <h2 id="tag-dialog-title">
                  {editingTagId ? "Edit tag" : "Add a tag"}
                </h2>
              </div>
              <button
                className="dialog-close"
                type="button"
                onClick={() => setIsTagDialogOpen(false)}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            <form className="dialog-form tag-form" onSubmit={saveTag}>
              <label htmlFor="tag-name">
                {editingTagId ? "Edit tag" : "Tag name"}
              </label>
              <div className="tag-create-fields">
                <input
                  ref={tagInputRef}
                  key={editingTagId ?? "new-tag"}
                  id="tag-name"
                  type="text"
                  defaultValue={tagText}
                  placeholder={editingTagId ? "Tag name" : "e.g. Important"}
                  maxLength={36}
                  required
                />
                <label className="tag-color-control">
                  <span>Color</span>
                  <input
                    type="color"
                    value={tagColor}
                    onChange={(event) => setTagColor(event.target.value)}
                    aria-label="Tag color"
                  />
                </label>
              </div>
              <div className="dialog-actions">
                {editingTagId && (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      setEditingTagId(null);
                      setTagText("");
                      setTagColor("#536bea");
                    }}
                  >
                    Cancel edit
                  </button>
                )}
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setIsTagDialogOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                >
                  {editingTagId ? "Save changes" : "Save tag"}
                </button>
              </div>
              {tags.length > 0 && (
                <div className="existing-tags">
                  <span>Saved tags</span>
                  <ul className="saved-tag-list">
                    {tags.map((tag) => (
                      <li className="saved-tag-item" key={tag.id}>
                        <span
                          className="todo-tag"
                          style={{
                            backgroundColor: tag.color,
                            color: getTagTextColor(tag.color),
                          }}
                        >
                          {tag.text}
                        </span>
                        <div className="saved-tag-actions">
                          <button
                            className="saved-tag-action"
                            type="button"
                            onClick={() => editTag(tag)}
                            aria-label={`Edit tag ${tag.text}`}
                            title={`Edit ${tag.text}`}
                          >
                            <svg viewBox="0 0 20 20" aria-hidden="true">
                              <path d="m12.5 4.5 3 3M4 16l3.5-.7L16 6.8 13.2 4 4.7 12.5 4 16Z" />
                            </svg>
                          </button>
                          <button
                            className="saved-tag-action saved-tag-delete"
                            type="button"
                            onClick={() => requestTagDeletion(tag)}
                            aria-label={`Delete tag ${tag.text}`}
                            title={`Delete ${tag.text}`}
                          >
                            <svg viewBox="0 0 20 20" aria-hidden="true">
                              <path d="M4.5 6h11m-9.5 0 .6 10h5.8l.6-10M8 6V4h4v2m-3 3v4m2-4v4" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
