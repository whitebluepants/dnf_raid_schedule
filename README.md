# DNF 米歇尔团本排表器

这是一个 Next.js + Supabase 的多人团本排表工具。当前版本包含：

- 普通、困难、审判难度配置
- 账号/角色资料、名望、强度档位、模拟伤害/奶量
- 活动报名与角色选择
- 确定性的半自动排表、候补和缺口提示
- 排表版本冲突保护、角色周次数保护
- Supabase RLS、事务 RPC、Realtime 更新

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local` 需要填写：

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase 项目的 anon public key>
```

数据库密码、service role key 只能放在服务端或 Vercel 环境变量中，不能提交到 Git。

## Supabase

在 Supabase SQL Editor 中按顺序执行：

1. `supabase/migrations/202608190001_initial_schema.sql`
2. `supabase/migrations/202608190002_schedule_functions.sql`
3. `supabase/seed.sql`

执行后，在 Authentication 设置邮箱登录和站点 URL。Redirect URL 应包含 Vercel 的部署域名。

## Vercel

当前已创建 Vercel 项目 `dnf-raid-scheduler`，并验证 preview 构建 READY。生产环境需要在 Vercel 项目设置中添加：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

推荐的长期流程是：把本仓库推到 GitHub，在 Vercel 项目中导入该 GitHub 仓库。之后推送默认分支会自动生成生产部署，Pull Request 会生成 preview。

如果暂时不使用 GitHub，也可以通过 Vercel CLI 或当前 Codex Vercel 连接直接部署源码；这种方式适合预览，不如 Git 集成便于后续维护。

## 验证

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

Next.js 当前仍会提示 middleware 迁移到 proxy 的 deprecation warning；不影响构建和部署，后续可单独升级处理。
