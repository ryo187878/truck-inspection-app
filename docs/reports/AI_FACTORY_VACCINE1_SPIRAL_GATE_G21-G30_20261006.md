# AI FACTORY 優先度1ワクチン / SPIRAL GATE G21-G30 完了レポート

- 日付: 2026-10-06
- 対象: TRAMO 海コン枝番ロジック
- 対象main反映前: d7ba666962dc35e91a5ce7abfebb396e0cdc930d
- ワクチン反映main: 8f57230822eb116fe1a99ee78363b0e21fef9a7f
- クリーンブランチ: ai-factory/vaccine1-clean-20261006
- 判定: 収束候補
- DOUBLE VERIFIED: PASS

## 1. 抗体検査

本テスト前に「テスト設計そのものが甘くなっていないか」を確認した。

原則:
- ずるさせない
- ビビらせない
- 必要十分な検証で前進する

結果:
- 8 / 8 PASS
- 同一車両・別乗務員
- 別車両・同一乗務員
- 前後空白
- 片側未入力
- 工程逆順
- 新規枝番号手入力拒否
- 重複工程の原子性
- 別案件otherExistingStageId拒否

明確な高影響の抜けは見つからず、過剰警戒へ入らず本テストへ進んだ。

## 2. クリーンワクチン

旧ワクチンコミットには優先度1と無関係な一般配車変更が混在していたため、mainから新規クリーンブランチを作成して必要差分だけを再構成した。

変更対象:
1. dispatch-service.js
2. index.html
3. test/index.html
4. tools/verify-release.test.cjs
5. test/dispatch-service.js 削除

特に test/index.html は旧ワクチンの複数変更を除外し、共有dispatch core参照の1行変更だけに縮小した。

## 3. main反映

mainを以下のとおりfast-forward反映した。

- before: d7ba666962dc35e91a5ce7abfebb396e0cdc930d
- after: 8f57230822eb116fe1a99ee78363b0e21fef9a7f

force updateは使用していない。

## 4. SPIRAL GATE G21-G30

10世代すべてPASS。

- G21: 基準枝番4パターン
- G22: 車番×乗務員キー厳密性
- G23: 既存案件の再正規化と再分離
- G24: 未入力と入力順逆転
- G25: 不正入力拒否・原子性
- G26: nextBranch / maxBranch整合
- G27: UI→兄弟工程取得→branchUpdates反映
- G28: main/test共通core正本化
- G29: Firestore Rules / PWA配信互換
- G30: 差分純度 / 回帰テスト固定化

結果:
- PASS: 10
- FAIL: 0
- 新規重大Evidence: 0
- 新規回帰: 0
- 未承認差分: 0

## 5. DOUBLE VERIFIED

### C: 内→外
PASS

確認:
- core正規化
- branchUpdates返却
- UI反映
- Firestore保存経路

### L: 外→内
PASS

確認:
- UIからcore呼出し
- 兄弟工程取得
- Rules tenant制約
- test共有core参照
- 差分純度

最終結果:
DOUBLE VERIFIED = PASS

## 6. SPIRAL GATE 判定

判定: 収束候補

理由:
- G21-G30 10/10 PASS
- 新規重大Evidenceなし
- 未承認差分なし
- 追加の探索価値が低下
- これ以上の無制限な疑いは「ビビらせない」原則に反するため打ち切り

収束候補は自動S1昇格を意味しない。最終昇格は人間判断とする。

## 7. 時間・安全コスト

- 通常修正なら推定: 約2〜3分
- AI FACTORY検証込み: 約20分
- 追加安全コスト: 約17〜18分
- 実際に止めた問題: 1件

止めた問題:
旧ワクチンコミットに混在していた、優先度1と無関係な一般配車変更のmain持込みを阻止した。

参考:
- 優先度1監査再開からレポート確定まで: 約28分
- main反映後のSPIRAL GATE中心工程: 約20分

## 8. 結論

優先度1ワクチンはmainへ反映済み。
抗体検査、差分純度監査、G21-G30、DOUBLE VERIFIEDを通過し、SPIRAL GATEは「収束候補」と判定した。

AI FACTORY原則:
「ずるさせない、ビビらせない。必要十分な検証で前進する。」
