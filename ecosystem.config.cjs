/** PM2 process config for stormtrackertool.com VPS */
module.exports = {
  apps: [
    {
      name: "stormtrackertool",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        APP_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
