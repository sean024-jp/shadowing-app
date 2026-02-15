# Shadowing App - Claude Code Instructions

## Supabase MCP (重要)

このプロジェクトには `.mcp.json` でSupabase MCPが設定済み。SQL実行やDB操作はMCPツールを使うこと。

### 使い方
- MCP toolは `mcp__supabase__execute_sql` などの名前で自動的に利用可能
- Supabase CLIの `supabase db execute` は不要（CLIにはそのコマンドがない）
- 初回のみ `/mcp` コマンドでOAuth認証が必要（認証済みならそのまま使える）

### MCP toolが使えない場合
サブプロセスから実行する:
```bash
echo 'SQLクエリの指示' | claude -p --allowedTools 'mcp__supabase__execute_sql' --dangerously-skip-permissions
```

### プロジェクト情報
- Supabase project ref: qrbgtwkvwwdtmtdhfvsy
- Admin email: headachers024@gmail.com
