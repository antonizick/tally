# Tally Backup, Restore & Factory Reset — User Guide

## Overview

Tally provides three essential data management features to help you protect your financial information:

1. **Backup** — Create complete snapshots of all your data
2. **Restore** — Recover your data from a previously saved backup
3. **Factory Reset** — Completely wipe the database and start fresh with sample data

All three features are accessible from the **Administration** tab in Settings.

---

## Backup: Creating a Data Snapshot

### What Gets Backed Up

A complete backup includes:
- All accounts (checking, savings, credit cards, investment accounts, etc.)
- Every transaction ever imported
- All transaction categories and tags
- Budget snapshots and net worth history
- Stock/ETF holdings
- All settings and configuration

**Note:** The backup does NOT include the database analysis cache (DuckDB). This is derived data that's automatically regenerated if needed.

### How to Create a Backup

1. Open **Settings** (gear icon in the sidebar)
2. Click the **Administration** tab
3. In the **Backup** card, click **Create Backup**
4. Wait for the backup to complete (usually 5-30 seconds depending on data size)
5. You'll see a confirmation with:
   - The backup filename (e.g., `tally_backup_20260520_143022.tar.gz`)
   - File size in KB or MB
   - Timestamp when it was created
6. Click **Download** to save the `.tar.gz` file to your computer

### Backup File Format

The backup is a single `.tar.gz` file containing:
- `manifest.json` — metadata and checksums to verify integrity
- `json/` directory — all 15 tables exported as JSON files
- `sql/` directory — a complete SQLite dump as plain SQL

This dual format means you can:
- Restore from JSON files (recommended for reliability)
- Restore from the SQL dump if needed (for advanced recovery)

### Where to Store Backups

**Recommendation:** Keep backups in at least 2 separate locations:

1. **Local external drive** — USB drive or external SSD for physical backup
2. **Cloud storage** — Google Drive, Dropbox, iCloud, or similar for off-site protection
3. **NAS or home server** (optional) — if you have one

This protects against:
- Computer hardware failure
- Accidental deletion
- Malware or ransomware attacks

### How Often to Back Up

- **Weekly** if you add transactions regularly
- **Monthly** if you use Tally infrequently
- **Before major changes** (bulk imports, category restructuring, etc.)
- **After completing a financial milestone** (tax year data, budget reconciliation, etc.)

---

## Restore: Recovering Your Data

### When to Restore

Use restore when:
- You've lost data due to accidental deletion
- Your database became corrupted
- You want to revert to an earlier state
- You're moving to a new computer

### How to Restore

1. Open **Settings** (gear icon)
2. Click the **Administration** tab
3. In the **Restore** card, click **Choose .tar.gz file**
4. Select your backup file from your computer
5. Click **Restore from Backup**
6. A confirmation dialog will appear warning that all current data will be replaced
7. Click **Restore** to proceed
8. Wait for the restore to complete (usually 5-30 seconds)
9. You'll see a success message confirming the data has been recovered

### What Happens During Restore

- ✓ All current data is deleted
- ✓ Data from the backup is imported into the database
- ✓ All checksums are verified to ensure data integrity
- ✓ The app automatically reloads with restored data
- ✓ If restore fails for any reason, your database is left unchanged

### Restore Formats Supported

Tally can restore from:
- **JSON format** (recommended) — extracted automatically from the backup
- **SQL dump format** — automatically detected and applied if JSON files are not present

You don't need to do anything — Tally detects the format and uses the appropriate method.

---

## Factory Reset: Starting Fresh

### What Factory Reset Does

A factory reset:
1. Permanently deletes ALL your data (accounts, transactions, categories, everything)
2. Re-seeds the database with:
   - 15 standard transaction categories (Income, Housing, Food, etc.)
   - 6 standard tags (Nick, Emma, Family, Work, Cat Stuff, Subscriptions)
   - 7 pre-built net worth views
   - **Sample data** for reference:
     - 6 sample accounts (checking, savings, credit card, brokerage, 401k, home)
     - 6 stock holdings (VTI, VXUS, BND, AAPL, MSFT, SPY)
     - 1 snapshot dated May 19, 2026 with realistic asset/liability values
     - 6 sample transactions showing typical spending patterns

**⚠️ WARNING:** This action is permanent and cannot be undone without a backup.

### When to Use Factory Reset

- You want to practice using Tally before importing real data
- You're starting fresh and want sample data as a reference
- You want to completely clean the database for testing
- You're giving Tally to someone else and want to clear all personal data

### How to Factory Reset

1. Open **Settings**
2. Click the **Administration** tab
3. In the **Factory Reset** card, click **Reset to Factory Defaults**
4. **First confirmation dialog:**
   - "This will permanently erase ALL data. Are you sure?"
   - Click **Cancel** to abort, or **Continue** to proceed
