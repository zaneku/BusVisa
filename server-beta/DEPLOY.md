# BusVisa 服务端邀请码版部署

当前应用位于仓库的 `server-beta/`。Netlify 发布 `public/` 中的邀请码页、样式与图标，网关在返回受限应用资源时验证会话。

[项目首页](../README.md) · [版本历史](../CHANGELOG.md)

## Netlify 配置

在现有 Netlify 项目中关联 GitHub 仓库并配置生产分支。更新合入 main 后，查看 Netlify 的实际构建和发布结果。

| 项目 | 值 |
| --- | --- |
| Branch to deploy | `main` |
| Base directory | `server-beta` |
| Build command | 留空 |
| Publish directory | `public` |
| Functions directory | `netlify/functions` |

若界面自动显示 `server-beta/` 固定前缀，发布目录和函数目录分别在该前缀后填写 `public` 和 `netlify/functions`。使用 Netlify Git 构建或支持函数构建的 CLI 部署流程，确保 gateway 函数与所需资源一起打包。

## 环境变量

创建 Upstash Redis 数据库，取得 HTTPS REST URL 与可写 REST Token。在 Netlify 环境变量中配置以下三项，作用域包含 Functions，并为目标部署上下文提供值。

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `INVITE_HASH_SECRET`

`INVITE_HASH_SECRET` 使用至少 32 字符的随机值，可用以下命令生成。

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

输入框只填写值本身，去掉首尾引号和空白。更新变量后重新部署函数。

## 敏感文件处理

真实数据库 Token、随机密钥、邀请码及其导出文件应保密。本机凭据放在被忽略的 `.env` 中，Netlify 凭据放在对应环境变量中。

根目录 `.gitignore` 覆盖环境文件、常见私钥文件、本地部署状态、依赖、日志及按 `invite-codes*` 命名的 JSON、CSV 和文本导出文件。`.env.example` 仅放占位值。通过网页手动上传时须检查所选文件，Git 忽略规则也需要配合提交前的文件审查。

如果真实凭据已经公开，应撤销或轮换该凭据，并检查提交历史、评论及发布附件中的残留。历史清理的处理流程见 [GitHub 敏感数据移除说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)。

## 验收

- 未登录访问首页显示四语言邀请码页，旧本地解锁标记无法授权服务端请求。
- 未登录访问 `/app.js`、`/data/china-rules.json` 和 `/policy-api/index.json` 返回 401。
- 新码成功后获得 HttpOnly、Secure、SameSite=Strict Cookie。
- 单次码在另一浏览器激活失败，停用或到期后已有会话的后续受限资源请求被拒绝。
- 同一 IP 在 15 分钟内最多提交 10 次验证请求，超限后返回 429。
- 检查地图、签证管理、四语言、主题、政策同步和汇率功能。

在 `server-beta/` 中运行 `npm test` 可执行 12 项本地网关检查，数据库响应由测试模拟。另已进行前端语法检查、模拟 Redis 下的 Lua 计数检查、Netlify 函数打包及打包后页面读取检查。

本次上线已完成服务端登录验证，维护者已确认地图与站内功能正常。旧设备缓存迁移、会话到期和停用后的线上访问及不同移动浏览器仍需持续验证。

## 已有用户迁移

新版移除应用离线资源缓存。`/sw.js` 提供退役服务工作线程，清理旧 BusVisa 缓存并注销旧工作线程，邀请码页也执行清理。用户此前持有的下载文件和浏览器副本仍由其持有。

函数构建与配置依据 [Netlify 函数配置](https://docs.netlify.com/build/functions/configuration/) 和 [函数 API](https://docs.netlify.com/build/functions/api/)。
