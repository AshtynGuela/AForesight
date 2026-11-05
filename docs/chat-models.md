# Choosing the chat assistant

Gayuma uses NVIDIA Nemotron through OpenRouter. Alon uses Groq. Choose either from the Assistant model dropdown inside chat. The choice is remembered in that browser. Conversation and pending confirmations continue when switching. Recent conversation and farm context are sent to the provider selected for the next message.

## Render setup

Open your existing Render service, then Environment. Add these values there. Keep keys out of Git and frontend code.

- `OPENROUTER_API_KEY`: your OpenRouter API key.
- `GROQ_API_KEY`: your Groq API key.
- `AGRIFORESIGHT_AI_ENABLED`: `1` to allow AI in the shared demo.
- `AGRIFORESIGHT_AI_PROVIDER`: `groq` or `openrouter`, the initial default.
- `AGRIFORESIGHT_OPENROUTER_MODEL`: `nvidia/nemotron-3.5-super-vl:free`.
- `AGRIFORESIGHT_GROQ_MODEL`: the exact Groq model ID available to your key, for example `openai/gpt-oss-20b` if your account supports it.

Save the environment settings and redeploy. Both provider-specific model settings are recommended. The older `AGRIFORESIGHT_CHAT_MODEL` setting applies only to the default provider when its provider-specific setting is empty. Use provider-specific settings to keep each model paired with its endpoint.

The model list exposes availability, never keys. Availability means the server has a key and AI is enabled; send a short message with each choice to check actual model access and quota. Errors stay visible so you can choose the other model and retry. There is no automatic provider switch.

The existing free Render service and SQLite setup are sufficient for this selector. No extra service is needed. Provider usage is subject to each account's limits and pricing. Local environment changes must also be entered into Render separately.

## Quick check

Open chat, choose Gayuma, and ask a farming question. Repeat with Alon. Then ask to change your crop and check the confirmation before saving. Switching assistants should preserve the conversation and the pending change.

The Nemotron free endpoint asks users to avoid confidential or personal data and may log inputs for service improvement. Use made-up farm details for this prototype. See https://openrouter.ai/nvidia/nemotron-3.5-super-vl:free .
