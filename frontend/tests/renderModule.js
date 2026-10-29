import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Compile the actual JSX with the app's Vite/React toolchain, in memory.
// Resolve external dependencies from this test file so data: modules can load
// the same React instance used by act() and the DOM renderer.
export async function compileModule(entry) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = await build({
    configFile: false, root, logLevel: 'silent', plugins: [react()],
    build: { ssr: fileURLToPath(new URL(`../src/${entry}`, import.meta.url)), write: false,
      rollupOptions: { output: { paths: id => import.meta.resolve(id) } } },
  });
  const code = result.output.find(output => output.type === 'chunk' && output.isEntry).code;
  return () => import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${crypto.randomUUID()}`);
}
