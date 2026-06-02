# 阿里云 ECS 部署说明

适用场景：当前版本作为内部工具或演示环境上线，采用单台 ECS 前后端一体部署。

## 1. 适用前提

- 当前项目仍以单机文件存储为主，默认写入 `src/data/content.json`
- 登录默认是轻量本地登录，不是正式多用户账号体系
- 联网调研和 AI 生成功能依赖外部 API：Tavily、DeepSeek

如果目标是正式多人系统，请先补齐数据库、正式登录、备份和权限隔离。

## 2. ECS 建议规格

- 地域：靠近你常用办公地
- 系统：Alibaba Cloud Linux 3 或 Ubuntu 22.04 LTS
- 规格：`2 vCPU / 2 GB` 起步即可做内部试运行
- 公网：分配公网 IP
- 安全组：放行 `22`、`80`、`443`，如果暂时不挂 Nginx，也至少放行你的应用端口，例如 `4280`

## 3. 服务器初始化

安装 Node.js 20 或更高版本。

示例：

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs
node -v
npm -v
```

如果是 Ubuntu，可改用 `apt` 安装。

## 4. 上传项目

可选方式：

- 用 `git clone` 拉代码
- 用 SFTP / SCP 上传项目目录

建议保留完整项目目录，因为生产服务会读取 `dist/`、`public/` 和内容数据文件。

## 5. 生产环境变量

在项目根目录创建 `.env.production.local`：

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=4280

AUTH_MODE=local
AUTH_LOCAL_USERNAME=admin
AUTH_LOCAL_PASSWORD=请改成你自己的密码
AUTH_LOCAL_DISPLAY_NAME=海总管理员
AUTH_SESSION_TTL_MS=28800000

CONTENT_STORAGE_PATH=src/data/content.json
CONTENT_READONLY=false

TAVILY_API_KEY=你的 Tavily Key
TAVILY_BASE_URL=https://api.tavily.com/search

DEEPSEEK_API_KEY=你的 DeepSeek Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

说明：

- `HOST=0.0.0.0` 让 ECS 外部可访问
- `CONTENT_READONLY=false` 允许继续写文件
- 如果只做演示、不想线上写入，可设为 `true`
- 如果后续要把数据文件迁出源码目录，可修改 `CONTENT_STORAGE_PATH`

## 6. 启动方式

首次部署：

```bash
npm install
npm run build
npm run start
```

应用启动后默认监听：

```text
http://0.0.0.0:4280/
```

浏览器实际访问：

```text
http://<你的ECS公网IP>:4280/
```

## 7. 推荐用 Nginx 反向代理

建议用 Nginx 代理到 Node 服务，这样后续更容易接域名和 HTTPS。

示例转发目标：

```text
127.0.0.1:4280
```

推荐流程：

1. Node 服务监听 `127.0.0.1:4280` 或内网地址
2. Nginx 对外监听 `80/443`
3. 域名解析到 ECS 公网 IP
4. 证书使用阿里云 SSL 或 Let's Encrypt

如果你只是内部临时试跑，也可以先跳过 Nginx，直接用公网 IP + 端口访问。

## 8. 建议接入进程守护

建议用 `pm2` 或 `systemd`，避免 SSH 退出后服务停止。

最简单的 `pm2` 方式：

```bash
npm install -g pm2
pm2 start npm --name haizong-workbench -- run start
pm2 save
pm2 startup
```

## 9. 验收清单

- 打开首页时能正常进入登录页或主页
- 登录成功后能进入工作台
- `/app-config.js` 能返回当前运行时配置
- 联网调研接口可正常返回结果
- 选题确认入池后，内容数据文件确实发生变更
- 服务重启后，已保存数据仍然存在
- 缺少 API Key 时，前端或接口报错信息可定位

## 10. 当前阶段不建议直接做的事

- 立刻做复杂微服务拆分
- 在现有文件写回模式上直接承诺正式多用户使用
- 把测试账号密码保持为默认值上线
- 不加反向代理和证书就长期暴露公网
