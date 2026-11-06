# Game Lab — エージェント向けルール（Claude / Codex 共通。AGENTS.md はこのファイルへのリンク）

## 構成
| 層 | 場所 | 方針 |
|---|---|---|
| 共通エンジン | `src/engine/` | 乱数・パラメータ表・入力・パネル・スプライト・テスト用フック。ゲームをまたいで再利用 |
| ゲームのロジック | `src/games/<name>/{rules,run,...}.ts` | DOM 非依存の純粋関数。必ず `tests/` にユニットテスト |
| 描画・配線 | `src/games/<name>/{view,main}.ts` | canvas に描く。e2e 用に `canvas.dataset` を更新 |
| ページ | `games/<name>/index.html` | 置くだけで `/games/<name>/` として自動登録（`vite.config.ts`） |
| 素材 | `public/assets/*.png` | 64px 透過 PNG。元画像は `art/`（git 管理外） |
| 最初のゲーム | `index.html` + `src/main.ts` + `src/game.ts` | 隕石よけ（旧構成のまま） |

## 新しいゲーム・機能
- 「ゲーム作って」→ `new-game` スキル（雛形・表・素材・バランス・公開）
- 機能追加・仕様変更 → `feature-workflow`（確認→設計→計画→TDD→盲検レビュー→検証）
- 調整値はすべて `rules.ts` の `PARAMS`（1キー1数値）。ユーザーは URL クエリ（`?k=1.5&pair.chips=12`）かページのパネルで直接編集して検証する
- 表は第1・第2正規形: 1セル1値、主キー1つ、他の列は主キーだけで決まる

## 素材の作り方（Codex 画像生成）
1. `codex-image "<英語。pixel-art …, centered on a plain solid black background, square 1:1, no text>" art/<name>-src.png`
2. `python3 tools/sprite.py art/<name>-src.png public/assets/<name>.png 64`（黒背景→透過・余白トリム・縮小）
3. 一覧画像にして Read で確認してから使う。色違いは白で作って `tinted()` で塗る

## スキル（`.agents/skills/` = Codex。`.claude/skills` はそのリンク = Claude）
| スキル | 使う場面 |
|---|---|
| `new-game` | 新しいゲームを作る |
| `feature-workflow` | 機能追加・仕様変更の前に必ず |
| `game-feel` | 手触り・揺れ・ヒットストップ・イージング |
| `input-systems` | 操作の抽象化・キー設定・タッチ・先行入力 |
| `performance-optimization` | 重い・カクつく（計測してから直す） |
出典とライセンスは `.agents/skills/third_party/README.md`。

## 検証（コミット前に全部）
`set -o pipefail; npm run typecheck && npm test && npm run build && npm run e2e && npm run test:tools`
- `| tail` などのパイプを挟むときは必ず `set -o pipefail`（無いと失敗しても `&&` が進み、壊れたままプッシュする）
- e2e はローカルなら `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` を付ける（CI では不要）。`--repeat-each=3` で安定性も見る
- ランダム要素は `?seed=N` で固定。衝突・撃破・静止は `?test` のフック（`exposeTestHooks`）で確実に起こす。確率待ちのテストは書かない
- `canvas.dataset` は次のフレームで更新される: フック呼び出しや keypress の直後は `expect.poll` で待つ。開始（Enter）も play になるまで待ってからフックを呼ぶ
- テスト用フックは e2e ビルド（`VITE_E2E=1`）にだけ入る。本番ビルドで `grep -c <フック名> dist/assets/*.js` = 0 を確認
- バランスを変えたら `npm run sim`（ボット比較。上手いボット ＞ 単純掃射ボット を保つ）
- `test:tools` は Pillow が必要（CI 未対応。ローカルで実行）

## 公開（Cloudflare Workers Builds、課金ゼロ構成）
- プッシュすると Cloudflare がビルドし、PR にプレビュー URL をコメントする。ユーザーはそこで遊ぶ（ローカル確認は求めない）
- `wrangler.jsonc` は静的アセットのみ: `main`（Worker スクリプト）やバインディング（KV/R2/D1 等）を足さない。`npx wrangler deploy --dry-run` で `No bindings found` を確認
- `public/_headers` の CSP は `'self'` のみ。外部 CDN・外部通信を足さない。DOM は `textContent`（`innerHTML` 禁止）
- Cloudflare のビルドログは GitHub のチェックに本文が出ない。失敗時は推測で直さず、まずユーザーにログ末尾を貼ってもらう
- ブランチのビルドは `npx wrangler preview`（`previews` ブロック必須）。プレビュー URL はダッシュボードで workers.dev / Preview URLs を有効化して出る
- 本番 URL は https://game-lab.saikyo-koryaku-lab.workers.dev （サブドメインはメール由来ではない。推測せずデプロイログで確認）。本番確認はこのホストに Playwright で実操作（フックは無いので `?fire=0&speed=0` などで条件を作る）

## GitHub
- `.github/workflows/` は Claude からプッシュ不可 → コピペ用ブロックでユーザーに渡す
- 依存追加は `npm view <pkg> version` で最新を確認し、`npm audit` 0 件で
