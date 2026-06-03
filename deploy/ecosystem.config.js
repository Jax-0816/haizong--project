// ============================================================
// 海哥内容工作台 — PM2 进程管理配置（备选方案）
// ============================================================
// 启动：pm2 start deploy/ecosystem.config.js
// 保存：pm2 save
// 自启：pm2 startup
// 查看：pm2 status
// 日志：pm2 logs haizong-workbench
// ============================================================

module.exports = {
  apps: [
    {
      name: "haizong-workbench",
      script: "server/prod.mjs",
      cwd: "/opt/haizong-workbench",
      instances: 1,              // 单实例（文件存储不支持多进程并发写）
      exec_mode: "fork",
      autorestart: true,
      watch: false,              // 不自动监听文件变更，手动部署
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      // 日志配置
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/opt/haizong-workbench/logs/error.log",
      out_file: "/opt/haizong-workbench/logs/out.log",
      merge_logs: true,
      max_size: "10M",
      retain: 7,
    },
  ],
};
