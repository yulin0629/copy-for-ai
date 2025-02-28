const esbuild = require('esbuild');
const { copy } = require('esbuild-plugin-copy');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const production = args.includes('--production');

// 創建 media 目錄
if (!fs.existsSync('./dist/media')) {
  fs.mkdirSync('./dist/media', { recursive: true });
}

if (!fs.existsSync('./dist/media/contextExplorer')) {
  fs.mkdirSync('./dist/media/contextExplorer', { recursive: true });
}

// 建構配置
const buildOptions = {
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  external: ['vscode'],
  platform: 'node',
  outfile: './dist/extension.js',
  format: 'cjs',
  minify: production,
  sourcemap: !production,
  plugins: [
    copy({
      resolveFrom: 'cwd',
      assets: {
        from: ['./media/**/*'],
        to: ['./dist/media'],
      },
    }),
  ],
};

// 監視模式
if (watch) {
  esbuild
    .context(buildOptions)
    .then((ctx) => {
      console.log('Watching for changes...');
      return ctx.watch();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else {
  esbuild
    .build(buildOptions)
    .then(() => {
      console.log('Build complete');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}