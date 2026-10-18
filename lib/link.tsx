import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * プリフェッチを既定で無効にした Link。
 *
 * `output: "export"` では、Next のプリフェッチが要求する RSC ペイロードのパスと
 * 実際に書き出されるパスが食い違う:
 *
 *   要求: /cases/__next.cases.__PAGE__.txt   （ドット区切り）
 *   実体: /cases/__next.cases/__PAGE__.txt   （ディレクトリ）
 *
 * 静的ホスティングはこの対応付けをしないため、リンクが視界に入るたび 404 が並ぶ。
 * 遷移自体は成功するので実害は無いが、コンソールに 404 が出続けるのは
 * 開発者層に見られる前提の product では避けたい。
 *
 * 全ページ事前生成済みで通常遷移でも十分速いため、プリフェッチは切ってよい。
 * 個別に有効化したい場合は呼び出し側で prefetch を渡せば上書きできる。
 */
export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />;
}
