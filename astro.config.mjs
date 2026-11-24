import { defineConfig } from 'astro/config';

// The Velvet Cellar: a static site. Access protection, forms and private
// storage are added on Netlify at later checkpoints (see docs/ARCHITECTURE.md).
export default defineConfig({
  devToolbar: { enabled: false },
  build: {
    // One small page so far: inlining the stylesheet avoids a render-blocking request.
    inlineStylesheets: 'always',
  },
});
