# Project Guidelines

## Shared Components

- When the same UI pattern is used in multiple places, look for an existing reusable component before adding another copy.
- If no suitable component exists, extract the shared UI into `src/components/common/`.
- Give the component typed props and keep it focused on the shared behavior.
- Avoid extracting one-off code that would make the implementation harder to understand.
- Update the places that use the shared UI and run `npm run lint` and `npm run build`.
