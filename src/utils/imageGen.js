/**
 * generatePanelImage
 *
 * Routes to the correct provider/endpoint based on model ID.
 * Returns { imageUrl, interactionId } for all providers.
 *
 * For Gemini models:
 *   1. Tries the Interactions API (multi-turn editing support)
 *   2. Falls back to generateContent if Interactions API fails or returns no image
 *
 * interactionId is non-null when the Interactions API succeeds, enabling
 * multi-turn editing on subsequent calls via previous_interaction_id.
 */

// --- Size -> aspect ratio ----------------------------------------
const SIZE_TO_ASPECT = {
  '1024x1024': '1:1',
  '1024x1536': '3:4',
  '1536x1024': '4:3',
  '1024x1792': '9:16',
  '1792x1024': '16:9',
  '512x512':   '1:1',
}
function toAspect(size) {
  if (size && !size.includes('x')) return size   // already '3:4' etc.
  return SIZE_TO_ASPECT[size] ?? '3:4'
}

const ASPECT_TO_GENERATE_CONTENT_ENUM = {
  '1:1': 'ASPECT_RATIO_ONE_BY_ONE',
  '2:3': 'ASPECT_RATIO_TWO_BY_THREE',
  '3:2': 'ASPECT_RATIO_THREE_BY_TWO',
  '3:4': 'ASPECT_RATIO_THREE_BY_FOUR',
  '4:3': 'ASPECT_RATIO_FOUR_BY_THREE',
  '4:5': 'ASPECT_RATIO_FOUR_BY_FIVE',
  '5:4': 'ASPECT_RATIO_FIVE_BY_FOUR',
  '9:16': 'ASPECT_RATIO_NINE_BY_SIXTEEN',
  '16:9': 'ASPECT_RATIO_SIXTEEN_BY_NINE',
  '21:9': 'ASPECT_RATIO_TWENTY_ONE_BY_NINE',
}

const IMAGE_SIZE_TO_GENERATE_CONTENT_ENUM = {
  '512': 'IMAGE_SIZE_FIVE_TWELVE',
  '1K': 'IMAGE_SIZE_ONE_K',
  '2K': 'IMAGE_SIZE_TWO_K',
  '4K': 'IMAGE_SIZE_FOUR_K',
}

function toGenerateContentAspect(size) {
  return ASPECT_TO_GENERATE_CONTENT_ENUM[toAspect(size)] ?? 'ASPECT_RATIO_THREE_BY_FOUR'
}

function toGenerateContentImageSize(imageResolution) {
  return IMAGE_SIZE_TO_GENERATE_CONTENT_ENUM[imageResolution] ?? 'IMAGE_SIZE_ONE_K'
}

// --- Shot/perspective -> concrete framing instruction -------------
// Panels carry a "perspective" field (chosen by the AI or picked manually
// in the panel editor), but it used to be display-only UI state — it never
// reached the image model. This maps it to an explicit framing line.
const PERSPECTIVE_FRAMING = {
  'close-up':      "tight framing on the subject's face and upper body, filling most of the frame",
  'medium-shot':   'framing from roughly the waist up, a balanced view of the subject and immediate surroundings',
  'wide-shot':     'wide framing showing the full subject and their surroundings',
  "bird's-eye":    'camera looking straight down from above',
  "worm's-eye":    'camera looking sharply up from below',
  'over-shoulder': "framed from behind one subject's shoulder, looking toward the other subject or action",
  'dutch-angle':   'camera tilted off the horizontal for tension or unease',
  'establishing':  'wide environmental shot establishing the location, with subjects small within the setting',
}

function describePerspective(perspective) {
  const framing = PERSPECTIVE_FRAMING[perspective]
  return framing ? `Shot: ${perspective} - ${framing}.` : ''
}

// --- Global style -> flat text used both in prompts and in the UI ---
export function formatGlobalStyle(globalStyle = {}) {
  return Object.entries(globalStyle)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
}

// --- Default prompt prefilled when a new character look is created --
export function getDefaultLookPrompt(globalStyle = {}) {
  const styleText = formatGlobalStyle(globalStyle)
  return `Generate a front view and a back view of this character${styleText ? `, in this style: ${styleText}` : ''}. Use the attached reference images to keep the character's face, body, and outfit consistent.`
}

// --- Default prompt for a character's base reference portrait -------
export function getDefaultCharacterPortraitPrompt(character = {}) {
  return [
    `Character reference portrait of ${character.name || 'the character'}.`,
    character.description?.trim() || '',
    'Bust-up portrait, plain neutral background, clear well-lit view of the face and outfit, suitable as a consistent visual reference to reuse across many comic panels.',
  ].filter(Boolean).join(' ')
}

