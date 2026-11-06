# Game Lab

ブラウザゲームの実験場（TypeScript + Vite + Vitest + Playwright）。素材は Codex の画像生成で作る。

| コマンド | 内容 |
|---|---|
| `npm ci` | 依存インストール |
| `npm run dev` | 開発サーバー |
| `npm test` | ユニットテスト（`src/game.ts`） |
| `npm run e2e` | ブラウザテスト（Playwright。ローカルでは `PW_CHROMIUM_PATH` で Chromium を指定可） |
| `npm run build` | 型チェック + ビルド（`BASE_PATH` で公開パスを指定） |

| `npm run sim` | バランス計測（ボットで役の成立率と到達度。`SIM_QUERY="k=1.5"` で変種） |

| ゲーム | URL | 内容 |
|---|---|---|
| 隕石よけ | `/` | 落ちてくる隕石を ←→ で避ける。Space でリトライ |
| FORMATION HAND | `/games/formation/` | 深海の群れを撃つ順番で役をつくる隊列シューティング × ローグライト（試作）。調整値はすべて URL クエリで変更可 |

公開（Cloudflare Workers Builds、静的アセットのみ・課金ゼロ構成）:
- 本番（`main`）: https://game-lab.saikyo-koryaku-lab.workers.dev/ ・ FORMATION HAND は `/games/formation/`
- ブランチ: プッシュするとプレビューがビルドされ、PR にコメントされる
エージェント向けの詳しいルールは [CLAUDE.md](CLAUDE.md)（= AGENTS.md）。
