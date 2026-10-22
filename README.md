# koishi-plugin-imgsearch-coser

找 Coser！
这是一个 koishi 上用来寻找 X/Twitter 或者其他平台上博主的插件。
利用 Google Lens 搜索图片，并返回原帖和作者ID。

## 使用方法

使用前请先配置 API 或者 Cookies。
发送「找coser」并附图，或引用图片后发送指令。也可以先发送指令再按提示补图，或提供公开图片网址：

```text
找coser https://example.com/image.jpg
```

默认别名为 `搜coser`。可在配置中修改指令、指令别名和返回消息格式。

## 搜索接口

| 接口 | 使用前配置 | 图片提交方式 |
| --- | --- | --- |
| SerpApi Google Lens | `apiKey` | 上传图片文件 |
| Google Lens 网页 | `googleCookie` | 默认上传图片文件 |

### 获取 SerpApi API Key

1. 注册并登录 [SerpApi](https://serpapi.com/)。
2. 打开 [API Key 页面](https://serpapi.com/manage-api-key)，复制自己的 API Key。
3. 在插件的“搜索引擎设置”中选择 **SerpApi**，将 Key 粘贴到“SerpApi 接口设置”的 `apiKey`，保存配置。

### 获取 Google Lens Cookie

以下步骤适用于 Chrome 和 Edge：

1. 打开 [Google](https://www.google.com/)，点击搜索框中的相机图标进入 Lens。
2. 按 `F12` 打开开发者工具，切换到 **Network（网络）**。
3. 上传一张图片并完成搜索，等待结果显示。如果 Google 要求登录或验证，先在浏览器中完成。
4. 在网络请求中找到 Google 搜索结果页面的请求，通常地址为 `https://www.google.com/search?...`。
5. 打开 **Headers（标头） → Request Headers（请求标头）**，复制 `Cookie` 的完整值。
6. 在插件的“搜索引擎设置”中选择 **Google Lens 网页**，将值粘贴到“Google Lens 网页接口设置”的 `googleCookie`，保存配置。


## 配置

| 配置项 | 用途 | 默认值 |
| --- | --- | --- |
| `provider` | 搜索接口 | SerpApi |
| `language` | 搜索语言，下拉选择 | 简体中文 |
| `apiKey` | SerpApi API Key | 未填写 |
| `googleCookie` | Google Cookie | 未填写 |
| `platforms` | 平台启用、顺序、数量和链接类型 | 见下表 |
| `blockedWords` | 过滤词，默认折叠 | 内置词表 |
| `command` | 指令名称 | `找coser` |
| `aliases` | 指令别名，输入后按回车添加 | `搜coser` |
| `showProgress` | 发送“⏳ 搜索中，请稍候……” | 开启 |
| `resultTemplate` | 返回文本模板，可恢复默认 | 内置模板 |
| `logDetails` | 调试日志 | 关闭 |

### 平台设置

使用上下箭头调整优先顺序。每个平台的返回数量独立设置，默认 1 条，可设为 1 至 10 条。

| 平台 | 默认启用 |
| --- | --- |
| X / Twitter | 是 |
| Instagram | 是 |
| 微博 | 是 |
| Threads | 否 |
| Bluesky | 否 |
| Facebook | 否 |
| TikTok | 否 |
| 抖音 | 否 |
| Bilibili | 否 |
| Pinterest | 否 |

“结果类型”控制允许返回的链接：

- **帖子及主页**：保留具体帖子和账号个人主页。
- **仅帖子**：排除个人主页，只保留具体帖子。

### 过滤词

展开 `blockedWords`，每行一个词；清空列表可关闭过滤。

### 返回文本

展开 `resultTemplate` 修改默认文本，点击“恢复默认”可还原。

```text
🖼️ 搜图结果

{results}
📱 平台：{platform}
🧩 匹配：{match}
🏷️ 用户：{name}
📇 账号：{account}
📝 标题：{title}
📎 {linkLabel}：{url}
{/results}
```

`{results}…{/results}` 内的内容按结果逐条重复：

| 占位符 | 内容 |
| --- | --- |
| `{platform}` | 平台 |
| `{match}` | 精确匹配或视觉相似 |
| `{name}` | 页面显示名 |
| `{account}` | 发布账号 |
| `{title}` | 清理后的标题 |
| `{linkLabel}` | 帖子或主页 |
| `{url}` | 原链接 |
| `{index}` | 当前结果序号 |
| `{count}` | 结果总数，也可放在结果区外 |

### 调试日志

开启 `logDetails` 后，在 Koishi 日志中查看请求阶段、图片大小、结果数、缓存命中、耗时和错误代码。


## License

- [MIT License](./LICENSE)
