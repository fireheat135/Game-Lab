---
name: new-game
description: Use when the user asks to make a new game ("ゲーム作って", a design doc, a genre idea) in game-lab. Scaffolds games/<name>/ on src/engine, rule tables, URL-tunable params, Codex pixel art, tests, bot balance sim, and a Cloudflare preview. Then follow feature-workflow for each feature.
---

# 新しいゲームの作り方（game-lab）

原則: **ロジックは純粋関数、調整値は表、見た目は後から差し替え可能に。** 1本目（`formation`）が見本。

## 0. 先に決める（定数と変数を分ける）
| 区分 | 中身 | 置き場所 |
|---|---|---|
| 定数 | 企画の原則（例: 一撃死なし、乱数は判断の前に見せる） | `rules.ts` の先頭コメント、テスト |
| 変数 | 調整したい数値すべて | `rules.ts` の `PARAMS`（URL で上書き可） |
| 名前・素材 | 世界観・スプライト | 表（`CREATURES` など）と `public/assets/` |

企画書の固有名・既存作の見た目は借りない（仕組みだけ借りる）。

## 1. 雛形（`<name>` は英小文字）
| ファイル | 役割 | 見本 |
|---|---|---|
| `games/<name>/index.html` | ページ。置くだけで Vite が自動登録（`/games/<name>/`） | `games/formation/index.html` |
| `src/games/<name>/rules.ts` | 表（主キー1つ・1セル1値）と `PARAMS` | `formation/rules.ts` |
| `src/games/<name>/run.ts` | 状態と `update(state, input, dt)`。DOM 禁止 | `formation/run.ts` |
| `src/games/<name>/view.ts` | canvas 描画。状態を読むだけ | `formation/view.ts` |
| `src/games/<name>/main.ts` | 配線: params→state←input、描画、パネル、フック | `formation/main.ts` |
| `tests/<name>.test.ts` / `e2e/<name>.spec.ts` | ユニット / ブラウザ | 同名ファイル |

`src/engine/` を使う（再実装しない）: `rnd`（状態に seed を持つ純粋乱数）、`parseParams`/`toQuery`、`createInput`（キーとボタンを action に対応づける）、`mountParamPanel`、`loadSprite`/`tinted`、`exposeTestHooks`。

## 2. 表の書き方（第1・第2正規形）
- 1セル1値。`pair=10,2` のような複合値は禁止 → `pair.chips=10`, `pair.mult=2`
- 各表は主キー1つ（`id` / `kind` / `sector`）。他の列はその主キーだけで決まる
- 繰り返しはキーに番号を付けた行にする（`ceil.1`〜`ceil.8`）。`PARAMS` は表から生成し、手で重複させない
- テストで主キーの重複がないことを確かめる

## 3. 素材（Codex のドット絵）
```bash
codex-image "<英語>. 16-bit pixel-art game sprite, chunky visible pixels, bold readable silhouette, flat shading, centered on a plain solid black background, square 1:1, no text, no border" art/<x>-src.png
python3 tools/sprite.py art/<x>-src.png public/assets/<x>.png 64
```
- 色違いで使う素材は「pure white and light gray only」で作り、`tinted(img, hex)` で塗る（1枚で全色）
- 複数枚はスクリプトにまとめて**バックグラウンド**で生成し、待つ間に実装を進める
- 一覧画像にして Read で確認してから使う。色は Okabe–Ito など色覚に配慮した配色＋形・番号でも区別

## 4. バランス（エージェントで反復）
- `sim.ts` にボット方針を複数（最善手の先読み／貪欲／何も考えない掃射）。`npm run sim` で成立率と到達度を出す
- 判定基準: **上手いボット ＞ 単純作業ボット**（腕が報われる）。逆なら配点や位置ボーナスを直す
- 変種は `SIM_QUERY="k=1.5&..." npm run sim` で比べ、採用値を `rules.ts` の初期値とコメントに残す

## 5. UI/UX の最低線
状態の見える化（目標・残り資源・キュー）、行動への即時フィードバック、思い出させない（一覧表・予想値・ヒント）、判断中に情報を隠さない、一時停止（タブ離脱で自動）、タッチボタン 44px 以上、キーボードの説明を常時表示、死後に死因と不足分。

## 6. セキュア・課金ゼロ
- URL 由来の値は `parseParams` で数値化・範囲制限してから使う。DOM は `textContent`/`createElement`（`innerHTML` 禁止）
- `public/_headers` の CSP（`'self'` のみ）を保つ。外部 CDN を足さない
- テスト用フックは `exposeTestHooks`（e2e ビルドだけ）。本番で `grep -c <hook名> dist/assets/*.js` = 0
- Cloudflare は静的アセットのみ（`wrangler.jsonc` に `main` を書かない、バインディングなし）。`npx wrangler deploy --dry-run` で `No bindings found` を確認

## 7. 公開と検証
- ブランチにプッシュすると Cloudflare Workers Builds がプレビュー URL を PR にコメントする。ユーザーはそこで遊び、クエリで調整する
- 完了前に CLAUDE.md の検証一式＋`npm run sim`。以後の機能追加は `feature-workflow`
