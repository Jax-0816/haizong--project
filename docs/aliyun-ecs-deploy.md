# 阿里云 ECS 部署完整指南

适用场景：将海哥内容工作台部署到阿里云 ECS，作为内部工具或演示环境上线。单台 ECS 前后端一体部署。

---

## 前置说明

- 当前项目以**单机文件存储**为主，数据写入 `src/data/content.json`
- 登录默认**本地模式**（`AUTH_MODE=local`），不是多用户账号体系
- 联网调研和 AI 生成依赖外部 API：Tavily + DeepSeek
- 如果目标是正式多人系统，需先补齐数据库、正式登录、备份和权限隔离

---

## 阶段 1：创建 ECS 实例

### 1.1 购买配置

| 配置项 | 建议值 |
| --- | --- |
| 地域 | 靠近你的常用办公地 |
| 系统 | Ubuntu 22.04 LTS（推荐）或 Alibaba Cloud Linux 3 |
| 规格 | 2 vCPU / 2 GB 内存（起步） |
| 系统盘 | 40 GB ESSD Entry |
| 公网 IP | 分配（按流量或按带宽） |

### 1.2 安全组规则

在 ECS 控制台 → 安全组 → 添加规则：

| 方向 | 端口 | 来源 | 说明 |
| --- | --- | --- | --- |
| 入方向 | 22 | 你的 IP（不要 0.0.0.0/0） | SSH |
| 入方向 | 80 | 0.0.0.0/0 | HTTP |
| 入方向 | 443 | 0.0.0.0/0 | HTTPS |
| 入方向 | 4280 | 127.0.0.1/32 | 应用端口（仅本机 Nginx 访问） |

> **安全提示**：SSH 端口 22 不要对全网开放，限制为你的办公/家庭 IP。

---

## 阶段 2：服务器初始化

SSH 登录到 ECS：

```bash
ssh root@<你的ECS公网IP>
```

### 2.1 创建应用用户（不要用 root 运行）

```bash
useradd -m -s /bin/bash haizong
passwd haizong        # 设置密码（可选，SSH 密钥更安全）
```

### 2.2 安装 Node.js 20

Ubuntu：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # 应输出 v20.x.x
npm -v
```

Alibaba Cloud Linux：

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs
```

### 2.3 安装 Nginx

```bash
# Ubuntu
apt install -y nginx
systemctl enable nginx

# Alibaba Cloud Linux
yum install -y nginx
systemctl enable nginx
```

### 2.4 基础安全加固

```bash
# 编辑 SSH 配置
vi /etc/ssh/sshd_config

# 修改以下行：
#   PermitRootLogin no           # 禁止 root 登录
#   PasswordAuthentication no    # 禁止密码登录（用密钥）
#   PubkeyAuthentication yes

systemctl restart sshd
```

**保持当前 SSH 连接不断开**，另开一个终端测试新连接正常后再关闭。

---

## 阶段 3：应用部署

### 3.1 上传项目到服务器

**方式 A：本地 rsync 推送**（推荐，速度快）

在**本地**执行：

```bash
# 先构建
npm run build

# 同步到 ECS（排除不需要的文件）
rsync -avz --delete \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='logs/' \
  --exclude='backups/' \
  -e "ssh -i ~/.ssh/your-key.pem" \
  ./ root@<ECS_IP>:/opt/haizong-workbench/
```

**方式 B：git clone**（如果你有私有仓库）

```bash
ssh root@<ECS_IP>
cd /opt
git clone <你的仓库地址> haizong-workbench
```

### 3.2 配置环境变量

在服务器上创建 `.env.production.local`：

```bash
ssh root@<ECS_IP>
cd /opt/haizong-workbench

cat > .env.production.local << 'EOF'
NODE_ENV=production
HOST=127.0.0.1
PORT=4280

AUTH_MODE=local
AUTH_LOCAL_USERNAME=admin
AUTH_LOCAL_PASSWORD=请改成你自己的密码
AUTH_LOCAL_DISPLAY_NAME=海总管理员
AUTH_SESSION_TTL_MS=28800000

CONTENT_STORAGE_PATH=src/data/content.json
CONTENT_READONLY=false

TAVILY_API_KEY=你的真实Tavily密钥
TAVILY_BASE_URL=https://api.tavily.com/search

DEEPSEEK_API_KEY=你的真实DeepSeek密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
EOF
```

