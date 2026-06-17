import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// ローカル開発(floci の Cognito)向け: ブラウザから localhost:4566 へ直接
// アクセスすると CORS で弾かれる(floci は CORS ヘッダを返さない)ため、
// Vite dev サーバーの same-origin プロキシ経由で floci(cognito-idp)へ中継する。
// cognito-local-shim.ts が cognito-idp の URL を VITE_APP_COGNITO_ENDPOINT
// (= "/_cognito-idp") に書き換える前提。
// プロキシ先はコンテナ内から到達可能な service 名(http://localstack:4566)。
const cognitoProxyTarget =
  process.env.COGNITO_PROXY_TARGET || 'http://localstack:4566';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      './runtimeConfig': './runtimeConfig.browser',
    },
  },
  server: {
    proxy: {
      '/_cognito-idp': {
        target: cognitoProxyTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/_cognito-idp/, ''),
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
});
