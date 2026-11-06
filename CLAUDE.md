# Game Lab — エージェント向けルール（Claude / Codex 共通。AGENTS.md はこのファイルへのリンク）

## 構成
| 層 | 場所 | 方針 |
|---|---|---|
| ロジック | `src/game.ts` | DOM 非依存の純粋関数。必ず `tests/` にユニットテスト |
| 描画・入力 | `src/main.ts` | canvas に描く。e2e 用に `canvas.dataset`（score, x, over, blocks, sprites）を更新 |
| 素材 | `public/assets/*.png` | 64px 透過 PNG。元画像は `art/`（git 管理外） |

## 素材の作り方（Codex 画像生成）
1. `codex-image "<英語。pixel-art …, centered on a plain solid black background, square 1:1, no text>" art/<name>-src.png`
2. `python3 tools/sprite.py art/<name>-src.png public/assets/<name>.png 64`（黒背景→透過・余白トリム・縮小）
3. Read で見た目を確認してから使う

## スキル（`.agents/skills/` = Codex。`.claude/skills` はそのリンク = Claude）
| スキル | 使う場面 |
|---|---|
| `feature-workflow` | 機能追加・仕様変更の前に必ず（確認→設計→計画→TDD→盲検レビュー→検証） |
| `game-feel` | 手触り・揺れ・ヒットストップ・イージング |
| `input-systems` | 操作の抽象化・キー設定・タッチ・先行入力 |
| `performance-optimization` | 重い・カクつく（計測してから直す） |
出典とライセンスは `.agents/skills/third_party/README.md`。

## 検証（コミット前に全部）
`npm run typecheck && npm test && npm run build && npm run e2e && npm run test:tools`
- e2e はローカルなら `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` を付ける（CI では不要）
- ランダム要素は `?seed=N`（`mulberry32`）で固定、衝突などは `?test` の `window.__gameTest` で確実に起こす。確率待ちのテストは書かない
- `test:tools` は Pillow が必要（CI 未対応。ローカルで実行）

## GitHub
- `.github/workflows/` は Claude からプッシュ不可 → コピペ用ブロックでユーザーに渡す
- 依存追加は `npm view <pkg> version` で最新を確認し、`npm audit` 0 件で