> **重要**：`HOST=127.0.0.1` — 应用只监听本地，外部通过 Nginx 访问。如果想直接暴露测试，临时改为 `0.0.0.0`。

### 3.3 构建和测试启动

```bash
cd /opt/haizong-workbench
npm install
npm run build
```

测试启动（前台运行，Ctrl+C 停止）：

```bash
node server/prod.mjs

# 另开一个终端测试
curl http://127.0.0.1:4280/api/health
# 应返回: {"status":"ok","version":"0.1.0","uptime":...,"contentWritable":true}
```

### 3.4 设置文件权限

```bash
chown -R haizong:haizong /opt/haizong-workbench
chmod 600 /opt/haizong-workbench/.env.production.local   # 密钥文件保护
```

---

## 阶段 4：Nginx 反向代理 + HTTPS

### 4.1 部署 Nginx 配置

项目已提供配置模板：`deploy/nginx.haizong.conf`

```bash
# 复制到 Nginx 目录
cp /opt/haizong-workbench/deploy/nginx.haizong.conf /etc/nginx/conf.d/haizong.conf

# 编辑，替换 your-domain.com 为你的域名或 IP
vi /etc/nginx/conf.d/haizong.conf

# 测试配置
nginx -t

# 重载
systemctl reload nginx
```

此时访问 `http://<你的域名或IP>` 应该能打开登录页。

### 4.2 配置 HTTPS（推荐 acme.sh）

```bash
# 安装 acme.sh
curl https://get.acme.sh | sh
source ~/.bashrc

# 申请证书（需要域名已解析到 ECS）
acme.sh --issue -d your-domain.com --nginx

# 安装证书
acme.sh --install-cert -d your-domain.com \
  --key-file       /etc/nginx/ssl/privkey.pem  \
  --fullchain-file /etc/nginx/ssl/fullchain.pem \
  --reloadcmd     "systemctl reload nginx"
```

然后编辑 Nginx 配置，取消 HTTPS server 块的注释，并启用 HTTP→HTTPS 重定向。

```bash
vi /etc/nginx/conf.d/haizong.conf
# 取消 301 重定向和 443 server 块的注释，修改 server_name

nginx -t && systemctl reload nginx
```

---

## 阶段 5：进程守护（systemd）

### 5.1 部署 systemd 服务

```bash
cp /opt/haizong-workbench/deploy/haizong.service /etc/systemd/system/haizong.service
systemctl daemon-reload
```

### 5.2 调整服务文件（如需要）

如果你的 content.json 路径不在默认位置，编辑服务文件中的 `ReadWritePaths`：

```bash
vi /etc/systemd/system/haizong.service
```

### 5.3 启动并设置开机自启

```bash
systemctl enable --now haizong
systemctl status haizong
```

### 5.4 常用命令

```bash
systemctl status haizong       # 查看状态
systemctl restart haizong      # 重启
systemctl stop haizong         # 停止
journalctl -u haizong -f       # 实时日志
journalctl -u haizong -n 50    # 最近 50 行日志
```

### 备选：PM2

如果习惯用 PM2：

```bash
npm install -g pm2
cd /opt/haizong-workbench
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup
```

---

## 阶段 6：数据持久化

### 6.1 content.json 备份

```bash
# 设置每日凌晨 3 点自动备份
crontab -e -u haizong

# 添加：
0 3 * * * /opt/haizong-workbench/scripts/backup-content.sh
```

备份文件保存在 `/opt/haizong-workbench/backups/`，保留最近 30 个。

### 6.2 （可选）将 content.json 移出代码目录

防止 `git pull` 或 rsync `--delete` 覆盖生产数据：

```bash
mkdir -p /data/haizong
mv /opt/haizong-workbench/src/data/content.json /data/haizong/content.json
chown -R haizong:haizong /data/haizong
```

然后修改 `.env.production.local`：

```text
CONTENT_STORAGE_PATH=/data/haizong/content.json
```

并更新 systemd 服务中的 `ReadWritePaths`：

