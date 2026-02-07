# fontcheck コードレビュー - 改善事項

## 概要

本ドキュメントは、fontcheck プロジェクトのコードをシニアエンジニアの視点でレビューし、構造・品質・保守性の観点から改善事項をまとめたものである。

---

## 1. プロジェクト構造

### 現状の問題

```
fontcheck/
├── check.mjs          # Node.js 版（ハードコードされたフォント名）
├── main.ts            # Deno 版（CLI引数対応）
├── typefontkit.ts     # fontkit の型定義（未使用）
├── main_test.ts       # テスト（存在しない add 関数をテスト）
├── package.json       # name が "hoge"
├── deno.json
└── README.md          # "# fontcheck" のみ
```

### 改善点

| # | 問題 | 深刻度 | 説明 |
|---|------|--------|------|
| 1-1 | Node.js 版と Deno 版の二重実装 | 中 | `check.mjs` と `main.ts` が同じロジックを重複して持っている。ランタイムを Deno に統一するか、共通ロジックをランタイム非依存のモジュールに切り出すべき。 |
| 1-2 | `typefontkit.ts` が未使用 | 低 | 型定義ファイルが存在するが `main.ts` では `any` にキャストしており活用されていない。使うか削除すべき。 |
| 1-3 | ディレクトリ構造が平坦 | 低 | 規模が小さいため現状は許容範囲だが、`src/` にソースコードを、`types/` に型定義を配置する構成のほうが拡張しやすい。 |

---

## 2. 型安全性

### `main.ts:1-4` - `@ts-expect-error` と `any` キャスト

```typescript
// @ts-expect-error
import { openSync as _openSync } from "npm:fontkit";

const openSync = _openSync as (filename: string, postscriptName?: string) => any
```

| # | 問題 | 深刻度 | 説明 |
|---|------|--------|------|
| 2-1 | `any` 型の多用 | 高 | `openSync` の戻り値が `any` のため、`font` オブジェクトに対する操作が全て型チェックされない。`typefontkit.ts` に `Font` 型を定義済みなのに使っていない。 |
| 2-2 | `@ts-expect-error` による型エラーの抑制 | 中 | import のエラーを抑制するのではなく、`deno.json` の `imports` マッピングと `typefontkit.ts` の型を組み合わせて正しく解決すべき。 |

**推奨**: `openSync` の戻り値に `Font` 型を適用し、`check` 関数や `resultLog` 関数の引数にも適切な型を付ける。

```typescript
import type { Font } from "./typefontkit.ts";

const openSync = _openSync as (filename: string, postscriptName?: string) => Font;
```

---

## 3. バグ・ロジックの問題

### `main.ts:39-40` - 引数の意味が逆

```typescript
const fontName = Deno.args[0]
const str = Deno.args[1] || "DWPIMincho.ttf";
```

| # | 問題 | 深刻度 | 説明 |
|---|------|--------|------|
| 3-1 | `str`（チェック対象文字列）のデフォルト値がフォントファイル名 | 高 | `Deno.args[1]` が未指定の場合、`"DWPIMincho.ttf"` という文字列が「チェック対象文字」として使われる。これはフォントファイル名であり、明らかにバグ。デフォルトは空文字列 `""` にするか、引数なしの場合は組み込みリストのみをチェックするようにすべき。 |

### `main.ts:18-25` - check 関数の設計

```typescript
const check = (font: any, str: string) => {
  const mergedStr = 文字化けしやすい日本語の漢字.concat([...str])
```

| # | 問題 | 深刻度 | 説明 |
|---|------|--------|------|
| 3-2 | サロゲートペアの考慮不足 | 中 | `[...str]` はサロゲートペアを正しく分割するが、チェック対象リスト自体に `𠮷`（U+20BB7）が含まれており、この文字は2つの UTF-16 コードユニットで構成される。`codePointAt(0)` は正しく動作するため現状問題ないが、このような文字を扱っている認識がコード上に無い。 |

### `check.mjs:16` - `codePointAt(0)` の null チェック未実施

```javascript
const glyph = font.glyphForCodePoint(char.codePointAt(0));
```

| # | 問題 | 深刻度 | 説明 |
|---|------|--------|------|
| 3-3 | `codePointAt(0)` が `undefined` を返す可能性 | 低 | 空文字列が渡された場合 `undefined` を返す。`glyphForCodePoint(undefined)` の挙動が未定義。フィルタで空文字列を除外するか、ガード節を入れるべき。 |

---

## 4. check.mjs の問題

### `check.mjs:36-38` - ハードコードされたフォントパス

```javascript
resultLog(check(fontkit.openSync("BIZUDPGothic-Regular.ttf")));
resultLog(check(fontkit.openSync("DWPIMincho.ttf")));
```

| # | 問題 | 深刻度 | 説明 |
|---|------|--------|------|
| 4-1 | フォントファイル名がハードコード | 中 | CLI引数やコンフィグで指定可能にすべき。存在しないフォントを指定するとエラーで落ちる。 |
| 4-2 | `check` 関数のシグネチャが `main.ts` と異なる | 中 | `check.mjs` は `check(font)` で追加文字列を受け取れない。二重実装のため差異が生じている。 |
| 4-3 | エラーハンドリングがない | 中 | `openSync` がファイルを開けなかった場合、スタックトレースがそのまま出力される。ユーザーフレンドリーなエラーメッセージを出すべき。 |