// --- Build enriched text prompt ----------------------------------
function buildPrompt({ prompt, globalStyle, characters, styleReferences, imageReferences, referencePrompt, perspective }) {
  const styleCtx = formatGlobalStyle(globalStyle)

  const hasCharacterRefs = imageReferences.some(ref => ref.type === 'character')
  const charContext = characters.length
    ? [
        `Characters in this scene: ${characters
          .map(c => c.description ? `${c.name} (${c.description})` : c.name)
          .join('; ')}.`,
        hasCharacterRefs
          ? "Follow each character's attached reference image for their appearance (face, body, outfit, and colors) — keep it consistent and do not change it unless explicitly instructed otherwise in this prompt."
          : '',
      ].filter(Boolean).join(' ')
    : ''

  const styleRefLabels = styleReferences
    .filter(r => r.name && r.name !== 'Reference')
    .map(r => r.name)
    .join(', ')

  const refLabels = imageReferences
    .map(r => r.name)
    .filter(Boolean)
    .join(', ')

  const refContext = imageReferences.length
    ? [
        `Use the attached reference image${imageReferences.length === 1 ? '' : 's'} for visual guidance${refLabels ? `: ${refLabels}` : ''}.`,
        referencePrompt?.trim()
          ? `Reference instructions: ${referencePrompt.trim()}.`
          : 'No extra reference instructions were provided, so use the attached image references as visual reference only.',
      ].join(' ')
    : ''

  return [
    styleCtx       ? `Art style - ${styleCtx}.`                    : '',
    describePerspective(perspective),
    styleRefLabels ? `Visual style inspired by: ${styleRefLabels}.` : '',
    charContext,
    refContext,
    prompt.trim(),
    'Comic book panel artwork. No speech bubbles, no thought bubbles, no captions, no text or lettering of any kind in the image.',
  ].filter(Boolean).join(' ')
}

function dataUrlToInlineData(url) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(url ?? '')
  if (!match) return null
  return {
    inlineData: {
      mimeType: match[1],
      data: match[2],
    },
  }
}

function normalizeImageReferences(refs) {
  const seen = new Set()
  return refs
    .filter(ref => ref?.url)
    .filter(ref => {
      if (seen.has(ref.url)) return false
      seen.add(ref.url)
      return true
    })
}

// --- Extract image from various Gemini response shapes -----------
function extractGeminiImage(data) {
  // Interactions API shape: data.output_image
  if (data.output_image?.data) {
    return {
      b64:  data.output_image.data,
      mime: data.output_image.mime_type ?? 'image/png',
      id:   data.id ?? null,
    }
  }
  // generateContent shape: candidates[].content.parts[].inlineData
  const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)
  if (part?.inlineData?.data) {
    return {
      b64:  part.inlineData.data,
      mime: part.inlineData.mimeType ?? 'image/png',
      id:   null,
    }
  }
  return null
}

// --- Google Gemini: Interactions API (multi-turn) ----------------
async function callInteractionsAPI({ prompt, apiKey, model, size, imageResolution, previousInteractionId }) {
  const body = {
    model,
    input: prompt,
    response_format: { type: 'image', aspect_ratio: toAspect(size), image_size: imageResolution },
  }
  if (previousInteractionId) body.previous_interaction_id = previousInteractionId

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  const data = await res.json()
  if (!res.ok) return { ok: false, error: data.error?.message ?? `Google API error ${res.status}` }
  return { ok: true, data }
}

// --- Google Gemini: generateContent fallback --------------------
async function callGenerateContent({ prompt, apiKey, model, size, imageResolution = '1K', imageReferences = [] }) {
  const imageParts = imageReferences
    .map(ref => dataUrlToInlineData(ref.url))
    .filter(Boolean)

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...imageParts] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          responseFormat: {
            image: {
              aspectRatio: toGenerateContentAspect(size),
              imageSize: toGenerateContentImageSize(imageResolution),
            },
          },
        },
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) {
    const msg  = data.error?.message ?? `Google API error ${res.status}`
    const code = data.error?.code    ? ` (${data.error.code})` : ''
    throw new Error(msg + code)
  }
  return { ok: true, data }
}