```text
ReadWritePaths=/data/haizong
```

---

## 阶段 7：验收清单

依次检查以下项目：

```
□ 打开 http://<域名> — 能看到登录页
□ 输入用户名密码 — 能成功登录进入工作台
□ curl http://127.0.0.1:4280/api/health — 返回 {"status":"ok",...}
□ curl http://127.0.0.1:4280/app-config.js — 返回 window.__APP_CONFIG__ = {...}
□ 在"联网调研"输入主题点击搜索 — 能返回结果
□ 在"选题池"确认一个 AI 选题 — 选题成功加入
□ systemctl restart haizong — 服务重启正常
□ 重启后重新登录 — 之前确认的选题还在
□ 故意输入错误密码 — 被拒绝登录
□ HTTPS 证书正常 — 浏览器显示安全锁
```

---

## 阶段 8：日常更新流程

当本地有新版本需要推送到 ECS：

### 方式 A：使用部署脚本（推荐）

```bash
# 本地执行（一键完成构建、上传、安装、重启、健康检查）
./scripts/deploy-ecs.sh <ECS_IP> ~/.ssh/your-key.pem root
```

### 方式 B：手动更新

```bash
# 1. 本地构建
npm run build

# 2. 同步到 ECS（保护 content.json 不被覆盖）
rsync -avz --delete \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='src/data/content.json' \
  --exclude='logs/' \
  --exclude='backups/' \
  -e "ssh -i ~/.ssh/your-key.pem" \
  ./ root@<ECS_IP>:/opt/haizong-workbench/

# 3. 远程安装依赖
ssh root@<ECS_IP> "cd /opt/haizong-workbench && npm install"

# 4. 重启服务
ssh root@<ECS_IP> "systemctl restart haizong"

# 5. 验证
ssh root@<ECS_IP> "curl -s http://127.0.0.1:4280/api/health"
```

> **注意**：`--exclude='src/data/content.json'` 是关键，防止把本地测试数据覆盖线上真实数据。

---

## 阶段 9：故障排查

### 服务启动失败

```bash
# 查看完整日志
journalctl -u haizong -n 50 --no-pager

# 手动前台运行看报错
cd /opt/haizong-workbench && node server/prod.mjs
```

常见原因：
- `.env.production.local` 不存在或格式错误
- Node.js 版本过低（需 ≥18）
- 端口 4280 被占用：`lsof -i :4280`

### Nginx 502 Bad Gateway

后端服务没有运行：

```bash
systemctl status haizong
curl http://127.0.0.1:4280/api/health
```

### AI 接口报错

检查 API Key 是否正确配置：

```bash
source .env.production.local
echo $TAVILY_API_KEY
echo $DEEPSEEK_API_KEY
```

手动测试 AI 接口连通性：

```bash
curl -s -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  https://api.deepseek.com/v1/models | head -100
```

### content.json 写入失败

检查权限：

```bash
ls -la /opt/haizong-workbench/src/data/content.json
# 应归属 haizong:haizong，有读写权限

# 检查是否只读模式
grep CONTENT_READONLY /opt/haizong-workbench/.env.production.local
```

### 登录后立刻退出

检查会话配置：

```bash
# 确认 app-config.js 返回正确配置
curl http://127.0.0.1:4280/app-config.js
```

---

## 阶段 10：成本估算

| 资源 | 月费（参考） |
| --- | --- |
| ECS 2C2G（按量） | ~¥70 |
| ECS 2C4G（包年） | ~¥100/月 |
| 40GB ESSD | ~¥20 |
| 公网 IP + 流量 | ~¥30-50 |
| **合计** | **约 ¥120-170/月** |

弹性公网 IP（EIP）如果不绑定实例会收费，建议用实例自带的公网 IP 或绑定后保持关联。

---

## 当前阶段不建议做的事

- 微服务拆分（单机 + 单进程已经够用）
- 在文件写回模式上承诺正式多用户使用
- 使用默认密码 `123456` 上线
- 不加 HTTPS 证书就长期暴露公网
- 不配置防火墙就直接开放 4280 端口
- 引入 Docker（对当前单进程场景收益低，除非后续加数据库）
