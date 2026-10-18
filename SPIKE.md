# Day 1 技术 Spike 结论 — PDF 真·墨消し

日期：2026-08-26 / 环境：Node v24.15.0, mupdf 1.28.0 (WASM), Windows 11
验证脚本：`spike/01`〜`spike/06`，全部可重跑。

## 结论：技术前提成立，可以进入实现阶段

原计划的退路（页面栅格化）**不需要启用**。mupdf-wasm 的 redaction 能力在 JS 绑定里完整可用。

---

## 1. API 可用性 — PASS

`mupdf/dist/mupdf.d.ts` 完整暴露：

- `PDFPage.applyRedactions(black_boxes, image_method, line_art_method, text_method)`
- `PDFPage.createAnnotation("Redact")` + `annot.setRect(rect)`
- 常量：`REDACT_TEXT_REMOVE` / `REDACT_IMAGE_REMOVE` / `REDACT_LINE_ART_REMOVE_IF_COVERED`

## 2. Latin 文字 — PASS（`02-redact.mjs`）

处理前文本提取能读出 `SECRET-Yamada-Taro-090-1234-5678`（事故复现），处理后读不到。

## 3. 日语 CID / Identity-H — PASS（`03-jp-cid.mjs`）

日语 PDF 走的是 CID 字体路径，单独验证过：

```
処理前: 令和8年度 公開資料 / 氏名：山田太郎 電話：090-1234-5678
処理後: 令和8年度 公開資料
```

敏感行被删除，公开行完整保留（未过度删除）。

## 4. ★ 最重要发现：保存参数不对，墨消等于白做

**这一条推翻了中途一次假阳性的结论，是本次 spike 最有价值的产出。**

即使 `applyRedactions` 正确执行，保存时不做垃圾回收，**旧的 content stream 会作为孤儿对象完整留在文件里**：

| saveToBuffer 参数 | 原文残留 |
|---|---|
| `incremental` | **YES ← 危险** |
| （无参数） | **YES ← 危险** |
| `compress` | **YES ← 危险** |
| `compress,garbage=compact` | no |
| `compress,garbage=deduplicate` | no |

`06-confirm-orphan.mjs` 确认了残留物的性质：

```
redacted-nogc.pdf (save: "compress")
  ページが参照する Contents : obj 14   ← 新内容，干净
  SECRET を含むオブジェクト : [10]     ← 旧内容，完整残留
  → うちページ非参照(孤児)  : [10]     ← 原本が残存
  テキスト抽出の見え方      : 安全に見える  ← 常规检查发现不了
```

**页面显示正常、文本提取显示"安全"，但原始个人信息完整躺在文件里。** 这是最隐蔽的事故形态。

### 两个直接后果

1. **实现硬性规范**：保存必须用 `compress,garbage=deduplicate`。写进代码审查清单，不允许出现裸 `saveToBuffer()`。
2. **`/check` 诊断工具新增检测项 —— 孤儿对象扫描。**
   文本提取式的检查完全查不出这种残留。已实证的只有 mupdf 与 PyMuPDF 不带 gc 保存的情况；
   Acrobat 等其他工具是否会产生同样的残留**未验证**，对外不要暗示其他工具不安全。

## 5. 元数据清除 — PASS（`04-residue.mjs` B 部分）

`setMetaData(key, "")` + 带 gc 的保存，Title / Author / Subject / Keywords / Creator / Producer 全部清空，原始字节层面也搜不到（如内嵌的 `D:/naibu/kojin-joho-list.xlsx` 这类原文件路径）。

---

## 踩过的坑（实现时会再遇到，记下来）

1. **`PDFDocument` 没有 `loadObject()`**。遍历对象要用 `doc.newIndirect(i)`。
2. **`isStream()` / `readStream()` 必须对间接引用调用**，对 `resolve()` 后的字典调用永远返回 `false`。这个坑让一次残留检测全程静默失效。
3. **spike 代码里不要写 `catch {}`**。上面两个 bug 都是被空 catch 吞掉的，导致测试"全部通过"其实是全部跳过。
4. **对照实验是必须的**。检测类逻辑写完先拿未处理样本验证有检出力，否则"没检测到"和"检测不出来"分不清 —— 04 就是这么得出假阳性结论的。
5. `addCJKFont()` 用 Adobe-Japan1 ordering，CID ≠ TTF glyph id；造测试夹具要用 `addFont()`（Identity 映射）。
6. Windows 的日文字体都是 `.ttc`，pdf-lib 无法直接嵌入；mupdf 的 `new Font(name, data, subfont)` 可以。

## 遗留待验（不阻塞开发）

- **字体子集残留**：被删文字独有的字形仍留在嵌入字体里，会暴露"用过哪些字"。需要 redaction 后重做子集化。
- 真实世界 PDF 样本（Acrobat / Word / 扫描仪产出）尚未测试，目前夹具都是合成的。
- 扫描件（图像型 PDF）路径未验证，需配合 OCR 判断，属后续范围。

## 下一步

Week 1：`/check` 诊断工具。检测项已确定三个：
1. 黑框下方文字层残留（文本提取 × 覆盖矩形几何判定）
2. **孤儿对象残留**（本次 spike 新增）
3. 元数据 / 内嵌文件残留
