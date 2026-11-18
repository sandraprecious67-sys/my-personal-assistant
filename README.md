# Personal AI Assistant

A small, local-first assistant you can shape yourself. It includes saved conversations, custom instructions, and a private library of text notes and documents that can be searched directly or used as relevant context in a chat. The workspace runs without an AI model or API key. Connect a model later for generated replies; any hosted provider credentials are kept on the local server and never sent to the browser.

## Run it

Requires Node.js 18 or newer; there are no package dependencies.

```powershell
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Conversations, instructions, and uploaded files are stored in `.data/` in this folder and are excluded from Git.

## Optional: connect an AI model

You can use the workspace without this step: conversations are saved, files can be uploaded and searched, and your instructions are stored locally. To add generated replies from an OpenAI-compatible hosted provider, set its key in the server environment before starting the app:

```powershell
$env:OPENAI_API_KEY = "your-provider-api-key"
npm start
```

The default hosted model is `gpt-4o-mini`. To choose another model or provider, set `OPENAI_MODEL` and optionally `OPENAI_BASE_URL` (the provider's API root, default `https://api.openai.com/v1`). You can also point `OPENAI_BASE_URL` at a compatible model running on your own computer; loopback local providers do not require a hosted API key. Never put keys in frontend files or commit them.

## Use your library

Upload `.txt`, `.md`, `.csv`, and `.json` files up to 1 MB each. Use the Library search field to find passages; when you chat, matching passages are included as reference context and their filenames appear below the assistant's reply. Remove a file from the Library to delete it from the local data store.

## Customize

Choose **Customize assistant** to set persistent instructions for response style and preferences. The app does not train a model; these instructions and relevant saved excerpts are sent with each model request.

## Development

```powershell
npm run dev
npm test
```

This MVP intentionally does not have broad filesystem access or execute tools. Future integrations should be added as explicit, user-approved extensions.
