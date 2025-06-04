import * as fontkit from "fontkit"

const 文字化けしやすい日本語の漢字 = [
  "髙",
  "﨑",
  "彅",
  "㐂",
  "杮",
  "𠮷",
  "齋",
]

const check = (font) => {

  const list = 文字化けしやすい日本語の漢字.filter(char => {
    const glyph = font.glyphForCodePoint(char.codePointAt(0));
    return !glyph || glyph.id === 0
  })
  return {list, font};
}

const resultLog = ({list, font}) => {
  console.log(`
フォント名: ${font.fullName}`);

  console.log("含まれていない文字の一覧")
  list.forEach(char => {
    console.log(`${char} (${char.codePointAt(0).toString(16).toUpperCase()})`);
  }
  );
  console.log(`合計 ${list.length} 文字`);
}

resultLog(check(fontkit.openSync("BIZUDPGothic-Regular.ttf")));

resultLog(check(fontkit.openSync("DWPIMincho.ttf")));