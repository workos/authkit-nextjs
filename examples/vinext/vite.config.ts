import { defineConfig } from 'vite';
import vinext from 'vinext';
import rsc from '@vitejs/plugin-rsc';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig(({ command }) => {
  // For local dev: let vinext auto-register RSC
  if (command === 'serve') {
    return {
      plugins: [vinext()],
    };
  }

  // For build/deploy: use Cloudflare plugin with explicit RSC entries
  return {
    plugins: [
      vinext({ rsc: false }),
      rsc({
        entries: {
          rsc: 'virtual:vinext-rsc-entry',
          ssr: 'virtual:vinext-app-ssr-entry',
          client: 'virtual:vinext-app-browser-entry',
        },
      }),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      }),
    ],
  };
});
