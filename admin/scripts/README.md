# Database backups

## Automatic daily backup (cron)

Set it up once on the server as the `deploy` user:

```
crontab -e
```

Add this line:

```
0 3 * * * /home/deploy/tripreviewall/admin/scripts/backup-db.sh >> /home/deploy/tripreviewall-backups/backup.log 2>&1
```

- Backups go to `~/tripreviewall-backups/` as `tripreviewall-YYYY-MM-DD_HH-MM-SS.sql.gz`. Backups older than 14 days are deleted.
- Every backup is checked after it is written. A broken or empty file is removed, and the run fails loudly in `backup.log`.

## Keep a copy off the server

A backup that sits on the same disk as the database is lost together with the server. You have two ways to keep a copy elsewhere:

- **Automatic copy to another server.** Put the destination in front of the cron command:

  ```
  0 3 * * * TRIPREVIEWALL_BACKUP_REMOTE="user@backup-host:/backups/tripreviewall/" /home/deploy/tripreviewall/admin/scripts/backup-db.sh >> /home/deploy/tripreviewall-backups/backup.log 2>&1
  ```

  This needs SSH-key login from the VPS to that host.
- **Manual download to your Windows PC.** Run this in PowerShell from time to time (weekly, for example):

  ```
  scp deploy@144.202.120.161:~/tripreviewall-backups/*.sql.gz D:\tripreviewall-backups\
  ```

## Restore

```
cd ~/tripreviewall/admin/scripts
./restore-db.sh
./restore-db.sh ~/tripreviewall-backups/tripreviewall-2026-10-04_03-00-00.sql.gz
pm2 restart tripreviewall-admin
```

The first command lists the available backups. The second restores the one you name.

- The restore asks you to type `yes`. It first saves the current database as `tripreviewall-before-restore-….sql.gz`, so a wrong restore can be undone.
- It runs as a single transaction: either the whole backup is loaded, or nothing changes.