async function generateGemini({ prompt, apiKey, model, size, imageResolution = '1K', previousInteractionId, imageReferences = [] }) {
  const hasImageReferences = imageReferences.length > 0

  // 1. Try Interactions API first (enables multi-turn)
  const intResult = hasImageReferences
    ? { ok: false, error: null }
    : await callInteractionsAPI({ prompt, apiKey, model, size, imageResolution, previousInteractionId })

  if (intResult.ok) {
    const img = extractGeminiImage(intResult.data)
    if (img) {
      return {
        imageUrl: `data:${img.mime};base64,${img.b64}`,
        interactionId: img.id,
      }
    }
  }

  // 2. Fall back to generateContent
  const gcResult = await callGenerateContent({ prompt, apiKey, model, size, imageResolution, imageReferences })
  const img = extractGeminiImage(gcResult.data)
  if (img) {
    return {
      imageUrl: `data:${img.mime};base64,${img.b64}`,
      interactionId: null,
    }
  }

  // Surface the original Interactions API error if both fail
  const errMsg = intResult.error ?? 'No image in Gemini response.'
  throw new Error(errMsg)
}

// --- Google Imagen: predict endpoint ----------------------------
async function generateImagen({ prompt, apiKey, model, size }) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances:  [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: toAspect(size) },
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) {
    const msg  = data.error?.message ?? `Google API error ${res.status}`
    const code = data.error?.code    ? ` (${data.error.code})` : ''
    throw new Error(msg + code)
  }
  const b64  = data.predictions?.[0]?.bytesBase64Encoded
  if (!b64) throw new Error('No image in Google Imagen response.')
  const mime = data.predictions?.[0]?.mimeType ?? 'image/png'
  return { imageUrl: `data:${mime};base64,${b64}`, interactionId: null }
}

// --- OpenAI: /v1/images/generations ----------------------------
async function generateOpenAI({ prompt, apiKey, model, quality, size }) {
  const pixelSize = size.includes('x') ? size : '1024x1536'
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, n: 1, size: pixelSize, quality, output_format: 'png' }),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg  = data.error?.message ?? `OpenAI API error ${res.status}`
    const code = data.error?.code    ? ` (${data.error.code})` : ''
    throw new Error(msg + code)
  }
  const b64 = data.data?.[0]?.b64_json
  const url  = data.data?.[0]?.url
  if (!b64 && !url) throw new Error('No image data in OpenAI response.')
  return { imageUrl: b64 ? `data:image/png;base64,${b64}` : url, interactionId: null }
}

// --- Main export ------------------------------------------------
export async function generatePanelImage({
  prompt,
  perspective           = '',
  globalStyle           = {},
  characters            = [],
  styleReferences       = [],
  imageReferences       = [],
  referencePrompt       = '',
  apiKey                = '',
  geminiApiKey          = '',
  imageModel            = 'gemini-3.1-flash-image',
  quality               = 'medium',
  size                  = '3:4',
  imageResolution       = '1K',
  previousInteractionId = null,
}) {
  const isGemini = imageModel.startsWith('gemini-')
  const isImagen = imageModel.startsWith('imagen-')
  const isGoogle = isGemini || isImagen
  const key      = isGoogle ? geminiApiKey : apiKey

  if (!key?.trim()) {
    throw new Error(
      isGoogle
        ? 'No Google API key. Add it in the AI Fill settings (Google API Key field).'
        : 'No OpenAI API key. Open AI Fill and enter your key.'
    )
  }
  if (!prompt?.trim()) throw new Error('Panel has no prompt. Write a description first.')

  const characterReferences = characters
    .filter(c => c.imageUrl)
    .map(c => ({
      url: c.imageUrl,
      name: `Character reference: ${c.name}`,
      type: 'character',
    }))
  const styleImageReferences = styleReferences
    .filter(r => r.url)
    .map(r => ({
      url: r.url,
      name: r.name && r.name !== 'Reference' ? `Style reference: ${r.name}` : 'Style reference',
      type: 'style',
    }))
  const allImageReferences = normalizeImageReferences([
    ...characterReferences,
    ...styleImageReferences,
    ...imageReferences,
  ])

  const fullPrompt = buildPrompt({
    prompt,
    perspective,
    globalStyle,
    characters,
    styleReferences,
    imageReferences: allImageReferences,
    referencePrompt,
  })

  if (isGemini) return generateGemini({ prompt: fullPrompt, apiKey: key, model: imageModel, size, imageResolution, previousInteractionId, imageReferences: allImageReferences })
  if (isImagen) return generateImagen({ prompt: fullPrompt, apiKey: key, model: imageModel, size })
  return generateOpenAI({ prompt: fullPrompt, apiKey: key, model: imageModel, quality, size })
}
