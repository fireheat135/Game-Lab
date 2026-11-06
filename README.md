# Game Lab

ブラウザゲームの実験場（TypeScript + Vite + Vitest + Playwright）。素材は Codex の画像生成で作る。

| コマンド | 内容 |
|---|---|
| `npm ci` | 依存インストール |
| `npm run dev` | 開発サーバー |
| `npm test` | ユニットテスト（`src/game.ts`） |
| `npm run e2e` | ブラウザテスト（Playwright。ローカルでは `PW_CHROMIUM_PATH` で Chromium を指定可） |
| `npm run build` | 型チェック + ビルド（`BASE_PATH` で公開パスを指定） |

最初のゲーム: 落ちてくる隕石を ←→ で避ける。Space でリトライ。
エージェント向けの詳しいルールは [CLAUDE.md](CLAUDE.md)（= AGENTS.md）。