---

## 5. テスト

### `main_test.ts` - テストが壊れている

```typescript
import { add } from "./main.ts";

Deno.test(function addTest() {
  assertEquals(add(2, 3), 5);
});
```

| # | 問題 | 深刻度 | 説明 |
|---|------|--------|------|
| 5-1 | `main.ts` に `add` 関数が存在しない | 高 | テストが import エラーで失敗する。テンプレートのまま残っている可能性が高い。 |
| 5-2 | フォントチェック機能のテストが皆無 | 高 | コアロジックである `check` 関数や `resultLog` 関数のテストが一切ない。 |

**推奨テストケース**:
- `check` 関数: 既知のフォントに対して、サポートされていない文字のリストが正しく返されるか
- `check` 関数: 空文字列を渡した場合、組み込みリストのみチェックされるか
- `resultLog` 関数: 出力フォーマットが期待通りか（stdout をキャプチャしてテスト）
- CLI 引数: 引数なし実行時のエラーメッセージ

---

## 6. package.json の問題

```json
{
  "name": "hoge",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  ...
}
```

| # | 問題 | 深刻度 | 説明 |
|---|------|--------|------|
| 6-1 | `name` が `"hoge"`（仮名） | 低 | `"fontcheck"` に修正すべき。 |
| 6-2 | `main` が `"index.js"` | 低 | 実際のエントリポイントは `check.mjs`。存在しないファイルを指している。 |
| 6-3 | `description` が空 | 低 | プロジェクトの説明を記載すべき。 |
| 6-4 | `@types/fontkit` が `dependencies` に入っている | 低 | 型定義パッケージは `devDependencies` に配置すべき。 |

---

## 7. `typefontkit.ts` の品質問題

### 文字化けしたコメント

```typescript
/** the size of the font窶冱 internal coordinate grid */
```

| # | 問題 | 深刻度 | 説明 |
|---|------|--------|------|
| 7-1 | JSDoc コメントに文字化け（`窶冱` → `'s`） | 中 | 複数箇所で `'s` がUTF-8 の文字化けにより `窶冱` になっている。修正が必要。該当箇所: `unitsPerEm`, `ascent`, `descent`, `bbox` のコメント、および `Glyph` インターフェースの `bbox`, `cbox`, `advanceWidth` のコメント。 |

---

## 8. コード品質・保守性

| # | 問題 | 深刻度 | 説明 |
|---|------|--------|------|
| 8-1 | 日本語変数名の使用 | 低 | `文字化けしやすい日本語の漢字` は意味を明示する点で有用だが、ツールチェーンとの相性問題や国際的な貢献者への障壁になりうる。定数名は英語（例: `MOJIBAKE_PRONE_KANJI`）にし、コメントで日本語の説明を添えるのが一般的。 |
| 8-2 | `check` 関数が `font` オブジェクトをそのまま返している | 低 | `check` の戻り値に `font` を含めるのは `resultLog` に渡すためだけ。関数の責務が不明確。チェック結果のみ返し、`font` 情報は呼び出し側で管理するほうが明確。 |
| 8-3 | `resultLog` が副作用（console.log）のみ | 低 | 結果をデータとして返す関数と、表示する関数を分離すべき。テストがしづらい原因にもなっている。 |
| 8-4 | `check.mjs` でセミコロンの不統一 | 低 | 一部の行にセミコロンがあり、一部にはない。Linter/Formatter を導入して統一すべき。 |

---

## 9. セキュリティ・堅牢性

| # | 問題 | 深刻度 | 説明 |
|---|------|--------|------|
| 9-1 | ファイルパスのバリデーションなし | 中 | `Deno.args[0]` で受け取ったパスをそのまま `openSync` に渡している。パストラバーサルは Deno のパーミッションシステムで軽減されるが、ファイルの存在チェックやエラーハンドリングは必要。 |
| 9-2 | `deno.json` の `dev` タスクで `-A` (全権限) | 低 | 開発時とはいえ、`--allow-read` のみで十分。最小権限の原則に従うべき。 |

---

## 10. 優先度順の改善アクションリスト

### P0 (即座に修正すべき)
1. **テストの修正**: `main_test.ts` の壊れたテストを削除または修正する
2. **引数バグの修正**: `main.ts:40` の `str` のデフォルト値を修正する

### P1 (次のイテレーションで対応)
3. **型安全性の改善**: `typefontkit.ts` の `Font` 型を実際に活用し、`any` を排除する
4. **二重実装の解消**: `check.mjs` を削除し Deno に統一するか、共通モジュールを切り出す
5. **コアロジックのテスト追加**: `check` 関数の単体テストを作成する
6. **エラーハンドリング追加**: ファイル存在チェック、ユーザーフレンドリーなエラーメッセージ

### P2 (余裕があるときに対応)
7. **package.json の修正**: `name`, `main`, `description` の修正
8. **文字化けコメントの修正**: `typefontkit.ts` の `窶冱` → `'s`
9. **コード構造の改善**: `check` 関数の戻り値から `font` を分離、`resultLog` のリファクタリング
10. **Linter/Formatter 導入**: `deno fmt` / `deno lint` の設定
11. **README の充実**: 使い方、対象文字の説明、前提条件の記載
