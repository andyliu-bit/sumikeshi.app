"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearLicense,
  loadStoredLicense,
  storeLicense,
  verifyLicense,
  type License,
} from "./license.ts";

export function useLicense() {
  const [license, setLicense] = useState<License | null>(null);
  // 起動直後は判定が付いていない。ここで「未購入」と描いてしまうと
  // 購入済みの利用者に一瞬だけ購入案内が出るので、読み込み中を区別する
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = loadStoredLicense();
    if (!raw) {
      setLoading(false);
      return;
    }
    verifyLicense(raw)
      .then((l) => {
        // 保存済みでも検証に失敗したら消す（鍵の入れ替え等）
        if (!l) clearLicense();
        setLicense(l);
      })
      .finally(() => setLoading(false));
  }, []);

  const activate = useCallback(async (raw: string) => {
    const l = await verifyLicense(raw);
    if (!l) return false;
    storeLicense(raw);
    setLicense(l);
    return true;
  }, []);

  const deactivate = useCallback(() => {
    clearLicense();
    setLicense(null);
  }, []);

  return { license, loading, activate, deactivate };
}
