# Supabase接続手順

## ユーザー側で行うこと

1. [Supabase Dashboard](https://supabase.com/dashboard)でアカウントを作成、またはログインする。
2. `New project`から新しいプロジェクトを作成する。
3. プロジェクト名は、たとえば`game-daily-manager`にする。
4. データベースパスワードを設定する。これはCodexへ送らない。
5. プロジェクト作成後、`Project Settings` → `API`を開く。
6. `Project URL`と`Publishable key`を控える。

## Codexへ渡してよい情報

次の2つだけを共有する。

- Project URL
- Publishable key（旧形式ではanon keyと表示される場合がある）

データベースパスワード、`service_role` key、秘密鍵は共有しない。

## プロジェクトへSQLを登録する

1. Supabaseの`SQL Editor`を開く。
2. プロジェクト内の`supabase/schema.sql`の内容を貼り付ける。
3. 実行する。

このSQLで、ゲーム、タスク、期間ごとの進捗、完了履歴のテーブルと、ユーザーごとのRLSを作成する。

## ローカル環境へ設定する

プロジェクト直下の`.env.example`を`.env.local`へコピーし、次の値を入れる。

```text
VITE_SUPABASE_URL=Project URL
VITE_SUPABASE_PUBLISHABLE_KEY=Publishable key
```

`.env.local`はGitへ登録しない。`.gitignore`で除外済み。
