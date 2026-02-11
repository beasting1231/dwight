export const MODELS = {
  anthropic: [
    { name: 'Claude Opus 4.6 (Most intelligent)', value: 'claude-opus-4-6', pricing: '$5/$25 per MTok' },
    { name: 'Claude Sonnet 4.5 (Fast + smart)', value: 'claude-sonnet-4-5', pricing: '$3/$15 per MTok' },
    { name: 'Claude Haiku 4.5 (Fastest)', value: 'claude-haiku-4-5', pricing: '$1/$5 per MTok' },
    { name: 'Claude Opus 4.5 (Legacy)', value: 'claude-opus-4-5-20251101', pricing: '$5/$25 per MTok' },
    { name: 'Claude Sonnet 4 (Legacy)', value: 'claude-sonnet-4-20250514', pricing: '$3/$15 per MTok' },
  ],
  openrouter: [
    { name: 'Gemini 2.5 Flash (Latest)', value: 'google/gemini-2.5-flash', pricing: '$0.3/$2.5 per MTok' },
    { name: 'Gemini 2.0 Flash Exp (Free) ⚡', value: 'google/gemini-2.0-flash-exp:free', pricing: 'Free' },
    { name: 'Claude 3.5 Sonnet', value: 'anthropic/claude-3.5-sonnet', pricing: '$3/$15 per MTok' },
    { name: 'Claude 3 Opus', value: 'anthropic/claude-3-opus', pricing: '$15/$75 per MTok' },
    { name: 'Claude 3 Haiku', value: 'anthropic/claude-3-haiku', pricing: '$0.25/$1.25 per MTok' },
    { name: 'GPT-4o', value: 'openai/gpt-4o', pricing: '$2.5/$10 per MTok' },
    { name: 'GPT-4o Mini', value: 'openai/gpt-4o-mini', pricing: '$0.15/$0.6 per MTok' },
    { name: 'DeepSeek V3', value: 'deepseek/deepseek-chat', pricing: '$0.27/$1.1 per MTok' },
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

  if (name.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
  if (name.includes('gemini-2.0-flash')) return 'Gemini 2.0 Flash';
  if (name.includes('claude-3.5-sonnet') || name.includes('claude-sonnet-4')) return 'Claude 3.5 Sonnet';
  if (name.includes('claude-3-opus') || name.includes('claude-opus-4')) return 'Claude Opus';
  if (name.includes('claude-3-haiku') || name.includes('claude-haiku-4')) return 'Claude Haiku';
  if (name.includes('gpt-4o-mini')) return 'GPT-4o Mini';
  if (name.includes('gpt-4o')) return 'GPT-4o';
  if (name.includes('deepseek')) return 'DeepSeek V3';
  if (name.includes('llama-3.3')) return 'Llama 3.3 70B';

  return name.substring(0, 20);
}
