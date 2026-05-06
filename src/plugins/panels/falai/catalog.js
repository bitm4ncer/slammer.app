// Curated fal.ai catalog — powerful image-to-image models.
// Each entry declares its own form schema. Field types are rendered by
// form-renderer.js. To add a model: copy an existing block, change the id,
// and adjust the fields list.
//
// Field types:
//   textarea   — multiline text. props: rows, placeholder
//   text       — single-line text. props: placeholder
//   image      — drop zone (layer / file). props: asArray (pass single URL as [url])
//   enum       — pillgroup. props: options (array of strings/numbers)
//   slider     — slider + readout. props: min, max, step
//   number     — numeric input. props: min, max, step
//   toggle     — boolean switch
//
// `outputPath` is a dot path inside the response that yields the array of
// image URLs. Default is 'images[].url'. Some models use { image: { url } }
// (single image) — they need outputPath: 'image.url'.

export const CATEGORIES = ['generate', 'edit', 'stylize', 'upscale', 'background'];

export const CATALOG = [
  // ---------- Generate (LoRA-based text-to-image) ----------
  {
    id: '90sbadtrip',
    endpoint: 'fal-ai/flux-lora',
    name: '90s Bad Trip',
    category: 'generate',
    cost: 0.035,
    description: 'Trippy 90s bad CGI aesthetic — melting chrome, neon grids, early 3D renders. LoRA by markredito.',
    fields: [
      { key: 'prompt', type: 'textarea', label: 'Prompt', required: true, placeholder: 'a melting chrome skull floating over a neon purple grid', rows: 3 },
      { key: 'image_url', type: 'image', label: 'Image (optional)', required: false },
      { key: 'strength', type: 'slider', label: 'Img Strength', min: 0, max: 1, step: 0.05, default: 0.85 },
      { key: 'lora_scale', type: 'slider', label: 'LoRA Strength', min: 0.5, max: 2, step: 0.1, default: 1.3 },
      { key: 'image_size', type: 'enum', label: 'Size', options: ['square_hd', 'landscape_4_3', 'landscape_16_9', 'portrait_4_3', 'portrait_16_9'], default: 'landscape_4_3' },
      { key: 'num_inference_steps', type: 'slider', label: 'Steps', min: 10, max: 50, step: 1, default: 28 },
      { key: 'guidance_scale', type: 'slider', label: 'Guidance', min: 1, max: 10, step: 0.1, default: 3.5 },
      { key: 'num_images', type: 'enum', label: 'Variants', options: [1, 2, 4], default: 1 },
      { key: 'output_format', type: 'enum', label: 'Format', options: ['png', 'jpeg'], default: 'png' },
    ],
    // The LoRA is hosted on HuggingFace. `prepareInput` injects the loras array
    // and auto-prepends the TRP90S trigger word so the user doesn't have to.
    // If an image is provided, switches to the img2img endpoint automatically.
    prepareInput(values) {
      const { lora_scale, strength, prompt, image_url, ...rest } = values;
      const trigger = 'TRP90S';
      const finalPrompt = prompt && !prompt.toUpperCase().includes(trigger)
        ? `${trigger} ${prompt}`
        : prompt;
      const loras = [{
        path: 'https://huggingface.co/markredito/90sbadtrip/resolve/main/lora.safetensors',
        scale: lora_scale ?? 1.3,
      }];
      // If an image was dropped, route to the img2img endpoint.
      if (image_url) {
        return {
          __endpoint: 'fal-ai/flux-lora/image-to-image',
          ...rest,
          prompt: finalPrompt,
          image_url,
          strength: strength ?? 0.85,
          loras,
        };
      }
      // Text-to-image — drop the unused img2img fields.
      return { ...rest, prompt: finalPrompt, loras };
    },
  },

  // ---------- Edit ----------
  {
    id: 'fal-ai/nano-banana/edit',
    name: 'nano-banana / edit',
    category: 'edit',
    cost: 0.039,
    description: "Google's nano-banana image edit. Strong at object swaps, additions, lighting changes.",
    fields: [
      { key: 'prompt', type: 'textarea', label: 'Prompt', required: true, placeholder: 'describe the edit', rows: 3 },
      { key: 'image_urls', type: 'image', label: 'Image', required: true, asArray: true },
      { key: 'num_images', type: 'enum', label: 'Variants', options: [1, 2, 4], default: 1 },
      { key: 'output_format', type: 'enum', label: 'Format', options: ['png', 'jpeg'], default: 'png' },
    ],
  },
  {
    id: 'fal-ai/nano-banana-pro/edit',
    name: 'nano-banana-pro / edit',
    category: 'edit',
    cost: 0.10,
    description: "Pro tier of nano-banana — sharper detail, better instruction following.",
    fields: [
      { key: 'prompt', type: 'textarea', label: 'Prompt', required: true, rows: 3 },
      { key: 'image_urls', type: 'image', label: 'Image', required: true, asArray: true },
      { key: 'num_images', type: 'enum', label: 'Variants', options: [1, 2, 4], default: 1 },
      { key: 'output_format', type: 'enum', label: 'Format', options: ['png', 'jpeg'], default: 'png' },
    ],
  },
  {
    id: 'fal-ai/flux-pro/kontext',
    name: 'flux-pro / kontext',
    category: 'edit',
    cost: 0.04,
    description: 'Flux Pro Kontext — context-aware image editing with strong identity preservation.',
    fields: [
      { key: 'prompt', type: 'textarea', label: 'Prompt', required: true, rows: 3 },
      { key: 'image_url', type: 'image', label: 'Image', required: true },
      { key: 'num_images', type: 'enum', label: 'Variants', options: [1, 2, 4], default: 1 },
      { key: 'aspect_ratio', type: 'enum', label: 'Aspect', options: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'], default: '1:1' },
      { key: 'guidance_scale', type: 'slider', label: 'Guidance', min: 1, max: 10, step: 0.1, default: 3.5 },
      { key: 'output_format', type: 'enum', label: 'Format', options: ['png', 'jpeg'], default: 'png' },
    ],
  },
  {
    id: 'fal-ai/flux-pro/kontext/max',
    name: 'flux-pro / kontext / max',
    category: 'edit',
    cost: 0.08,
    description: 'Highest-quality Kontext — slow, expensive, best output.',
    fields: [
      { key: 'prompt', type: 'textarea', label: 'Prompt', required: true, rows: 3 },
      { key: 'image_url', type: 'image', label: 'Image', required: true },
      { key: 'num_images', type: 'enum', label: 'Variants', options: [1, 2, 4], default: 1 },
      { key: 'aspect_ratio', type: 'enum', label: 'Aspect', options: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'], default: '1:1' },
      { key: 'guidance_scale', type: 'slider', label: 'Guidance', min: 1, max: 10, step: 0.1, default: 3.5 },
    ],
  },
  {
    id: 'fal-ai/seedream/v4/edit',
    name: 'seedream / v4 / edit',
    category: 'edit',
    cost: 0.05,
    description: 'ByteDance Seedream v4 image edit — cinematic, photo-realistic.',
    fields: [
      { key: 'prompt', type: 'textarea', label: 'Prompt', required: true, rows: 3 },
      { key: 'image_urls', type: 'image', label: 'Image', required: true, asArray: true },
      { key: 'num_images', type: 'enum', label: 'Variants', options: [1, 2, 4], default: 1 },
    ],
  },
  {
    id: 'fal-ai/qwen-image-edit',
    name: 'qwen / image-edit',
    category: 'edit',
    cost: 0.03,
    description: 'Alibaba Qwen image edit — strong with text and layout edits.',
    fields: [
      { key: 'prompt', type: 'textarea', label: 'Prompt', required: true, rows: 3 },
      { key: 'image_url', type: 'image', label: 'Image', required: true },
      { key: 'num_inference_steps', type: 'slider', label: 'Steps', min: 10, max: 50, step: 1, default: 30 },
      { key: 'guidance_scale', type: 'slider', label: 'Guidance', min: 1, max: 10, step: 0.1, default: 4 },
    ],
  },
  {
    id: 'fal-ai/gemini-flash-edit',
    name: 'gemini / flash-edit',
    category: 'edit',
    cost: 0.039,
    description: 'Google Gemini Flash image edit — fast, instruction-following.',
    fields: [
      { key: 'prompt', type: 'textarea', label: 'Prompt', required: true, rows: 3 },
      { key: 'image_urls', type: 'image', label: 'Image', required: true, asArray: true },
    ],
  },
  {
    id: 'fal-ai/ideogram/v3/reframe',
    name: 'ideogram / v3 / reframe',
    category: 'edit',
    cost: 0.06,
    description: 'Ideogram v3 reframe / outpaint — extend image to a new aspect.',
    fields: [
      { key: 'image_url', type: 'image', label: 'Image', required: true },
      { key: 'image_size', type: 'enum', label: 'Size', options: ['square_hd', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'], default: 'square_hd' },
      { key: 'rendering_speed', type: 'enum', label: 'Speed', options: ['TURBO', 'BALANCED', 'QUALITY'], default: 'BALANCED' },
    ],
  },

  // ---------- Stylize ----------
  {
    id: 'fal-ai/recraft/v3/image-to-image',
    name: 'recraft / v3 / i2i',
    category: 'stylize',
    cost: 0.04,
    description: 'Recraft v3 image-to-image with strong style control.',
    fields: [
      { key: 'prompt', type: 'textarea', label: 'Prompt', required: true, rows: 3 },
      { key: 'image_url', type: 'image', label: 'Image', required: true },
      { key: 'strength', type: 'slider', label: 'Strength', min: 0, max: 1, step: 0.05, default: 0.6 },
      { key: 'style', type: 'enum', label: 'Style', options: ['any', 'realistic_image', 'digital_illustration', 'vector_illustration'], default: 'any' },
    ],
  },
  {
    id: 'fal-ai/photomaker',
    name: 'photomaker',
    category: 'stylize',
    cost: 0.04,
    description: 'PhotoMaker — face-conditioned generation. Reference image of a person.',
    fields: [
      { key: 'prompt', type: 'textarea', label: 'Prompt', required: true, placeholder: 'a photo of a person, cinematic, 35mm', rows: 3 },
      { key: 'image_archive_url', type: 'image', label: 'Reference', required: true },
      { key: 'style_name', type: 'enum', label: 'Style', options: ['(No style)', 'Cinematic', 'Disney Character', 'Photographic', 'Comic book', 'Line art'], default: '(No style)' },
      { key: 'num_images', type: 'enum', label: 'Variants', options: [1, 2, 4], default: 1 },
    ],
  },
  {
    id: 'fal-ai/face-to-many',
    name: 'face-to-many',
    category: 'stylize',
    cost: 0.03,
    description: 'Stylize a face into another medium — 3D, emoji, clay, pixels.',
    fields: [
      { key: 'image_url', type: 'image', label: 'Image', required: true },
      { key: 'style', type: 'enum', label: 'Style', options: ['3D', 'Emoji', 'Video game', 'Pixels', 'Clay', 'Toy'], default: '3D' },
      { key: 'prompt_strength', type: 'slider', label: 'Strength', min: 0, max: 1, step: 0.05, default: 0.6 },
    ],
  },

  // ---------- Upscale ----------
  {
    id: 'fal-ai/clarity-upscaler',
    name: 'clarity-upscaler',
    category: 'upscale',
    cost: 0.05,
    description: 'Creative upscaler — adds detail, can hallucinate. Slow but stunning.',
    fields: [
      { key: 'image_url', type: 'image', label: 'Image', required: true },
      { key: 'prompt', type: 'textarea', label: 'Prompt (optional)', placeholder: 'optional guidance', rows: 2 },
      { key: 'upscale_factor', type: 'slider', label: 'Scale', min: 1, max: 4, step: 0.5, default: 2 },
      { key: 'creativity', type: 'slider', label: 'Creativity', min: 0, max: 1, step: 0.05, default: 0.35 },
      { key: 'resemblance', type: 'slider', label: 'Resemblance', min: 0, max: 3, step: 0.1, default: 0.6 },
    ],
  },
  {
    id: 'fal-ai/aura-sr',
    name: 'aura-sr',
    category: 'upscale',
    cost: 0.01,
    description: 'AuraSR — fast 4× upscaler. No prompt needed.',
    fields: [
      { key: 'image_url', type: 'image', label: 'Image', required: true },
      { key: 'upscaling_factor', type: 'enum', label: 'Scale', options: [4], default: 4 },
    ],
  },

  // ---------- Background ----------
  {
    id: 'fal-ai/birefnet',
    name: 'birefnet — remove bg',
    category: 'background',
    cost: 0.005,
    description: 'High-precision background removal.',
    fields: [
      { key: 'image_url', type: 'image', label: 'Image', required: true },
    ],
    outputPath: 'image.url',
  },
  {
    id: 'fal-ai/imageutils/rembg',
    name: 'rembg — remove bg (fast)',
    category: 'background',
    cost: 0.003,
    description: 'Faster background removal — slightly less precise than BiRefNet.',
    fields: [
      { key: 'image_url', type: 'image', label: 'Image', required: true },
    ],
    outputPath: 'image.url',
  },
];

export function findModel(id) { return CATALOG.find((m) => m.id === id) || null; }

// Cost is approximate (fal.ai pricing varies by resolution/steps). Formatted
// without trailing zeros to read tightly: $0.04, $0.005, $0.10.
export function formatCost(cost) {
  if (typeof cost !== 'number' || cost <= 0) return '';
  if (cost < 0.01) return `~$${cost.toFixed(3)}`;
  return `~$${cost.toFixed(2)}`;
}
