# 项目说明

海哥自媒体账号内容工作台是一个面向 B 端内容运营场景的本地 Web 项目，当前服务于火锅食材供应链账号的选题、调研、脚本、素材和复盘流程。

## 项目结构

- `docs/`：项目文档，包括设计说明、AI 规则、任务清单、数据结构说明。
- `scripts/`：双系统底层启动脚本。
- `launchers/`：项目内双击入口和桌面启动器安装脚本。
- `src/`：前端源码、样式、类型和 `src/data/content.json` 业务数据。
- `server/`：本地 Node 开发服务、Tavily / DeepSeek 接口代理、数据写回服务。
- `public/`：静态资源与原生登录相关脚本。

## 启动方式

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

本地访问：

```text
http://127.0.0.1:4280/
```

生产构建：

```bash
npm run build
npm run start
```

生产环境默认读取：

```text
.env
.env.production
.env.local
.env.production.local
```

建议云上使用 `.env.production.local`，不要提交真实密钥。

## 双击启动

项目内已经提供双平台双击入口，默认都会启动开发版并打开：

```text
http://127.0.0.1:4280/
```

### 直接在项目内双击

- macOS：双击 `launchers/Open Haizong Project.command`
- Windows：双击 `launchers/Open Haizong Project.bat`

它们都会调用 `scripts/` 里的底层脚本，并自动：

- 检查 `npm` / Node.js 是否可用
- 缺少 `node_modules` 时自动执行 `npm install`
- 打开浏览器访问本地地址
- 启动 `npm run dev`

### 放到桌面双击

- macOS：
  - 双击 `launchers/Install macOS Desktop Launcher.command`
  - 脚本会在桌面生成 `Open Haizong Project.command`
  - 之后双击桌面上的这个文件即可启动项目
- Windows：
  - 双击 `launchers/Install Windows Desktop Shortcut.vbs`
  - 脚本会在桌面生成 `Open Haizong Project.lnk`
  - 之后双击桌面快捷方式即可启动项目

### 首次运行提示

- macOS 第一次双击 `.command` 文件时，如果系统阻止运行，请在“系统设置 > 隐私与安全性”里允许，或右键后选择“打开”。
- Windows 第一次运行脚本时，如果系统弹出安全提示，请确认来源是你自己的项目目录后再继续。
- 关闭终端或命令行窗口后，本地开发服务会停止。

## 上云建议

当前仓库已经支持“开发 / 生产”分离运行：

- 开发环境：`npm run dev`
- 生产环境：先 `npm run build`，再 `npm run start`

如果只是先做阿里云 ECS 内部试运行，推荐继续使用前后端一体部署：

1. 把整个项目传到 ECS
2. 安装 Node.js 20+
3. 配置 `.env.production.local`
4. 执行 `npm install`
5. 执行 `npm run build`
6. 执行 `npm run start`

部署细节见 [docs/aliyun-ecs-deploy.md](/Users/mac/Desktop/haizong-%20project/docs/aliyun-ecs-deploy.md:1)。

## 文档说明

- `AGENT.md`：AI 执行规则和项目协作约束。
- `docs/AI_RULES.md`：AI 详细规则。
- `docs/TODO.md`：任务进度和待办事项。
- `docs/DATA_SCHEMA.md`：`src/data/content.json` 与 `src/types.ts` 的数据结构说明。
- `docs/DESIGN.md`：设计说明。

## 注意事项

- 不要修改 `node_modules/`
- 不要修改 `dist/`
- 不要提交 `.env.local`
- 修改功能前先阅读 `AGENT.md` 和 `README.md`
