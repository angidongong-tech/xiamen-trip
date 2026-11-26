# 厦门纪行 V3.0 · Supabase 手机配置

用 iPhone 就可以完成。若 Safari 看不到完整菜单，可在页面菜单里点「请求桌面网站」。先在测试房间使用示例账单验收，再导入真实数据。

## 1. 安装数据库

1. 在 GitHub 打开 [supabase/setup.sql](../supabase/setup.sql)，点 **Raw**，选择并复制文件的**全部内容**。也可以用文件工具栏中的 **Copy raw file**。
2. 打开 [Supabase 项目 Dashboard](https://supabase.com/dashboard/project/sfscywmjxhlzvryfvhyr)，核对项目 ID 为 `sfscywmjxhlzvryfvhyr`。
3. 进入 **SQL Editor → New query**，粘贴全文，点 **Run**。最后一行应返回 `{"schema":3,"enabled":false}`。整份 SQL 可重复执行，保留已有记录和开关状态。
4. 在 **Integrations → Data API** 确认 Data API 已启用，`public` 在 **Exposed schemas** 中。部分界面会把 Data API 放在项目设置。SQL 已明确启用 RLS 并设置授权，原有安全默认选项可以保留。

## 2. 设置邮箱登录

1. 进入 **Authentication → Providers → Email**，确认邮箱登录、注册及 **Confirm email** 已启用。
2. 在 **Authentication → URL Configuration** 把 **Site URL** 设为 `https://angidongong-tech.github.io/xiamen-trip/`。
3. 在同一页的 **Redirect URLs** 添加下面两个地址，保存。

   - `https://angidongong-tech.github.io/xiamen-trip/`
   - `https://angidongong-tech.github.io/xiamen-trip/?auth=return`

4. 如果同行者要自行注册及找回密码，请在 **Authentication → SMTP Settings** 配置自定义 SMTP。Supabase 默认邮件服务限项目团队邮箱，且发送频率较低。[Supabase 邮箱服务说明](https://supabase.com/docs/guides/auth/auth-smtp)

**少量测试账号的替代办法。** 在 **Authentication → Users → Add user → Create new user** 填写你控制的测试邮箱及强密码。确认邮箱确由测试者控制后，可给这条测试账号选择 **Auto confirm user**。其他账号继续走邮件验证。同行者使用网页里的账号即可，管理员凭据只在 Dashboard 中使用。

## 3. 核对 Realtime 和权限

- 打开 **Database → Publications → supabase_realtime**，确认有 `xm_signals`、`xm_members`。安装 SQL 已加入这两张表。它们只推送房间修订号和订阅者自己的成员状态。
- 在 **Table Editor** 检查 `xm_*` 业务表的 RLS 已启用。安装 SQL 自带权限和发布表检查，有任一项不合格即回滚。
- 如果需要重新检查开关，可在 SQL Editor 运行 `select public.xm_capabilities();`。此时云功能默认关闭，本机攻略仍可使用。
- [PostgreSQL 权限测试](../supabase/tests/permissions.sql) 供维护者在隔离数据库复测。手机部署只复制 `supabase/setup.sql`，再按下面步骤操作开关。

## 4. 开启并验收

1. 合并 V3 Pull Request，在 GitHub 的 **Actions → pages build and deployment** 等待成功。网址保持不变。
2. 前面的检查全部通过后，到 SQL Editor 单独执行 **setup.sql 最后一段注释里的这一行**。

   ```sql
   update xm_private.launch set enabled=true where singleton;
   ```

3. 联网打开 [厦门纪行](https://angidongong-tech.github.io/xiamen-trip/)。如仍显示旧版，关闭本站 Safari 标签页和主屏幕窗口后重新打开，保留 Safari 网站数据。进入 **我的 → 共享旅行空间**，需要时点「重新检查」。
4. A 登录并建测试房间，生成单次邀请。B 用另一个浏览器会话或手机打开邀请，登录后确认加入。C 不用邀请登录，应看不到房间。把 B 调成仅查看，确认无法更改账单，再恢复可编辑。用过、撤销或到期的邀请应失效。
5. A、B 各记一笔示例账单，核对两笔都保留。用飞行模式试记一笔，恢复网络后等「待确认」归零。弱网时会显示「定期检查」，也可点「立即同步」。试一次打卡和行程交换，在另一台手机核对。
6. 验收后创建正式房间并导入实际记录。若需要暂停共享，可把开关语句的 `enabled=true` 改为 `enabled=false` 执行。业务数据与本机队列会保留。

## 5. 从录入过账单的手机导入

1. 用原来的 Safari 或主屏幕应用进入 **我的 → 导出与导入**，将原版 JSON 备份保存到 iPhone「文件」。
2. 进入正式房间，查看「从本机导入」的账单笔数、总额与分享范围。住宿、地址、车次以及私人旅行和摄影备注有独立勾选项，初始未选。账单备注、付款人和自定义条目随对应记录分享，确认前请核对。
3. 点「确认导入此房间」。以结果卡的原始、新增、已有笔数和分币金额为准。同 ID 的相同记录可安全重试。相异或疑似重复的条目会列出，房间中的现有版本保留。
4. 其他成员首次进入只会读取房间数据。如果他们也要导入手机里的旧数据，可各自备份并确认合并预览。同步失败时，原始本机记录与待同步队列会保留。

已缓存房间可以在弱网时编辑。离线期间无法即时得知远端权限变化，恢复网络后会重新核验。切回本机时能继续查看原攻略和账本。请保管好下载的备份。
