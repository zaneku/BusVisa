BusVisa v0.3.2 服务端邀请码版

当前部署入口为仓库中的 server-beta 目录。

Netlify 构建配置
Branch to deploy = main
Base directory = server-beta
Build command = 留空
Publish directory = public
Functions directory = netlify/functions

使用 Netlify Git 构建或支持函数打包的 CLI 部署流程。
环境变量须在目标部署上下文中配置，作用域包含 Functions。

UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
INVITE_HASH_SECRET

本机生成邀请码时，从 server-beta/.env 读取同一组配置。
真实凭据和邀请码应保密，网页手动上传时须检查所选文件。

完整操作步骤见上级目录的 DEPLOY.md 和仓库根目录的 README.md。
版本历史见仓库根目录的 CHANGELOG.md。
