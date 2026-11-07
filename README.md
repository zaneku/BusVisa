# BusVisa — Global Visa Map

**v0.3.2 · 邀请制内测 · 作者 Ku**

BusVisa 是面向移动浏览器的全球签证地图。根据所选护照和已登记的签证类型，展示目的地入境方式、条件性便利和参考费用，支持简体中文、繁體中文（香港）、繁體中文（台灣）及 English。

当前网站采用 Netlify Functions 和 Upstash Redis 验证邀请码、管理会话。部署入口位于 `server-beta/`。

[访问网站](https://busvisa.netlify.app/) · [GitHub 仓库](https://github.com/zaneku/BusVisa) · [版本历史](CHANGELOG.md)

## 主要功能 / Features

- **地图与签证**。底部提供地图和签证两栏，根据护照及已登记签证展示目的地入境方式。
- **多语言搜索**。护照、签证签发国家及目的地支持中英文搜索。
- **签证记录**。按签发国家列出签证类型，支持手动录入。个人护照选择、签证记录和外观偏好保存在浏览器本地。
- **政策与费用**。支持在线政策同步、来源查看、落地签费用及当地币和人民币参考换算。
- **设置与外观**。在签证页底部的设置中切换语言及浅色、深色、跟随系统模式，并查看关于与使用说明。
- **移动端入口**。提供主屏幕图标和 Web App manifest，适配移动浏览器使用。

## 邀请制内测 / Private beta

邀请码由服务端验证。登录成功后，通过 `HttpOnly`、`Secure`、`SameSite=Strict` Cookie 保存会话，服务端在读取受限资源时检查会话及关联邀请码。

| 项目 | 当前规则 |
| --- | --- |
| 邀请码 | 可设置激活次数和有效期，支持查询及停用 |
| 登录会话 | 最长 7 天，同时受邀请码到期和停用状态约束 |
| 激活次数 | 每个新浏览器会话激活消耗一次名额 |
| 尝试限制 | 同一来源 IP 在 15 分钟内最多提交 10 次验证请求 |
| 访问检查 | 应用页面、应用脚本、本地政策数据和同源政策及汇率代理均经过会话检查 |

清除 Cookie、更换浏览器或会话到期后，需要仍有剩余次数的邀请码重新激活。停用邀请码后，关联会话的后续受限资源请求将被拒绝。

新版已移除应用离线资源缓存，并提供旧服务工作线程的清理与注销逻辑。旧浏览器登录标记由新版邀请码页清理，服务端使用会话验证访问资格。

## GitHub 与自动部署 / Deployment

在现有 Netlify 项目中关联 `zaneku/BusVisa`，生产分支设为 `main`。通过 PR 将更新合入 `main` 后，Netlify 按项目设置自动构建并部署。发布结果以 Netlify 的部署状态为准。

| 构建设置 | 值 |
| --- | --- |
| Branch to deploy | `main` |
| Base directory | `server-beta` |
| Build command | 留空 |
| Publish directory | `public` |
| Functions directory | `netlify/functions` |

发布目录和函数目录以 Base directory 为基础。若界面自动显示 `server-beta/` 前缀，在前缀后分别填写 `public` 和 `netlify/functions`。

`server-beta/netlify.toml` 配置了函数打包、受限资源路由及缓存响应头。需要通过 Netlify 的 Git 构建或支持函数构建的 CLI 流程部署。

### 环境变量

在 Netlify 中配置以下变量，作用域须包含 Functions，生产站点的值填写在 Production 上下文中。需要测试部署预览时，也为 Deploy Previews 配置相应值。

| 变量 | 用途 |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash 数据库的 HTTPS REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | 对应数据库的可写 REST Token |
| `INVITE_HASH_SECRET` | 至少 32 字符的随机密钥，用于邀请码、会话和限流键的摘要 |

变量值只填写值本身，去掉首尾引号和空白。更新 Netlify 环境变量后重新部署，使函数使用新配置。

### 敏感配置

数据库 Token、`INVITE_HASH_SECRET`、真实邀请码和本机 `.env` 应保密。数据库连接配置保存在 Netlify 环境变量和本机配置中。

根目录 `.gitignore` 已覆盖环境文件、常见私钥文件、依赖目录、Netlify 本地状态、日志和按 `invite-codes*` 命名的邀请码导出，并允许提交仅含占位内容的 `.env.example`。通过 GitHub 网页手动上传时，仍需自行检查所选文件。

## 项目目录 / Structure

```text
.gitignore
README.md
CHANGELOG.md
THIRD_PARTY_NOTICES.md
server-beta/
├── netlify.toml                  # Netlify 构建和路由配置
├── package.json                  # 测试与内测维护命令
├── .env.example                  # 占位配置模板
├── DEPLOY.md                     # 部署与验收说明
├── public/                       # 公开的邀请码页、样式与图标
├── private/                      # 经网关验证后返回的应用与数据
│   ├── index.html
│   ├── app.js
│   ├── policy-engine.js
│   ├── fee-engine.js
│   ├── i18n.js
│   ├── data/
│   └── icons/
├── netlify/
│   ├── functions/gateway.mjs     # 邀请码验证、会话检查和资源访问
│   └── lib/store.mjs             # Redis 请求及原子计数脚本
├── scripts/invite.mjs            # 内测维护工具
└── tests/gateway.test.mjs        # 网关回归检查
```

仓库根目录保留早期版本的 `index.html` 和 `app.js`。当前 Netlify 部署以 `server-beta/` 为入口。`private/` 表示站点运行时由网关控制访问的目录，公开仓库中的文件仍可通过 GitHub 查看。

## 验证 / Verification

在 `server-beta/` 目录中运行本地网关检查。

```sh
npm test
```

当前包含 12 项自动检查，覆盖邀请码页面、旧登录标记、受限资源、会话检查、重复请求、限流响应、数据库故障及路径限制，数据库响应由测试模拟。

本次上线已完成内测登录验证，维护者已确认地图和站内功能正常。本地验证还包含函数打包、打包后页面读取以及在模拟 Redis 下执行 Lua 名额计数脚本。旧设备缓存迁移、长时间运行和不同移动浏览器仍需持续验证。

## 数据来源 / Credits

- **TravelRequirements.info — Entry Requirements Dataset**，AXG Sp. z o.o.，政策同步与规则来源参考。来源及授权信息见 [数据仓库](https://github.com/travel-requirements/entry-requirements) 和 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。
- **Frankfurter**，提供定期更新的参考汇率。[服务网站](https://frankfurter.dev/)
- **Natural Earth**，提供世界地图轮廓。[项目网站](https://www.naturalearthdata.com/)
- **Passport Index Data（imorte）**，护照数据参考。[项目仓库](https://github.com/imorte/passport-index-data)

第三方归属与授权信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。原型阶段曾参考 `ysu-client` 的 Web 与 Capacitor 架构思路。项目专属代码的授权声明见 [LICENSE](server-beta/private/LICENSE)。

## 使用说明 / Usage notes

- BusVisa 提供第三方入境政策参考。出发、购票和办理登机手续前，请核对目的地政府与承运航司的最新要求。
- 护照和已登记签证用于生成条件性提示。实际入境资格还涉及有效期、入境次数、签证签发地、首次使用及其他附加条件。
- 参考费用与汇率存在更新周期，实际办理或结算金额以服务提供方为准。
- 护照选择和个人签证记录保存在浏览器本地。清理网站数据或更换域名、浏览器后，需要自行重新录入。
- 签证页的设置与关于中提供四语言使用说明及未成年人和监护人提示。

## 更新记录 / Changelog

完整版本功能与仓库维护记录见 [版本历史](CHANGELOG.md)。
