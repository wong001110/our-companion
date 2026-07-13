# R2 security

The renderer cannot read R2 credentials, tokens, full asset roots, object keys, or presigned URLs. Electron Main obtains and immediately uses short-lived presigned URLs. Private R2 credentials are server environment variables only.
