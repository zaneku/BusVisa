# BusVisa 服务端邀请码版

基于本地 v0.3.2 新官网完整部署包。应用文件放在 private，Netlify 仅发布 public，受限页面、应用脚本、本地政策数据和同源代理经 gateway 验证会话后返回。

## 部署

1. 创建 Upstash Redis 数据库，取得 REST URL 和可写 REST token。
2. 在 Netlify 站点环境变量中设置 UPSTASH_REDIS_REST_URL、UPSTASH_REDIS_REST_TOKEN、INVITE_HASH_SECRET。作用域须包括 Functions。INVITE_HASH_SECRET 使用至少 32 字符的随机值，可用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成。
3. 将本目录的内容作为 Git 仓库项目根目录部署。Netlify 使用 netlify.toml，发布目录为 public，函数目录为 netlify/functions。需要设置基础目录时将其指向本目录。
4. 通过 Netlify Git 构建或 Netlify CLI 构建部署，确保 gateway 函数被构建上传。
5. 在本机复制 .env.example 为 .env，填写同一组环境变量。在本目录运行 `npm run invite -- create 1 14`，生成有效 14 天、允许 1 次激活的邀请码。将输出的 code 私下发送给受邀用户，将 id 留作管理。
6. 使用 `npm run invite -- status <id>` 查看使用次数，使用 `npm run invite -- disable <id>` 停用邀请码及关联会话。

凭据仅放在 Netlify 环境变量和被忽略的本机 .env。每个浏览器会话激活消耗一次名额，登录会话最长 7 天，且受邀请码到期和停用约束。清除 Cookie、更换浏览器或会话到期后，需要仍有剩余次数的邀请码重新激活。

## 验收

- 未登录访问 / 显示四语言邀请码页。旧 localStorage 标记不能进入应用。
- 未登录访问 /app.js、/data/china-rules.json 和 /policy-api/index.json 返回 401。
- 旧邀请码无记录时验证失败。新码成功后获得 HttpOnly、Secure、SameSite=Strict Cookie。
- 单次码在另一浏览器再次使用失败。邀请码到期或被停用后，已有会话访问受限资源也失败。
- 同一来源 IP 在 15 分钟内最多提交 10 次验证请求，超过后返回 429。
- 在 Netlify 部署预览中确认地图、签证管理、四语言、主题、政策同步和汇率正常，再发布正式站点。

## 已有用户迁移

此版移除离线资源缓存，/sw.js 提供退役服务工作线程，清理旧 BusVisa Cache Storage 并注销旧工作线程。邀请码页也执行清理。用户曾经下载的文件和浏览器已有副本仍由其持有，迁移无法收回。

已通过 12 项本地函数回归检查、前端脚本语法检查、Lua 脚本执行检查（模拟 Redis）、Netlify 官方函数打包及打包后邀请码页读取检查。Lua 检查包含 100 次争抢 3 个名额，成功数为 3。真实 Upstash 连通、Netlify CDN 路由、旧服务工作线程迁移和手机浏览器测试需要部署预览验收。

函数打包和环境变量作用域依据 Netlify 官方文档配置。[函数配置](https://docs.netlify.com/build/functions/configuration/) [函数 API](https://docs.netlify.com/build/functions/api/)
