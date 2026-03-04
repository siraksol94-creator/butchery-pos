module.exports = {
  apps: [
    {
      name: 'butchery-vps',
      script: 'server.js',
      cwd: '/var/www/butchery/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        // VPS_URL not needed on the VPS itself — only used by device sync clients
      },
    },
  ],
};
