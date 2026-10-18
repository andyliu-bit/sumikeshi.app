import type { Metadata } from "next";
import Link from "@/lib/link.tsx";

export const metadata: Metadata = {
  title: "PDF公開前の自己点検手順 — 黒塗りが効いているか確認する方法",
  description:
    "PDF を公開・提出する前に黒塗りが本当に効いているかを確認する手順。コピペテスト、全文検索テスト、それでも見つからない残留のチェック方法と、正しい墨消しのやり方。",
};

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        PDF公開前の自己点検手順
      </h1>
      <p className="mt-5 text-base leading-relaxed text-muted">
        公開・提出の前に、黒塗りが本当に効いているかを確認します。
        1 と 2 は道具なしでできます。3 は 1・2 では見つからない残留を対象にします。
      </p>

      <Step
        n={1}
        title="コピペテスト"
        time="30秒"
        body={
          <>
            <p>
              PDF を開き、黒塗り部分を含む範囲をドラッグして選択し、コピーします。
              メモ帳など書式のないエディタに貼り付けてください。
            </p>
            <Verdict
              ng="隠したはずの文字が出てきたら、その PDF は公開できません。"
              ok="何も出てこなければ、この項目は通過です。"
            />
            <p className="text-muted">
              黒塗り部分だけを正確に選択するのは難しいので、そのページ全体を選択（Ctrl+A）して
              貼り付ける方が確実です。
            </p>
          </>
        }
      />

      <Step
        n={2}
        title="全文検索テスト"
        time="30秒"
        body={
          <>
            <p>
              PDF ビューアの検索機能（Ctrl+F）で、隠したはずの氏名や番号を検索します。
            </p>
            <Verdict
              ng="ヒットしたら、文字データが残っています。画面に見えていなくても検索には掛かります。"
              ok="ヒットしなければ、この項目は通過です。"
            />
            <p className="text-muted">
              検索対象の語をそもそも知らない立場の人が確認する場合、この方法は使えません。
              その場合は 1 と 3 で確認してください。
            </p>
          </>
        }
      />

      <Step
        n={3}
        title="残留データの確認"
        time="1分"
        body={
          <>
            <p>
              1 と 2 を通過しても安全とは限りません。削除前の原本は通常の操作では見つかりません。メタデータは［文書のプロパティ］で確認できますが、見落とされがちです。
            </p>
            <div className="my-4 space-y-3">
              <div className="rounded-lg bg-warning-soft px-4 py-3 border border-warning/30">
                <p className="text-sm font-bold text-ink">削除前の原本がファイル内に残る</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  墨消しツールで正しく処理しても、保存の方法によっては処理前の内容が
                  ファイル内に丸ごと残ります。どのページからも参照されない状態で残るため、
                  表示にもテキスト抽出にも現れず、コピペテストも全文検索テストも通過してしまいます。
                  上書き保存（増分保存）で以前の版がファイル内に残る場合も同じです。
                </p>
              </div>
              <div className="rounded-lg bg-warning-soft px-4 py-3 border border-warning/30">
                <p className="text-sm font-bold text-ink">メタデータに情報が残る</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  本文とは別に、作成者名、元のファイル名、元ファイルの保存パスなどが
                  記録されていることがあります。本文をいくら墨消ししても、こちらは消えません。
                </p>
              </div>
            </div>
            <p>
              この 2 つを含めて確認するには、
              <Link href="/" className="font-medium text-ink underline underline-offset-2">
                墨消しチェッカー
              </Link>
              が使えます。ファイルはブラウザ内だけで処理され、サーバーには送信されません。
            </p>
          </>
        }
      />

      <section className="mt-14">
        <h2 className="text-xl font-bold text-ink">正しい隠し方</h2>
        <p className="mt-3 text-base leading-relaxed text-muted">
          確実な順に並べます。
        </p>

        <ol className="mt-5 space-y-4">
          <Method
            n="A"
            title="公開してよい情報だけで作り直す"
            body="元データに黒を塗るのではなく、氏名や連絡先の列を削除した別ファイルとして作成し直します。隠す対象が最初から存在しないため、最も確実です。"
          />
          <Method
            n="B"
            title="墨消し（Redaction）機能を使う"
            body="黒い四角を重ねるのではなく、下にある文字データごと削除する機能です。Adobe Acrobat の「墨消し」や、当サイトの墨消しツールがこれにあたります。処理後は必ず再確認してください。"
          />
          <Method
            n="C"
            title="印刷してスキャンし直す"
            body="文字データは失われるため確実ですが、ファイルが大きくなり、検索性とアクセシビリティが失われます。またスキャン前のファイルを誤って送ってしまう事故も報告されています。"
          />
        </ol>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-bold text-ink">よくある誤解</h2>
        <dl className="mt-5 space-y-5">
          <Myth
            q="黒い四角で完全に覆えば見えないのでは？"
            a="見えないのは画面上だけです。文字データは図形の下に残っており、コピーや検索で取り出せます。"
          />
          <Myth
            q="ハイライトや塗りつぶしの注釈を使えば？"
            a="注釈も図形の一種です。注釈を削除すれば下の文字が現れます。"
          />
          <Myth
            q="スクリーンショットを撮って PDF にすれば安全では？"
            a="文字データは消えるため、その点では安全です。ただし画像内の文字は OCR で読み取れる場合があります。解像度が高いほど読み取りやすくなります。"
          />
          <Myth
            q="一度墨消しツールを通したから大丈夫では？"
            a="保存の方法によっては処理前の内容がファイル内に残ります。処理したことと、消えたことは別です。処理後の確認まで含めて手順にしてください。"
          />
        </dl>
      </section>

      <div className="mt-14 rounded-lg bg-ink p-6 text-white">
        <h2 className="text-lg font-bold">手元のファイルで試す</h2>
        <p className="mt-2 text-base leading-relaxed text-white/75">
          3 項目を自動で確認します。問題が見つかった場合は、そのまま墨消しまで行えます。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-md bg-bg px-5 py-2.5 text-sm font-bold text-ink hover:bg-surface"
          >
            PDF を診断する
          </Link>
          <Link
            href="/cases"
            className="rounded-md px-5 py-2.5 text-sm font-medium text-white/75 border border-white/25 hover:bg-white/10"
          >
            実際の漏えい事例を見る
          </Link>
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  time,
  body,
}: {
  n: number;
  title: string;
  time: string;
  body: React.ReactNode;
}) {
  return (
    <section className="mt-10 rounded-lg bg-bg p-6 border border-line">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
          {n}
        </span>
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <span className="ml-auto text-xs text-muted">所要 {time}</span>
      </div>
      <div className="mt-4 space-y-3 text-base leading-relaxed text-muted">{body}</div>
    </section>
  );
}

function Verdict({ ng, ok }: { ng: string; ok: string }) {
  return (
    <div className="my-4 space-y-2">
      <p className="rounded-md bg-danger-soft px-3.5 py-2.5 text-sm text-danger border border-danger/25">
        <strong className="font-bold">出た場合</strong>　{ng}
      </p>
      <p className="rounded-md bg-primary-soft px-3.5 py-2.5 text-sm text-primary border border-primary/25">
        <strong className="font-bold">出ない場合</strong>　{ok}
      </p>
    </div>
  );
}

function Method({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="flex gap-4 rounded-lg bg-bg p-5 border border-line">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-surface-2 text-sm font-bold text-ink">
        {n}
      </span>
      <div>
        <h3 className="font-bold text-ink">{title}</h3>
        <p className="mt-1.5 text-base leading-relaxed text-muted">{body}</p>
      </div>
    </li>
  );
}

function Myth({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <dt className="font-bold text-ink">Q. {q}</dt>
      <dd className="mt-1.5 text-base leading-relaxed text-muted">{a}</dd>
    </div>
  );
}
