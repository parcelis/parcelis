UPDATE "User"
SET "passwordHash" = '$argon2id$v=19$m=19456,p=1,t=2$KFTPAJcnuQSlFtJRgSsKUg$bziqbLlXskTv51iEQHzRDswrwPCYiV4q+dXcdqcFKZM',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "email" = 'admin@parcelis.dev';
