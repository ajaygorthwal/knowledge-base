# Todo Spell Check — Developer Guide

**Document date:** November 2, 2026

## Overview

Browser-independent English spelling is implemented in todo name and description fields using `nspell` with a bundled Hunspell dictionary.

Main changes:

- `nspell` and `dictionary-en` dependencies in [package.json](../package.json).
- English dictionary assets in `public/dictionaries/`.
- Shared `SpellCheckedEditor` component in [App.tsx](../src/App.tsx).
- Misspelling and suggestion-menu styles in [App.css](../src/App.css).

## User Action Timeline

### 1. Application loads the spell-check dictionary

**User action:** Opens the page and opens Add/Edit Todo.

**Code hit:** Dictionary loading effect in [App.tsx](../src/App.tsx).

```tsx
Promise.all([
  fetch(`${import.meta.env.BASE_URL}dictionaries/en.aff`).then((response) =>
    response.text(),
  ),
  fetch(`${import.meta.env.BASE_URL}dictionaries/en.dic`).then((response) =>
    response.text(),
  ),
]).then(([aff, dic]) => {
  setSpellChecker(nspell({ aff, dic }));
});
```

**What it does:** Loads the local `.aff` and `.dic` files and creates the reusable English spell checker.

### 2. User types in todo name or description

**User action:** Enters text in the content-editable field.

**Code hit:** `onInput` in `SpellCheckedEditor`.

```tsx
onInput={(event) => {
  const text = event.currentTarget.textContent ?? "";
  onChange(text);

  const selection = window.getSelection();
  const range = selection?.getRangeAt(0);
  const beforeCaret = range?.cloneRange();

  beforeCaret?.selectNodeContents(event.currentTarget);
  if (range && beforeCaret) {
    beforeCaret.setEnd(range.startContainer, range.startOffset);
    const wordMatch = text
      .slice(0, beforeCaret.toString().length)
      .match(/[A-Za-z]+(?:['’][A-Za-z]+)?$/);

    if (wordMatch) {
      const caretRect = range.getBoundingClientRect();
      onTypingWord(wordMatch[0], caretRect.left, caretRect.bottom + 4);
    }
  }
}}
```

**What it does:** Updates React state, extracts the word at the caret, and sends its position to the parent menu logic.

### 3. Current word is checked for live suggestions

**User action:** Finishes typing a word that may be misspelled.

**Code hit:** Live spelling callback passed to `SpellCheckedEditor`.

```tsx
onTypingWord={(word, x, y) => {
  if (!spellChecker || word.length < 3 || spellChecker.correct(word)) {
    setSpellingMenu(null);
  } else {
    setSpellingMenu({
      word,
      suggestions: spellChecker.suggest(word).slice(0, 6),
      field: "name",
      x,
      y,
    });
  }
}}
```

**What it does:** Hides the menu for valid or short words; otherwise opens it with up to six suggestions near the caret.

The description uses the same callback with `field: "description"`.

### 4. Misspelled words are marked with an underline

**User action:** Existing text is checked or re-rendered.

**Code hit:** `renderText()` in `SpellCheckedEditor`.

```tsx
const incorrect = word.length > 1 && !spellChecker.correct(word);

if (incorrect) {
  const span = document.createElement("span");
  span.className = "spellcheck-misspelled";
  span.dataset.word = word;
  span.textContent = word;
  fragment.append(span);
}
```

**What it does:** Recreates the editor content and wraps misspelled words in elements styled with a wavy underline.

### 5. User right-clicks an underlined word

**User action:** Opens the context menu on a misspelled word.

**Code hit:** `onContextMenu` in `SpellCheckedEditor`.

```tsx
const target = event.target instanceof HTMLElement
  ? event.target.closest<HTMLElement>(".spellcheck-misspelled")
  : null;

if (!target) return;

event.preventDefault();
onContextMenuWord(target.dataset.word ?? "", event);
```

**What it does:** Finds the underline element, prevents the native browser menu, and requests the custom suggestion menu.

### 6. User selects a suggestion

**User action:** Clicks one of the words in the suggestion menu.

**Code hit:** Suggestion replacement handler in [App.tsx](../src/App.tsx).

```tsx
const escapedWord = spellingMenu.word.replace(
  /[.*+?^${}()|[\]\\]/g,
  "\\$&",
);
const pattern = new RegExp(`\\b${escapedWord}\\b`, "i");

if (spellingMenu.field === "name") {
  setTodoText((current) =>
    pattern.test(current) ? current.replace(pattern, suggestion) : current,
  );
} else {
  setTodoDescription((current) =>
    pattern.test(current) ? current.replace(pattern, suggestion) : current,
  );
}

setSpellingMenu(null);
```

**What it does:** Replaces the word in the field that opened the menu and then closes the menu.

## Key Styling

```css
.spellcheck-misspelled {
  text-decoration: underline wavy #d24a4a;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 3px;
}

.spelling-context-menu {
  position: fixed;
  z-index: 30;
  min-width: 160px;
}
```

`.spellcheck-misspelled` draws the underline; `.spelling-context-menu` positions the suggestion menu in the viewport.

## Files Changed

| File | Change |
|---|---|
| `package.json` | Added `nspell` and `dictionary-en`. |
| `public/dictionaries/en.aff` | Hunspell affix rules. |
| `public/dictionaries/en.dic` | English word dictionary. |
| `src/App.tsx` | Added dictionary loading, editor spelling logic, live menu, underline rendering, and replacement handling. |
| `src/App.css` | Added editor, underline, and suggestion-menu styles. |
| `src/nspell.d.ts` | Added TypeScript declarations for `nspell`. |

## Validation

```sh
npm.cmd run lint
npm.cmd run build
```

- Build passed.
- Lint passed with an existing warning about a state update inside an effect.
- No automated UI interaction tests are configured in this workspace.

## Current Limitations

- English-only dictionary.
- Live menu starts at words of three characters or more.
- Markdown syntax is checked together with description text.
- Keyboard arrow navigation for the custom menu is not implemented.
