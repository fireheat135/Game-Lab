---
name: feature-workflow
description: Use before adding or changing any game feature, mechanic, or behavior in game-lab (not for typo-level fixes). Stages - clarify, design, plan, test-first implementation, blind review, verify. Condensed from obra/superpowers (MIT) and adapted to this repo.
---

# 機能追加の進め方（game-lab）

原則: **作る前に「何を・なぜ」を確かめ、テストで先に失敗させ、証拠を見てから「できた」と言う。**

| 段階 | やること | 終わりの条件 |
|---|---|---|
| 1. 確認 | 依頼と関連コード（`src/game.ts`, `src/main.ts`, `tests/`, `e2e/`）を先に読む。足りない点が**作る物を変える**ときだけ、一番大きい1点を質問。「なぜ欲しいか」が不明なら聞く | 依頼を自分の言葉で言い直せる |
| 2. 設計 | 案を2〜3個、トレードオフと推奨付きで出し、選んでもらう。明らかに1案なら短い設計（方針・他案を捨てた理由・数行の設計）を出して承認をもらう | ユーザーの承認 |
| 3. 計画 | タスクに分割。各タスク = 触るファイル・関数の形・それを証明するテスト。`src/game.ts` は純粋関数のまま、描画は `src/main.ts` | 各タスクが単独でテスト可能 |
| 4. 実装（TDD） | タスクごとに: 失敗するテストを書く → **実行して失敗を見る** → 最小の実装 → 全テスト緑 → コミット | 赤→緑を実際に見た |
| 5. 盲検レビュー | 自分の懸念を先に書き、`codex-review --base main` を実行して突き合わせる（`codex` スキル参照） | 指摘ごとに採否と理由 |
| 6. 検証 | `npm run typecheck && npm test && npm run build && npm run e2e` を**今この場で**実行し、出力を読む。見た目の変更は e2e のスクリーンショットを Read で確認 | 全コマンドの成功を出力で確認 |

## ゲーム特有の判断
- 手触り（効果音・揺れ・ヒットストップ）は `game-feel`、操作系は `input-systems`、重さは `performance-optimization`（まず計測）。
- 乱数に依存する仕様は、乱数を引数で注入できる形にしてユニットテストで固定する。e2e では「どちらかの結果」を検証し片方に賭けない。
- 素材が必要なら `codex-image` → `tools/sprite.py`（CLAUDE.md の手順）。

## 赤信号（止まって戻る）
- テストより先に本体コードを書いた → 消してテストから。
- 「たぶん動く」「通るはず」と言いそうになった → 6 を実行してから言う。
- サブエージェントや Codex の「成功しました」をそのまま信じた → `git diff` とテスト出力で確かめる。
