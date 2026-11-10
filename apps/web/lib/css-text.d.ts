// Turbopack returns the file contents for `?text` stylesheet imports (rule in next.config.mjs).
declare module '*.css?text' {
  const content: string;
  export default content;
}
