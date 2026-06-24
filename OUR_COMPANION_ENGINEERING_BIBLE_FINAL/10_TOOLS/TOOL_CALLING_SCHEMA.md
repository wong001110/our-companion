# Tool Calling Schema

## Allowed tools

### open_url
```json
{
  "url": "https://example.com"
}
```

### open_app
```json
{
  "appName": "Chrome"
}
```

### search_web
```json
{
  "query": "PixiJS Spine tutorial",
  "target": "google|youtube|github"
}
```

### browser_navigation
```json
{
  "action": "open_tab|go_back|go_forward|reload",
  "url": "optional"
}
```

## Blocked in v1
- payment
- delete data
- send message
- submit forms
- login automation
- credential handling
