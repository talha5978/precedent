import fs from 'node:fs';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.json')) {
    if (context.parentURL) {
      try {
        const candidateUrl = new URL(`${specifier}.ts`, context.parentURL);
        if (fs.existsSync(candidateUrl)) {
          return nextResolve(`${specifier}.ts`, context);
        }
      } catch {
        // Fall back to default resolution
      }
    }
  }
  return nextResolve(specifier, context);
}
