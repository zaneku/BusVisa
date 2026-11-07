## BusVisa v0.3.2 — 设置与外观

- 签证页最下方的「设置」包含浅色、深色、跟随系统、四语言和可展开的「关于 BusVisa」。
- 外观默认跟随系统，保存在本机 `busvisa.theme.v1`；切换不会清除护照、签证或邀请码解锁状态。
- 用户界面已移除开发用「检查本站政策接口是否可用」入口；正式同步按钮与后台数据接口保留。
- Netlify 更新时把 `index.html`、`theme.js`、`style.css`、`app.js`、`sw.js` 等同层文件一起部署。

# BusVisa — Global Visa Map

**Version:** v0.3.2 · **Author:** Ku · **Website:** https://busvisa.netlify.app/ · **GitHub:** https://github.com/zaneku/BusVisa

An independent, mobile-first global visa access map. Current prototype is a static Progressive Web App (PWA), designed for iOS Safari and Android browsers, with optional later integration into a native wrapper.

## 邀请制内测 / Private beta

- 首页增加四语言邀请码验证界面：**简体中文、繁體中文（香港）、繁體中文（台灣）、English**。
- 输入邀请码后解锁应用，验证结果只保存在该设备 / 浏览器的 `localStorage`。未解锁前不初始化地图和在线政策同步。
- 验证不修改已有 `va.v2.visas`、`va.passport` 等用户记录。
- **安全说明：本实现是客户端内测入口，并非真正的服务器端访问控制。** 静态网站公开可下载，技术用户可以绕过此 UI。若需要严格控制访问，请用 Netlify Identity / Edge Functions + 服务端权限校验及限制数据获取。

## 主要功能 / Features

- 底部仅有 **地图 / 签证**（Map / Visas）两栏
- 根据所选护照、已登记的签证类型，提示目的地免签、落地签、电子旅行授权或条件性通行资格
- 护照与签证签发国支持简体中文、繁体中文（香港及台湾）和英文混合搜索
- 签证类型按签发国家分别列出；申根成员国包含申根 A / C / D 等类别；未收录时可手动录入
- 不要求或存储签证有效期
- 语言：简体中文、繁體中文（香港）、繁體中文（台灣）、English；设置位于 **签证 → 设置**
- 在 **签证 → 设置 → 关于 BusVisa** 显示作者 Ku 和可点击的 [GitHub 项目链接](https://github.com/zaneku/BusVisa)
- 落地签费用、当地币及人民币参考价（来源有更新周期，不等于银行实时结算）
- 在线同步公开入境政策数据并保留本地缓存；显示数据来源及最近同步记录
- 主屏幕图标、离线壳缓存、PWA manifest

## 部署到 Netlify / Deployment

本仓库是 **静态网站**：`index.html`、`app.js`、`style.css`、`i18n.js`、`data/` 和 `icons/` 均位于仓库根目录。无需 npm 编译。

在 Netlify 中连接此 GitHub 仓库并创建部署配置：

- **Base directory**: 留空 / empty
- **Build command**: 留空 / empty
- **Publish directory**: `.`

保留仓库中的 `_redirects` 和 `_headers`：它们为政策数据和参考汇率提供 Netlify 同域代理及缓存控制。发布成功后，可在 Safari 中通过“添加到主屏幕”将网站保存为 Web App。

**如已手动部署了 `busvisa.netlify.app`：** 请在原有 Netlify 站点中链接 GitHub 仓库，而不是创建第二个同名站点。连接仓库并设置发布目录为项目根目录后，今后 push 即可触发构建（受 Netlify 设置影响）。

## 使用和限制 / Important limitations

- 这只是签证政策 **参考工具**，并非领事机构或移民部门的官方入境许可系统。
- 公开数据来源的更新频率与不同国家的移民政策发布速度不一致；在出发、购票和办理登机手续前，请核对相应政府及承运航司的最新要求。
- 已登记的签证类型只是个人记录，不代表满足有效期、多次入境、首次使用、签证签发地等附加要求；对于第三国签证免签政策，App 仅能提供条件性提示。
- 签证记录保存在你的浏览器本地存储中，本仓库**不包含**你的个人签证信息。清理网站数据或更换域名会导致记录无法自动同步。
- `busvisa.netlify.app` 的内容是否更新，由 Netlify 部署状态决定；将文件提交到 GitHub 本身不会自动修改 Netlify 上线版本。

## 数据来源 / Credits

- **TravelRequirements.info — Entry Requirements Dataset**, AXG Sp. z o.o. — [dataset](https://github.com/travel-requirements/entry-requirements), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The app uses this dataset and provides per-rule references where available.
- **Frankfurter** — daily indicative foreign-exchange rates: https://frankfurter.dev/ . These are not transaction rates.
- **Natural Earth** — public-domain world boundaries: https://www.naturalearthdata.com/ .
- **Passport Index Data (imorte)** — alternative publicly accessible passport data, MIT License: https://github.com/imorte/passport-index-data .
- `ysu-client` was referenced for general product architecture (Web + Capacitor); no source code copied from that GPL-3.0 repository.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the notices. Project-specific code has not been released under an open-source license; publishing this repository publicly does not by itself grant a license to reuse the code.

## 项目目录 / Structure

```text
index.html / app.js / style.css / i18n.js  # app UI
policy-engine.js / fee-engine.js          # policy, fees and exchange logic
country-search.js                         # multilingual country search
sw.js / manifest.webmanifest              # PWA support
data/                                      # static baseline reference data
icons/                                     # favicon and PWA icon files
_redirects / _headers                     # Netlify configuration
```

**Current package:** 2026-11, v0.3.2.

## v0.3.0 changes / 更新记录

- Current project name: **BusVisa** (GitHub: https://github.com/zaneku/BusVisa; current Netlify hostname unchanged).
- Correct online `embassy-visa` status to `需提前签证` / Visa required; `unknown` reserved for missing or unsupported records.
- Remove duplicates between built-in visa codes and online country-specific visa names, across all issuers.
- Remove green internal visa-type update counter from the user interface.
- Preserve existing local visa and language records: localStorage keys intentionally remain `va.*`.

Do not clear Safari site data when upgrading. App metadata and new shortcut installs show **BusVisa**; existing iOS shortcuts may retain their old manually chosen label until renamed or re-added.

## v0.3.0 changes / 更新记录

- Fix the country picker showing only the first **90** entries, ending at Guam. All **250** passport/issuer country and territory choices now render and scroll.
- The map's destination search list no longer hides entries beyond its first 100 results.
- Improve iPhone Safari vertical scrolling by separating a fixed search area from a single, touch-scrollable list.
- Reset scroll position after changing search terms; preserve multilingual search and all saved visa records.
- Bump static asset and service-worker cache versions to prevent stale list logic after Netlify deploy.

## Disclaimer and minors

In **Visas → Settings → About BusVisa**, the app presents four localized notices covering:
- Independent third-party information, no official government affiliation or guarantee of admission.
- Travel, visa and monetary risks and liability limitations to the extent permitted by law.
- Parental/guardian consent, oversight and document verification for minors.
- Preservation of statutory rights and all liabilities that cannot legally be excluded.

No disclaimer guarantees absolute immunity; the actual effect depends on applicable law.
