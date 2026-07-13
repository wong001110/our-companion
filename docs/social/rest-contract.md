# Desktop REST use

Main Process owns profile, pack, upload and download calls. Upload/download URL requests are capped at 50 files; transfer concurrency is three with bounded retries. Renderer sees progress and typed results, not bearer URLs.
