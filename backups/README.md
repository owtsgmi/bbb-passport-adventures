# Encrypted Supabase backups

These files are AES-256 encrypted PostgreSQL custom-format dumps.

They cannot be restored without the separately stored BACKUP_ENCRYPTION_KEY.
Never commit the database URL or encryption key to this repository.

Restore outline:
1. Decrypt with OpenSSL AES-256-CBC + PBKDF2, 200000 iterations.
2. Restore the decrypted custom dump with pg_restore.
