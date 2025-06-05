// @ts-expect-error
import { openSync as _openSync } from "npm:fontkit";

const openSync = _openSync as (filename: string, postscriptName?: string) => any

const 文字化けしやすい日本語の漢字: string[] = [
  "髙",
  "彅",
  "㐂",
  "杮",
  "吉",
  "𠮷",
  "㟢",
  "﨑",
  "齋",
];

const check = (font: any, str: string) => {
  const mergedStr = 文字化けしやすい日本語の漢字.concat([...str])
  const list = mergedStr.filter((char) => {
    const glyph = font.glyphForCodePoint(char.codePointAt(0));
    return !glyph || glyph.id === 0;
  });
  return { list, font };
};

const resultLog = ({ list, font }: {list: string[], font:any}) => {
  console.log(`
フォント名: ${font.fullName}`);

  console.log("含まれていない文字の一覧");
  list.forEach((char: string) => {
    console.log(`${char} (${char.codePointAt(0)?.toString(16).toUpperCase()})`);
  });
  console.log(`合計 ${list.length} 文字`);
};

if (import.meta.main) {
  const fontName = Deno.args[0]
  const str = Deno.args[1] || "DWPIMincho.ttf";

  if (!fontName) {
    console.error("フォントファイル名を指定してください。");
    Deno.exit(1);
  }
  resultLog(check(openSync(fontName), str));
}
