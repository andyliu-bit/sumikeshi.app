// 生成一份「錯誤的黑塗り」PDF：黑色矩形蓋住文字，但文字層原封不動。
// 這正是大分大學 / 木更津市事故的成因。
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { writeFileSync } from "node:fs";

const PAGE_W = 595, PAGE_H = 842;

// 黑框位置（pdf-lib 座標系：原點左下）
export const BOX = { x: 50, y: 695, w: 320, h: 24 };
export const SECRET = "SECRET-Yamada-Taro-090-1234-5678";

const doc = await PDFDocument.create();
doc.setTitle("Kokai Shiryo 2026");
doc.setAuthor("Naibu-Tantosha-Suzuki");           // 元資料也藏著人名
doc.setSubject("original path: D:/naibu/kojin-joho-list.xlsx");
doc.setKeywords(["naibu", "kojin-joho"]);

const page = doc.addPage([PAGE_W, PAGE_H]);
const font = await doc.embedFont(StandardFonts.Helvetica);

page.drawText("PUBLIC: Annual Report 2026", {
  x: 50, y: 760, size: 16, font, color: rgb(0, 0, 0),
});

// 敏感文字：正常畫上去
page.drawText(SECRET, {
  x: 55, y: 700, size: 13, font, color: rgb(0, 0, 0),
});

// 然後用黑色矩形「蓋住」—— 錯誤做法
page.drawRectangle({
  x: BOX.x, y: BOX.y, width: BOX.w, height: BOX.h, color: rgb(0, 0, 0),
});

page.drawText("Contact: koho@example.lg.jp", {
  x: 50, y: 650, size: 12, font, color: rgb(0, 0, 0),
});

writeFileSync("bad-redaction.pdf", await doc.save());
console.log("[1] 生成 bad-redaction.pdf");
console.log("    黑框(pdf-lib座標):", JSON.stringify(BOX));
console.log("    被蓋住的文字:", SECRET);
