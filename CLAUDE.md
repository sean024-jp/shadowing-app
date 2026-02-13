# Shadowing App

YouTube動画を使った英語シャドーイング練習アプリ。

## Tech Stack

- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind CSS 4
- **Backend**: Supabase (Auth, Database, Storage)
- **Deploy**: Vercel
- **Language**: TypeScript

## Project Structure

```
src/
  app/           # Next.js App Router pages & API routes
  components/    # React components
  hooks/         # Custom hooks
  lib/           # Supabase client, utilities
  types/         # TypeScript type definitions
scripts/         # Supabase helper scripts (SQL execution, migration runner)
supabase/
  migrations/    # SQL migration files (numbered, run in order)
```

## Database Schema

5テーブル + 1ストレージバケット。詳細は `supabase/migrations/001_initial_schema.sql` を参照。

| テーブル | 概要 |
|---------|------|
| `materials` | 承認済み教材 |
| `material_requests` | ユーザーからの教材リクエスト |
| `user_favorites` | お気に入り (user ↔ material) |
| `practice_history` | 練習履歴 |
| `practice_recordings` | 録音データのメタ情報 |
| Storage: `practice-recordings` | 録音ファイル (WebM) |

## Supabase操作 (Claude Code / スマホから)

### 必要な環境変数

以下をローカルの `.env` または Claude Code のセッション環境変数として設定:

```bash
export SUPABASE_PROJECT_ID="your-project-ref-id"    # Supabase Dashboard → Settings → General
export SUPABASE_ACCESS_TOKEN="sbp_xxxxxxxxxxxx"      # https://supabase.com/dashboard/account/tokens
```

### SQL実行

```bash
# 単一クエリ
./scripts/supabase-sql.sh "SELECT count(*) FROM materials;"

# ファイルから実行
./scripts/supabase-sql.sh < supabase/migrations/001_initial_schema.sql

# パイプで実行
echo "SELECT * FROM materials LIMIT 5;" | ./scripts/supabase-sql.sh
```

### マイグレーション実行

```bash
# 全マイグレーションを実行
./scripts/supabase-migrate.sh

# ドライラン (実行せず確認のみ)
./scripts/supabase-migrate.sh --dry-run
```

### 新しいマイグレーション追加

`supabase/migrations/` に連番のSQLファイルを追加:
```
supabase/migrations/002_add_column_example.sql
```

## Development

```bash
npm run dev    # 開発サーバー起動
npm run build  # プロダクションビルド
npm run lint   # ESLint実行
```

## Environment Variables (App)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
NEXT_PUBLIC_ADMIN_EMAIL=admin@example.com
```
