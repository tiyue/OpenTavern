# 独立卡片联网运行服务

F18 和 F19 的 L0–L2 在应用内运行，不需要此服务。L3 将卡片放在不同来源服务内的 opaque iframe 中，联网通过服务的浏览器请求代理完成。HTTP、HTTPS 和本机不同端口均支持；浏览器仍会执行实际 CORS 和混合内容限制。

本目录是独立静态站点，不能与应用使用相同 origin。没有数据库、用户文件或服务端凭据。未自动部署远端服务。

## 本机启动

在仓库根目录执行：

```powershell
python -B -m http.server 8766 --bind 127.0.0.1 --directory card-runtime
```

应用使用 `http://127.0.0.1:8765` 时，运行卡片选择 L3，联网服务地址填写 `http://127.0.0.1:8766/index.html`。单独勾选联网权限，填写允许访问的完整 origin（例如 `http://127.0.0.1:8765`），选择方法；准备依赖后查看来源、摘要和源码，再确认运行。

`config.js` 的 `CARD_BROKER_PARENT_ORIGINS` 只列出自己应用的准确来源。使用其它端口、域名或局域网地址时，把实际应用 origin 加到此列表。不要设置通配符。部署时原样提供 `index.html/config.js/broker.js`，保持不同源；若平台附加 CSP，必须允许本页面创建 srcdoc 子框架及运行固定脚本，子框架自己的 CSP 继续禁用直接联网。

## 请求与撤销

卡片可使用 `OpenTavernFrontend.networkFetch(url, {method, headers, body})`，或 L3 内包装后的 `fetch`。请求方法必须在审核时选中；仅接受 `Accept/Content-Type` 字符串头及字符串请求体，不转发 Cookie、Authorization 等凭据，不跟随重定向。返回 UTF-8 正文；二进制下载、WebSocket、表单提交及任意嵌入页面不在本次接口范围。

每实例上限：50 次请求，256 KiB 请求体，1 MiB 响应，8 MiB 收发总量，12 秒超时（包括读取正文）。停止/撤销/销毁实例时关闭通道并取消未完成请求。撤销不会回退已经保存的 MVU 修改。

卡片脚本不享有浏览器提供的硬 CPU/内存限额。超时和心跳用于断连后的清理，不能保证抢占执行中的 JavaScript。本次实际浏览器验证了隔离来源、授权桥接与双端口 HTTP；未声称通过全部浏览器、真实手机和无限资源压力验收。

子框架 CSP 阻止直接 fetch/XHR、未许可资源、表单和嵌入页面，链接点击也被拦截。但浏览器仍允许脚本导航自己的 iframe：导航请求可能已经发出，之后的 load 才触发停止和撤销。因此联网接口关闭及 broker 配额不是绝对断网保证；只应运行可信卡片，尤其是已授予读取聊天或变量权限的卡片。审核窗口会显示这项限制。

## 固定依赖

应用的 `assets/js/vendor/card-runtime-vendors.json` 记录正版依赖版本、下载源、发行包完整性和 SHA-256，同目录保留 LICENSE。首次下载经 npm 官方 registry 的发行包完整性验证；运行前再次核验字节摘要。lodash 使用 4.17.23、js-yaml 使用 4.1.1 修复版，而非参考主站的旧版本。Vue 使用固定生产构建。卡片中声明的已识别 CDN 主库会映射到这些固定版本，审核界面显示实际版本和摘要；名称相似的插件不会被丢弃。

`.gitattributes` 仅对这些固定 JavaScript 文件关闭换行转换；`check:card-execution` 核对实际文件字节、源清单与入口 SRI，防止换平台或下载内容变化后带着错误摘要发布。

L1–L3 的 `unsafe-eval` 仅在隔离子框架内支持 lodash/Vue 的编译 API，宿主不执行卡片代码。网络、远程媒体、变量读写、输入回填和发送均是独立许可。JSON/YAML、模板及酒馆兼容 API 的支持清单见 [应用规格](../docs/spec.md)；未知接口明确报错。

## 已实现的卡片接口

`OpenTavernFrontend` 与 `TavernHelper` 指向同一接口。除当前消息 ID 和同步变量读取外，方法返回 Promise；引用只允许承载卡片的稳定消息 ID，不能访问其它消息变量。所有操作仍须相应许可。

| 接口 | 当前行为 |
| --- | --- |
| `getCurrentMessageId()`、`getvar(path)`、`getAllVariables()` | 当前 ID；自身消息变量的同步副本 |
| `getVariables()`、`replaceVariables(data)`、`updateVariablesWith(fn)`、`patchMvuData(operations)` | 读取/整体替换/局部函数更新/结构更新；写入在可靠保存完成后返回，更新函数仅在卡片窗口执行 |
| `Mvu.getMvuData()`、`Mvu.replaceMvuData(data)`、`Mvu.patch(operations)` | 对应变量接口；`MVU` 为同一别名 |
| `getChatMessages()`、`getLastMessageId()`、`getCharacter()`、`getTheme()` | 当前聊天最近最多 200 条非系统主消息、最后 ID、角色名称/头像/描述、已解析主题；不返回 CoT、密钥或设置 |
| `setInputText(text)`、`appendInputText(text)`、`triggerGeneration()` | 保护用户已编辑草稿的回填；独立授权后通过真实聊天发送流程生成 |
| `substituteMacros(text)`、`formatAsDisplayedMessage(text)`、`refreshOneMessage()` | 受限只读宏、F17 格式化、刷新自身显示 |
| `eventOn/Once(name, callback)`、`eventEmit(name, detail)` | 宿主 `chat.changed/mvu.updated` 订阅或卡片内事件；不能伪造宿主事件 |
| `networkFetch(url, options)`、L3 `fetch(url, options)` | 本页审核的来源、方法及收发配额；其它层不开放该接口 |

这里是已实现子集，未提供完整 SillyTavern 扩展 API、任意查询/写消息、所有库或任意裸模块。`SillyTavern.getContext()` 只返回有界聊天副本及角色 ID。未实现的方法明确返回 `UNSUPPORTED_METHOD`。
