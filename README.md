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

生产和本地环境都必须按顺序应用以下版本化迁移（不要在 SQL Editor 中只手工修补而不保留迁移记录）：

1. `supabase/migrations/202608190001_initial_schema.sql`
2. `supabase/migrations/202608190002_schedule_functions.sql`
3. `supabase/migrations/202608190003_auth_and_spaces.sql`
4. `supabase/migrations/202608190004_space_scoped_characters.sql`
5. `supabase/migrations/202608190005_extensions_schema_compatibility.sql`
6. `supabase/migrations/202608190006_platform_admin_and_active_space.sql`
7. `supabase/migrations/202608190007_activity_transactions.sql`
8. `supabase/migrations/202608190008_schedule_workbench_functions.sql`
9. `supabase/migrations/202608190009_registration_schedule_integrity.sql`
10. `supabase/migrations/202608190010_schedule_security_and_terminal_guards.sql`
11. `supabase/migrations/202608190011_roster_schedule_integrity.sql`
12. （仅本地演示数据需要时）`supabase/seed.sql`

使用 Supabase CLI 时，可在已链接的项目中执行 `supabase db push`；本地重置可执行 `supabase start` 后执行 `supabase db reset`。执行前先核对目标项目，生产数据库必须先备份，再由具备变更授权的人运行迁移。

### 首个平台注册管理员「蓝」

`蓝`不是前端密码或昵称声明。先通过站点正常注册昵称为「蓝」的账号，再应用迁移 006；该迁移只会在已存在且昵称匹配的 profile 上初始化平台管理员权限。若迁移已经应用但「蓝」尚未注册，请由数据库管理员按迁移中的受控初始化逻辑处理，不要把 service-role key、数据库密码或管理员标志暴露到浏览器、脚本参数或仓库。

本工具的界面只收集“昵称 + 密码”。Supabase 仍使用 Password 登录提供商，因此请在 Authentication 的 Email 设置中关闭 **Confirm email**；否则新成员注册后无法直接登录。站点 URL 和 Redirect URL 应包含 Vercel 的部署域名。

## Vercel

当前已创建 Vercel 项目 `dnf-raid-scheduler`，并验证 preview 构建 READY。生产、Preview 和 Development 环境均按实际需要在 Vercel 项目设置中添加：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

还需要在 Supabase Authentication 中关闭 **Confirm email**，并将生产域名和需要使用的 Preview 域名加入 Site URL / Redirect URLs；确认应用使用的表已在 Realtime publication 中启用。部署后先访问 `/api/health`，再使用非生产测试账号走完下方的人工冒烟清单。

推荐的长期流程是：在 Vercel 项目中打开 **Settings → Git → Connect Git Repository**，选择 `whitebluepants/dnf_raid_schedule`，并将 Production Branch 设为 `master`。之后推送默认分支会自动生成生产部署，Pull Request 会生成 preview。

如果暂时不使用 GitHub，也可以通过 Vercel CLI 或当前 Codex Vercel 连接直接部署源码；这种方式适合预览，不如 Git 集成便于后续维护。

## 验证

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

### 浏览器端到端测试

端到端测试**默认跳过**：必须显式提供 `E2E_BASE_URL`，它不会猜测、启动或写入任何 Supabase/Vercel 环境。它只通过浏览器界面创建隔离的测试用户和空间，不使用 service-role key、预置用户、固定 UUID 或直接 Supabase 写入。

```bash
# 先在本机运行已迁移的应用；E2E_RUN_ID 是每次运行唯一的非机密标识
E2E_BASE_URL=http://127.0.0.1:3000 E2E_RUN_ID=local-20260819 npm run test:e2e
```

覆盖流程为：昵称/密码登录 → 创建并确认当前空间 → 新增账号和角色 → 创建活动 → 角色报名 → 自动生成初稿 → 保存草稿 → 发布排表。排表用例为保证一波困难的 3 奶 + 9 C 完整性，会经界面创建 12 个互不相同账号下的角色；请只对可丢弃的本地或专用 E2E 项目运行，**不要将生产 URL 填入 `E2E_BASE_URL`**。

### 发布前人工清单与恢复边界

1. 对目标 Supabase 项目做备份，按 001–011 顺序应用迁移，并确认「蓝」已通过正常注册取得平台管理员初始化资格。
2. 在 Vercel 配置 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`（均按 Production / Preview / Development 实际环境设置）；不得配置或暴露 `SUPABASE_SERVICE_ROLE_KEY` 给浏览器。
3. 配置 Supabase Auth 的 Site URL、Redirect URLs、Password 登录和 Realtime，再部署并检查 `/api/health`。
4. 使用两个非生产账号人工验证：登录、创建/选择空间、角色维护、管理员创建多波活动、成员报名、生成初稿、点击候补与槽位手动调整、保存、发布，以及另一成员刷新后看到发布结果。
5. 发布异常时先回滚到 Vercel 的上一个已验证部署；数据库迁移不可简单倒退，按受控的新迁移或从已验证备份恢复，并记录对应的部署与迁移版本。

生产冒烟测试只能由获授权人员执行，前置条件是：已确认目标 Vercel 部署 URL 和 Supabase 项目、001–011 已在该目标完整应用、已提供两个可使用的非生产测试账号，以及获准在该环境创建和清理 E2E 数据。当前仓库不携带这些授权或凭据，不能把本地 E2E 结果当作生产冒烟结果。

Next.js 当前仍会提示 middleware 迁移到 proxy 的 deprecation warning；不影响构建和部署，后续可单独升级处理。
