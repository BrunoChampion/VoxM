export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
