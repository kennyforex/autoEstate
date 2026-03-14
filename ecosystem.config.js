module.exports = {
  apps: [
    {
      name: 'ffcs-backend',
      cwd: '/var/www/ffcs/backend',
      script: 'dist/app.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: '/var/www/ffcs/logs/backend-error.log',
      out_file: '/var/www/ffcs/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
