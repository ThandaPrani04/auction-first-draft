import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

/**
 * If NODE_ENV=production is set in the shell (it is, on this machine, and it
 * also silently makes `npm install` skip devDependencies), Vite's dependency
 * pre-bundler resolves React's PRODUCTION build even for `npm run dev`. The
 * production copy of react/jsx-dev-runtime exports `jsxDEV = undefined`, while
 * the dev-mode JSX transform emits calls to it — so the app dies on the first
 * render with "_jsxDEV is not a function" and a white screen.
 *
 * Forcing it here means `npm run dev` behaves correctly whatever the shell
 * says. `vite build` is unaffected: it sets production mode itself.
 */
export default defineConfig(({ command }) => {
  if (command === 'serve') process.env.NODE_ENV = 'development';

  return {
    plugins: [react()],
    server: {
      // Bind both IPv4 and IPv6 loopback, so http://localhost and
      // http://127.0.0.1 both work regardless of how Windows resolves it.
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
  };
});