5. **Second confirmation dialog:**
   - Shows a text input box
   - Type the word **RESET** (all caps) to confirm
   - The **Reset** button is disabled until you type it correctly
6. Click **Reset**
7. Wait for the operation to complete
8. The app reloads with fresh data and sample accounts

---

## FAQ & Troubleshooting

### Q: What if restore fails?

**A:** If restore fails (due to corrupted file, network error, etc.), your current database is left unchanged. You can:
1. Try restoring again with the same backup file
2. Try a different backup file if available
3. Use the **Factory Reset** to get back to a known state
4. Contact support with the error message

### Q: Can I restore an old backup on top of a new one?

**A:** Yes. When you restore, all current data is replaced with data from the backup file you select. It doesn't matter if you're restoring an old backup or a recent one.

### Q: How large are typical backups?

**A:** For Tally:
- **Empty database:** ~100 KB
- **Small database** (< 5K transactions): ~500 KB - 1 MB
- **Medium database** (5K - 50K transactions): ~1 - 5 MB
- **Large database** (> 50K transactions): ~5 - 50 MB

Compressed `.tar.gz` files are typically 20-30% of the uncompressed size.

### Q: Can I manually extract and edit a backup file?

**A:** Technically yes, but not recommended. The backup uses SHA-256 checksums to verify integrity. If you manually edit files, the checksums won't match and restore will fail with a checksum error.

For manual recovery or emergency access, see the Technical Reference guide.

### Q: What if I forget to back up before making changes?

**A:** If you accidentally delete data:
1. Don't make more changes (close Tally if possible)
2. If you have a recent backup, restore from it
3. Manually re-enter recent transactions if needed

**Prevention:** Enable automatic backups (see: Technical Reference).

### Q: Can I store backups in the cloud?

**A:** Yes! Backups are standard `.tar.gz` files. You can:
- Upload to Google Drive, Dropbox, OneDrive, iCloud
- Email to yourself (if file size permits)
- Store on cloud-based backup services (Backblaze, Carbonite, etc.)
- Keep on a NAS or network drive

Just remember to download/download the file before restoring.

### Q: How do I know if a backup is valid?

**A:** During restore, Tally automatically verifies:
1. The file is a valid `.tar.gz` archive
2. All expected files are present (manifest.json, all JSON tables, SQL dump)
3. SHA-256 checksums match the manifest
4. JSON is valid and parseable

If any check fails, you'll see an error message and restore will not proceed. A failed checksum usually means the file was corrupted during download/storage.

### Q: Can I use backups from older versions of Tally?

**A:** Yes. Backups are version-independent. A backup from Tally v0.1.0 can be restored in any future version (as long as you're running a version that supports restore).

### Q: What if the Factory Reset sample data conflicts with my real data?

**A:** It won't — Factory Reset deletes everything first. All sample data is just reference material. Once you start importing your real data, the samples don't interfere.

---

## Workflow Examples

### Example 1: Weekly Backup Routine

Every Sunday evening:
1. Open Tally → Settings → Administration
2. Click **Create Backup**
3. Wait for confirmation
4. Download the file
5. Upload to Google Drive or copy to external drive

**Time required:** ~5 minutes

### Example 2: Recovering After Data Loss

Your computer crashes and you've lost data:
1. Download Tally again
2. Open Settings → Administration → Restore
3. Select your most recent backup file
4. Click **Restore from Backup**
5. Confirm the 2-step confirmation
6. Your data is restored and ready to use

**Time required:** ~5 minutes

### Example 3: Starting Fresh

You want to restart Tally and clear all data:
1. Open Settings → Administration → Reset
2. Confirm you want to reset (twice)
3. Database is wiped and re-seeded with sample data
4. Begin importing your real data fresh

**Time required:** ~1 minute

---

## Best Practices

✓ **DO:**
- Create backups regularly (weekly or monthly)
- Store backups in multiple locations (local + cloud)
- Test restores occasionally to confirm they work
- Label backups with dates (e.g., `Tally_backup_2026-05-20`)
- Back up before major changes (bulk imports, restructuring)
- Keep your latest 3-4 backups (in case most recent is corrupted)

✗ **DON'T:**
- Rely on a single backup location
- Delete backup files without keeping a copy elsewhere
- Manually edit backup files before restoring
- Store backups only on the same computer as your database
- Forget about backups until disaster strikes

---

## Support & Further Help

For technical questions about backup/restore internals, see: **backup-restore-technical-reference.md**

For other issues:
- Check the Tally logs (in `~/.tally/logs/` if available)
- Review this guide's Troubleshooting section
- Consult the main Tally documentation

---

**Last updated:** May 2026  
**Version:** Tally 0.1.0
