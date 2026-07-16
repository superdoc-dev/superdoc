# Agentic Slack Redlining

![screenshot](screenshot.png)

Insert suggestions into a DOCX with SuperDoc + Slack + Zapier 

## Setup Instructions

1. Import `zap.json` into your Zapier account
2. Deploy the `cloud-function` directory to Google Cloud Platform with the required environment variables
3. **Configure the imported Zap** - After importing, you'll need to authenticate connections and configure trigger settings in Zapier

The Zap requires additional configuration after import to function properly.

## Cloud Function Environment

Set these variables before deploying the `cloud-function` service:

| Variable | Required | Description |
|---|---:|---|
| `SLACK_REDLINING_ALLOWED_FILE_HOSTS` | Yes | Comma-separated list of exact hostnames the function may download DOCX files from. Set this to the hostname produced by the Zapier Storage public URL used by the imported Zap, for example `store.zapier.com`. The function rejects all downloads when this is missing. |
| `SLACK_REDLINING_MAX_DOWNLOAD_BYTES` | No | Maximum downloaded DOCX size in bytes. Defaults to `41943040`. |
| `SLACK_REDLINING_DOWNLOAD_TIMEOUT_MS` | No | Download timeout in milliseconds. Defaults to `15000`. |

The file download allowlist is intentionally fail-closed to prevent the webhook from being used as a generic URL fetcher. After importing the Zap, run one sample flow, inspect the generated `fileUrl` host, and configure that exact hostname in `SLACK_REDLINING_ALLOWED_FILE_HOSTS`.
