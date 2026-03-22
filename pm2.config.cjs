/**
 * PM2 Ecosystem Config — Ottomate
 *
 * Start all services:   pm2 start pm2.config.cjs
 * Stop all:             pm2 stop all
 * Restart all:          pm2 restart all
 * Live logs:            pm2 logs
 * Status dashboard:     pm2 monit
 * Persist across reboot: pm2 save && pm2 startup
 */

const path = require('path');
const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'next',
      cwd: root,
      script: 'node_modules/.bin/next',
      args: 'dev',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: { NODE_ENV: 'development', PORT: 3000 },
    },
    {
      name: 'bolt-diy',
      cwd: path.join(root, 'bolt-diy'),
      script: 'pnpm',
      args: 'run dev',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: { NODE_ENV: 'development' },
    },
    {
      name: 'blockbench',
      cwd: path.join(root, 'blockbench'),
      script: 'node',
      args: './build.js --target=web --serve',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: { NODE_ENV: 'development' },
    },
    {
      name: 'opendaw',
      cwd: path.join(root, 'opendaw'),
      script: 'npm',
      args: 'run dev:studio',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: { NODE_ENV: 'development' },
    },
    {
      name: 'code-server-proxy',
      cwd: root,
      script: 'scripts/code-server-proxy.mjs',
      interpreter: 'node',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: { NODE_ENV: 'development' },
    },
  ],
};
