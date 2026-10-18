import type { Metadata } from "next";
import { ADDRESS_CONFIGURED, OPERATOR, OPERATOR_CONFIGURED } from "@/lib/site.ts";
import { LegalPage, H2, P, UL } from "@/components/legal.tsx";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description:
    "当サイトが取得する情報と取り扱いについて。PDFファイルはブラウザ内でのみ処理され、サーバーに送信も保存もされません。",
};

export default function Privacy() {
  return (
    <LegalPage title="プライバシーポリシー" updated="2026年8月26日">
      {!OPERATOR_CONFIGURED && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft p-5">
          <p className="font-bold text-danger">公開前の設定が未完了です</p>
          <p className="prose-width mt-1.5 text-sm leading-relaxed text-ink">
            事業者情報が未設定です。<code className="font-mono">.env.example</code> を参照して
            <code className="font-mono">NEXT_PUBLIC_OPERATOR_*</code> を設定してください。
            この状態のまま公開してはいけません。
          </p>
        </div>
      )}

      <div className="rounded-lg border border-primary/25 bg-primary-soft p-5">
        <p className="font-bold text-ink">
          お客様がアップロードした PDF ファイルは、サーバーに送信されません。
        </p>
        <P className="mt-2">
          当サイトのツールは、ファイルの解析・墨消し処理のすべてをお客様のブラウザ内
          （WebAssembly）で実行します。ファイルの内容、ファイル名、処理結果のいずれも
          当方のサーバーに送信されず、保存もされません。処理はブラウザのタブを閉じた時点で
          痕跡なく終了します。
        </P>
        <P className="mt-2">
          この動作はブラウザの開発者ツールのネットワークタブでご確認いただけます。
        </P>
      </div>

      <H2>1. 取得する情報</H2>
      <P>当サイトが取得する情報は以下に限られます。</P>
      <UL
        items={[
          "アクセス解析による統計情報（閲覧ページ、参照元、おおまかな地域、ブラウザ種別）。個人を特定できる形では取得しません。",
          "お問い合わせフォームにご入力いただいた内容（組織名、お名前、メールアドレス、ご相談内容）。",
        ]}
      />
      <P>
        アップロードされた PDF ファイルおよびその内容は、上記のいずれにも含まれません。
      </P>

      <H2>2. 利用目的</H2>
      <UL
        items={[
          "統計情報：サービスの改善、および利用状況の把握のため。",
          "お問い合わせ内容：ご返信、お見積りの作成、および導入のご相談に対応するため。",
        ]}
      />

      <H2>3. 第三者提供</H2>
      <P>
        法令に基づく場合を除き、取得した情報を第三者に提供することはありません。
      </P>

      <H2>4. アクセス解析</H2>
      <P>
        当サイトはアクセス解析にプライバシー配慮型の解析ツールを使用します。Cookie による
        個人追跡は行わず、広告目的でのデータ利用もありません。
      </P>

      <H2>5. Cookie</H2>
      <P>
        当サイトは、追跡目的の Cookie を使用しません。ツールの動作に必要な範囲で
        ブラウザのローカル保存領域を使用する場合がありますが、その内容が外部に送信されることは
        ありません。
      </P>

      <H2>6. 情報の安全管理</H2>
      <P>
        お問い合わせによりお預かりした情報は、対応の完了後、必要な保存期間を経過した時点で
        削除します。ファイルそのものをお預かりしない設計であるため、ファイル内容に関する
        漏えいリスクは構造的に発生しません。
      </P>

      <H2>7. 開示・訂正・削除のご請求</H2>
      <P>
        お問い合わせによりお預かりした情報について、開示、訂正、削除をご希望の場合は、
        下記の連絡先までご連絡ください。ご本人であることを確認のうえ、速やかに対応します。
      </P>

      <H2>8. 改定</H2>
      <P>
        本ポリシーの内容を変更する場合は、当ページに変更後の内容と改定日を掲示します。
      </P>

      <H2>9. 連絡先</H2>
      <dl className="mt-3 divide-y divide-line overflow-hidden rounded-md border border-line">
        <Row label="運営者" value={OPERATOR.name} />
        {ADDRESS_CONFIGURED && <Row label="所在地" value={OPERATOR.address} />}
        <Row label="連絡先" value={OPERATOR.email} />
      </dl>
    </LegalPage>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 bg-surface px-4 py-3 text-sm">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="break-anywhere text-ink">{value}</dd>
    </div>
  );
}
