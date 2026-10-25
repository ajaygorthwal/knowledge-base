# Knowledge Base

A small, frontend-only todo app. Todos are stored in this browser's `localStorage`; use the header's JSON backup controls to export or restore them.

## Build and open offline

1. Run `npm install` once.
2. Run `npm run build`.
3. Open `dist/index.html` in a browser. This is a standalone HTML file with the app's JavaScript and CSS embedded, so it can run without a web server or internet connection.

Each browser and device has its own localStorage. To move or restore todos, download a backup from the app and upload that JSON file on the other browser/device.

## Development

Run `npm run dev` to start the Vite development server.
