export const MODELS = {
  anthropic: [
    { name: 'Claude Opus 4.6 (Most intelligent)', value: 'claude-opus-4-6', pricing: '$5/$25 per MTok' },
    { name: 'Claude Sonnet 4.5 (Fast + smart)', value: 'claude-sonnet-4-5', pricing: '$3/$15 per MTok' },
    { name: 'Claude Haiku 4.5 (Fastest)', value: 'claude-haiku-4-5', pricing: '$1/$5 per MTok' },
    { name: 'Claude Opus 4.5 (Legacy)', value: 'claude-opus-4-5-20251101', pricing: '$5/$25 per MTok' },
    { name: 'Claude Sonnet 4 (Legacy)', value: 'claude-sonnet-4-20250514', pricing: '$3/$15 per MTok' },
  ],
  openrouter: [
    { name: 'Gemini 2.0 Flash (Google) ⚡', value: 'google/gemini-2.0-flash-001', pricing: '$0.1/$0.4 per MTok' },
    { name: 'Gemini 2.0 Flash Lite (Google)', value: 'google/gemini-2.0-flash-lite-001', pricing: 'Free' },
    { name: 'Claude Opus 4.6 (Anthropic)', value: 'anthropic/claude-opus-4.6', pricing: '$5/$25 per MTok' },
    { name: 'Claude Sonnet 4.5 (Anthropic)', value: 'anthropic/claude-sonnet-4.5', pricing: '$3/$15 per MTok' },
    { name: 'GPT-5.2 Pro (OpenAI)', value: 'openai/gpt-5.2-pro', pricing: '$21/$168 per MTok' },
    { name: 'GPT-5.1 (OpenAI)', value: 'openai/gpt-5.1', pricing: '$1.25/$10 per MTok' },
    { name: 'Gemini 3 Pro (Google)', value: 'google/gemini-3-pro-preview', pricing: '$2/$12 per MTok' },
    { name: 'DeepSeek V3.2 (Budget)', value: 'deepseek/deepseek-v3.2', pricing: '$0.25/$0.38 per MTok' },
    { name: 'Mistral Large 2512', value: 'mistralai/mistral-large-2512', pricing: '$0.5/$1.5 per MTok' },
    { name: 'Qwen3 Coder Next', value: 'qwen/qwen3-coder-next', pricing: '$0.07/$0.3 per MTok' },
    { name: 'Llama 3.3 70B (Free)', value: 'meta-llama/llama-3.3-70b-instruct:free', pricing: 'Free' },
  ]
};

/**
 * Check if a model supports vision/image input
 */
export function supportsVision(model) {
  if (!model) return false;
  const name = model.toLowerCase();

  // Models that support vision
  if (name.includes('claude')) return true;
  if (name.includes('gemini')) return true;
  if (name.includes('gpt-4') || name.includes('gpt-5')) return true;

  // Models that don't support vision
  // deepseek, mistral, qwen, llama - text only
  return false;
}

export function getModelShortName(model) {
  if (!model) return 'Not set';
  const parts = model.split('/');
  const name = parts[parts.length - 1];

  if (name.includes('gemini-2.0-flash-lite')) return 'Gemini 2.0 Lite';
  if (name.includes('gemini-2.0-flash')) return 'Gemini 2.0 Flash';
  if (name.includes('gemini-3')) return 'Gemini 3 Pro';
  if (name.includes('claude-opus')) return 'Claude Opus';
  if (name.includes('claude-sonnet')) return 'Claude Sonnet';
  if (name.includes('claude-haiku')) return 'Claude Haiku';
  if (name.includes('gpt-5.2')) return 'GPT-5.2 Pro';
  if (name.includes('gpt-5')) return 'GPT-5.1';
  if (name.includes('deepseek')) return 'DeepSeek';
  if (name.includes('mistral')) return 'Mistral Large';
  if (name.includes('qwen')) return 'Qwen3 Coder';
  if (name.includes('llama')) return 'Llama 3.3';

  return name.substring(0, 20);
}
