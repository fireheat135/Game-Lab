# Game Lab — エージェント向けルール（Claude / Codex 共通。AGENTS.md はこのファイルへのリンク）

## 構成
| 層 | 場所 | 方針 |
|---|---|---|
| ロジック | `src/game.ts` | DOM 非依存の純粋関数。必ず `tests/` にユニットテスト |
| 描画・入力 | `src/main.ts` | canvas に描く。e2e 用に `canvas.dataset`（score, x, over, sprites）を更新 |
| 素材 | `public/assets/*.png` | 64px 透過 PNG。元画像は `art/`（git 管理外） |

## 素材の作り方（Codex 画像生成）
1. `codex-image "<英語。pixel-art …, centered on a plain solid black background, square 1:1, no text>" art/<name>-src.png`
2. `python3 tools/sprite.py art/<name>-src.png public/assets/<name>.png 64`（黒背景→透過・余白トリム・縮小）
3. Read で見た目を確認してから使う

## 検証（コミット前に全部）
`npm run typecheck && npm test && npm run build && npm run e2e`
- e2e はローカルなら `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` を付ける（CI では不要）
- ランダム要素に依存するテストは「どちらかの結果になる」ことを検証し、片方に賭けない

## GitHub
- `.github/workflows/` は Claude からプッシュ不可 → コピペ用ブロックでユーザーに渡す
- 依存追加は `npm view <pkg> version` で最新を確認し、`npm audit` 0 件で
