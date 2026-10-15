// One mandatory entry point for the local-first build, cache, render and private-media contracts.
await import('./test-runtime-assets.mjs');
await import('./test-offline-manifest.mjs');
await import('./test-offline-runtime.mjs');
await import('./test-local-render-runtime.mjs');
await import('./test-private-media-local-runtime.mjs');
await import('./test-public-card-local-import-runtime.mjs');
console.log('Local-first runtime contract groups passed.');
