/**
 * PM2 settings for the admin server (optional — see README in admin/scripts).
 * Gives the server time to finish open requests and page rebuilds when it is
 * restarted (src/server.js handles the shutdown signal).
 *
 *   pm2 delete tripreviewall-admin
 *   pm2 start ecosystem.config.js
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: "tripreviewall-admin",
      script: "src/server.js",
      cwd: __dirname,
      kill_timeout: 10000, // ms PM2 waits after SIGINT before force-killing (default 1600)
      wait_ready: true,    // server.js sends "ready" once it is listening
      listen_timeout: 15000,
    },
  ],
};
