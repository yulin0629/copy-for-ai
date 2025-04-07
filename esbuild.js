const esbuild = require('esbuild');
const { copy } = require('esbuild-plugin-copy');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const production = args.includes('--production');

// 創建 media 目錄 (如果不存在)
const mediaDir = './dist/media/contextExplorer';
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

// --- Extension Build ---
const extensionBuildOptions = {
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  external: ['vscode'],
  platform: 'node',
  outfile: './dist/extension.js',
  format: 'cjs',
  minify: production,
  sourcemap: !production,
};

// --- WebView Build ---
const webviewBuildOptions = {
  // *** 修改: entryPoints 指向新的 main.js ***
  entryPoints: ['./media/contextExplorer/main.js'],
  bundle: true,
  // *** 修改: outfile 指向最終的 WebView JS 檔案 ***
  outfile: './dist/media/contextExplorer/main.js',
  // *** 修改: format 為 iife (Immediately Invoked Function Expression) 更適合 WebView ***
  format: 'iife',
  minify: production,
  sourcemap: !production,
  // WebView 不需要 external vscode
};

// --- Copy Static Assets ---
const copyPlugin = copy({
  resolveFrom: 'cwd',
  assets: [
    {
      // *** 修改: 只複製 CSS 和其他靜態資源，JS 由 esbuild 打包 ***
      from: ['./media/contextExplorer/styles.css'],
      to: ['./dist/media/contextExplorer'],
    },
    {
      from: ['./media/icon.svg'], // 複製頂層 icon
      to: ['./dist/media']
    }
    // 如果有其他 media 資源，可以在這裡添加
  ],
  watch: watch, // 在 watch 模式下也複製
});


// --- Build Logic ---
async function build() {
  try {
    console.log(`Starting build (production=${production}, watch=${watch})...`);

    // Build extension
    await esbuild.build(extensionBuildOptions);
    console.log('Extension build complete.');

    // Build webview
    await esbuild.build({
        ...webviewBuildOptions,
        plugins: [copyPlugin] // 將 copy plugin 加到 webview build 中確保順序
    });
    console.log('WebView build complete and assets copied.');

    console.log('Build finished successfully.');

  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

// --- Watch Logic ---
async function watchMode() {
    console.log('Starting watch mode...');
    try {
        // Watch extension
        const ctxExtension = await esbuild.context(extensionBuildOptions);
        await ctxExtension.watch();
        console.log('Watching extension files...');

        // Watch webview and copy assets
        const ctxWebview = await esbuild.context({
            ...webviewBuildOptions,
            plugins: [copyPlugin] // 確保 watch 時也複製
        });
        await ctxWebview.watch();
        console.log('Watching webview files and assets...');

    } catch (err) {
        console.error('Watch mode setup failed:', err);
        process.exit(1);
    }
}

// --- Run ---
if (watch) {
  watchMode();
} else {
  build();
}