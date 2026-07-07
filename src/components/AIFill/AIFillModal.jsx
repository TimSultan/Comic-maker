import React, { useState, useEffect } from 'react'
import useComicStore from '../../store/useComicStore'
import { uid, TEXT_MODELS, IMAGE_MODELS, IMAGE_QUALITIES, getDefaultLayoutId, getGridDims } from '../../utils/defaults'

// ─── OpenAI call ─────────────────────────────────────────────────

async function callOpenAI({ storyScript, globalStyle, characters, pageCount, panelsPerPage, apiKey, model }) {
  const hasChars = characters.length > 0
  const charLines = hasChars
    ? characters.map(c => `  - "${c.name}"${c.description ? `: ${c.description}` : ''}`).join('\n')
    : '  (none defined)'

  // Exact name list used in the hard constraint below
  const charNameList = hasChars
    ? characters.map(c => `"${c.name}"`).join(', ')
    : 'none'

  const styleCtx = Object.entries(globalStyle)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')

  const systemPrompt = `You are a professional comic book scriptwriter. Given a story synopsis, generate a structured JSON script for a ${pageCount}-page comic with exactly ${panelsPerPage} panels per page.

Global art style: ${styleCtx || 'unspecified'}

═══ CHARACTER ROSTER ═══
${charLines}

CRITICAL RULE — Characters:
• The "characters" array in every panel MUST contain ONLY exact names from this list: [${charNameList}]
• Use the EXACT spelling and capitalisation shown above — no abbreviations, no pronouns, no aliases
• Choose which characters logically appear in each scene based on the story context
• A panel may have zero, one, or several characters — only list those physically present in the scene
• If no characters are defined, use empty arrays: "characters": []

For each panel provide:
- prompt: vivid image-generation prompt (include art style, named characters' appearance, action, setting, lighting, mood)
- perspective: one of: close-up | medium-shot | wide-shot | bird's-eye | worm's-eye | over-shoulder | dutch-angle | establishing
- bubbles: array of comic lettering objects. Each bubble: { type: "speech"|"thought"|"shout"|"whisper"|"caption"|"narration", style: "classic-comic"|"manga-dialogue"|"thought-soft"|"shout-burst"|"whisper-dashed"|"caption-box"|"narration-box"|"radio-electric"|"sfx-impact", text: string, x: 5-75, y: 5-80, width: 20-55 }
- characters: array of exact character names present (from roster only)
- notes: one concise director note

Respond ONLY with valid JSON — no markdown fences, no commentary:
{
  "pages": [
    {
      "title": "Page 1",
      "panels": [
        {
          "prompt": "...",
          "perspective": "medium-shot",
          "bubbles": [{ "type": "speech", "text": "...", "x": 10, "y": 5, "width": 35 }],
          "characters": ["ExactName"],
          "notes": "..."
        }
      ]
    }
  ]
}`

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: storyScript.trim() },
      ],
      text: { format: { type: 'json_object' } },
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? `API error ${res.status}`)

  // Responses API returns output as an array of content blocks
  const content = data.output
    ?.find(b => b.type === 'message')
    ?.content
    ?.find(b => b.type === 'output_text')
    ?.text

  if (!content) throw new Error('Empty response from AI')
  return JSON.parse(content)
}

// ─── Apply AI result to store ────────────────────────────────────

function applyResult(result, mergeMode) {
  const { pages: aiPages } = result
  if (!Array.isArray(aiPages) || aiPages.length === 0) throw new Error('No pages in AI response')

  // Resolve AI-returned character names → stored character IDs.
  // Tries progressively looser matching so near-misses still link correctly.
  const storedChars = useComicStore.getState().characters
  const resolveChars = (names = []) =>
    names.flatMap(name => {
      const n = String(name).toLowerCase().trim()
      if (!n) return []

      // 1. Exact match (case-insensitive)
      let m = storedChars.find(c => c.name.toLowerCase() === n)
      if (m) return [m.id]

      // 2. Stored name is contained in AI name or vice-versa
      //    e.g. "Detective Sarah" matches roster "Sarah", or "Sarah" matches "Sarah Connor"
      m = storedChars.find(c => {
        const cn = c.name.toLowerCase()
        return n.includes(cn) || cn.includes(n)
      })
      if (m) return [m.id]

      // 3. Any significant word overlap (word length > 2 to skip "the", "a", etc.)
      const nWords = n.split(/\s+/).filter(w => w.length > 2)
      m = storedChars.find(c => {
        const cWords = c.name.toLowerCase().split(/\s+/)
        return nWords.some(w => cWords.includes(w))
      })
      if (m) return [m.id]

      // No match — silently drop (don't create phantom entries)
      return []
    })

  const newPages = aiPages.map((pg, i) => {
    const panels = (pg.panels ?? []).map(p => ({
      id: uid(),
      prompt: p.prompt ?? '',
      perspective: p.perspective ?? 'medium-shot',
      bubbles: (p.bubbles ?? []).map(b => ({ id: uid(), width: 35, ...b })),
      characters: resolveChars(p.characters),
      notes: p.notes ?? '',
      styleOverride: null,
      imageUrl: null,
      imageAssetId: null,
      imageSize: 'auto',
      imageResolution: '1K',
      referencePrompt: '',
      referenceImageIds: [],
      editPrompt: '',
    }))
    const panelCount = panels.length
    const layoutId = getDefaultLayoutId(panelCount)
    const { cols, rows } = getGridDims(panelCount, layoutId)
    return {
      id: uid(),
      title: pg.title ?? `Page ${i + 1}`,
      panelCount,
      layoutId,
      colSizes: Array(cols).fill(1),
      rowSizes: Array(rows).fill(1),
      panels,
    }
  })

  const existing = useComicStore.getState().pages
  const merged = mergeMode === 'replace'
    ? newPages
    : [...existing, ...newPages]

  useComicStore.setState({
    pages: merged,
    selectedPageId: merged[0]?.id ?? null,
    selectedPanelId: null,
  })
}

// ─── Concept → story script generator ───────────────────────────

async function callGenerateScript({ concept, globalStyle, characters, apiKey, model }) {
  const hasChars = characters.length > 0
  const charLines = hasChars
    ? characters.map(c => `  • "${c.name}"${c.description ? ` — ${c.description}` : ''}`).join('\n')
    : '  (none defined yet)'
  const charNameList = hasChars ? characters.map(c => `"${c.name}"`).join(', ') : 'none'

  const styleCtx = Object.entries(globalStyle)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')

  const systemPrompt = `You are a professional comic book writer. Expand the user's story concept into a rich, detailed scene-by-scene comic book script.

Art style: ${styleCtx || 'unspecified'}

═══ CHARACTER ROSTER ═══
${charLines}

CRITICAL: Refer to every character using their EXACT name from the roster above: [${charNameList}].
Do NOT invent new character names. Do NOT use pronouns or aliases as the primary identifier.

For each scene describe:
- Which roster characters are present (use exact names)
- The setting, atmosphere, mood and lighting
- Key action and character movement
- Natural dialog in quotation marks, attributed to the exact character name
- Camera/composition hints (close-up, wide shot, bird's-eye, etc.)

Write flowing prose. Be cinematic, specific, and emotionally engaging. This script will be parsed into comic panels, so clarity of who is doing what in each scene is essential.`

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: concept.trim() },
      ],
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? `API error ${res.status}`)

  const text = data.output
    ?.find(b => b.type === 'message')
    ?.content
    ?.find(b => b.type === 'output_text')
    ?.text

  if (!text) throw new Error('Empty response from AI')
  return text
}

// ─── Status badge ────────────────────────────────────────────────

function StatusBadge({ status, error }) {
  if (error) return <p className="text-xs text-red-400 mt-2 leading-relaxed">{error}</p>
  if (!status) return null
  return (
    <p className="text-xs text-purple-300 mt-2 animate-pulse">{status}</p>
  )
}


// ─── Main modal ──────────────────────────────────────────────────

export default function AIFillModal() {
  const aiFillModalOpen  = useComicStore(s => s.aiFillModalOpen)
  const closeAIFillModal = useComicStore(s => s.closeAIFillModal)
  const storyScript      = useComicStore(s => s.storyScript)
  const setStoryScript   = useComicStore(s => s.setStoryScript)
  const globalStyle      = useComicStore(s => s.globalStyle)
  const characters       = useComicStore(s => s.characters)

  // Local settings (persisted in localStorage)
  const [apiKey,        setApiKey]        = useState(() => localStorage.getItem('comic-oai-key') ?? '')
  const [geminiApiKey,  setGeminiApiKey]  = useState(() => localStorage.getItem('comic-gemini-key') ?? '')
  const [textModel,     setTextModel]     = useState('gpt-5.4-mini')
  const imageModel      = useComicStore(s => s.imageModel)
  const imageQuality    = useComicStore(s => s.imageQuality)
  const setImageModel   = useComicStore(s => s.setImageModel)
  const setImageQuality = useComicStore(s => s.setImageQuality)
  const [pageCount,     setPageCount]     = useState(3)
  const [panelsPerPage, setPanelsPerPage] = useState(3)
  const [mergeMode,     setMergeMode]     = useState('replace')

  // Concept → script
  const [concept,          setConcept]          = useState('')
  const [generatingScript, setGeneratingScript] = useState(false)
  const [scriptStatus,     setScriptStatus]     = useState('')
  const [scriptError,      setScriptError]      = useState('')

  // Comic generate
  const [status,    setStatus]    = useState('')
  const [error,     setError]     = useState('')
  const [generating,setGenerating]= useState(false)

  // Save API key to localStorage whenever it changes (key is user-provided, stays local)
  useEffect(() => {
    if (apiKey)       localStorage.setItem('comic-oai-key', apiKey)
  }, [apiKey])

  useEffect(() => {
    if (geminiApiKey) localStorage.setItem('comic-gemini-key', geminiApiKey)
  }, [geminiApiKey])

  const isGoogle = imageModel.startsWith('imagen-') || imageModel.startsWith('gemini-')

  if (!aiFillModalOpen) return null

  const wordCount = storyScript.trim().split(/\s+/).filter(Boolean).length

  const handleGenerateScript = async () => {
    if (!apiKey.trim()) { setScriptError('Enter your OpenAI API key in Settings first.'); return }
    if (!concept.trim()) { setScriptError('Write a story concept first.'); return }
    setGeneratingScript(true)
    setScriptError('')
    setScriptStatus('Expanding concept into full script…')
    try {
      const script = await callGenerateScript({ concept, globalStyle, characters, apiKey: apiKey.trim(), model: textModel })
      setStoryScript(script)
      setScriptStatus('Script generated ✓')
      setTimeout(() => setScriptStatus(''), 2000)
    } catch (e) {
      setScriptError(e.message)
      setScriptStatus('')
    } finally {
      setGeneratingScript(false)
    }
  }

  const handleGenerate = async () => {
    if (!apiKey.trim()) { setError('Enter your OpenAI API key in Settings.'); return }
    if (!storyScript.trim()) { setError('Write or paste a story in the Script tab first.'); return }

    setGenerating(true)
    setError('')
    setStatus('Sending to AI…')

    try {
      setStatus('Generating comic structure…')
      const result = await callOpenAI({
        storyScript, globalStyle, characters,
        pageCount, panelsPerPage, apiKey: apiKey.trim(), model: textModel,
      })
      setStatus('Applying pages and panels…')
      applyResult(result, mergeMode)
      setStatus('Done! ✓')
      setTimeout(() => { closeAIFillModal(); setStatus('') }, 1000)
    } catch (e) {
      setError(e.message)
      setStatus('')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) closeAIFillModal() }}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '92vw', maxWidth: 1100, height: '88vh' }}
      >
        {/* ─ Header ─ */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>✨</span> Story &amp; AI Fill
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Write your story — then let AI fill all pages, panels, prompts and dialog automatically
            </p>
          </div>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white text-xl transition-colors"
            onClick={closeAIFillModal}
          >
            ×
          </button>
        </div>

        {/* ─ Body: two-pane ─ */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Left: Story script editor ── */}
          <div className="flex-1 flex flex-col border-r border-gray-700">
            {/* Concept section */}
          <div className="shrink-0 border-b border-gray-800 p-3 space-y-2 bg-gray-950/40">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Story Concept
              <span className="normal-case font-normal text-gray-600 ml-1">— one or two sentences</span>
            </label>
            <div className="flex gap-2 items-start">
              <textarea
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-200
                  resize-none focus:outline-none focus:border-indigo-500 transition-colors"
                rows={2}
                placeholder="A young detective discovers her partner is the serial killer she's been hunting…"
                value={concept}
                onChange={e => setConcept(e.target.value)}
              />
              <button
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs
                  font-semibold rounded-lg transition-colors shrink-0 flex items-center gap-1.5"
                onClick={handleGenerateScript}
                disabled={generatingScript || !concept.trim() || !apiKey.trim()}
              >
                {generatingScript ? '⏳' : '🪄'} Generate Script
              </button>
            </div>
            {scriptStatus && <p className="text-xs text-indigo-300">{scriptStatus}</p>}
            {scriptError  && <p className="text-xs text-red-400">{scriptError}</p>}
          </div>

          {/* Script toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 shrink-0">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Story Script
              </span>
              <span className="text-xs text-gray-600">{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
            </div>

            <textarea
              className="flex-1 bg-gray-950 text-gray-200 text-sm leading-relaxed p-5 resize-none
                focus:outline-none font-mono placeholder-gray-700"
              placeholder={`Write your full story here. Be as detailed as you want — describe scenes, character actions, emotions, dialog, pacing, and mood.

Example:
Page 1: A young detective arrives at a rain-soaked crime scene in 1920s Chicago. She notices a mysterious footprint near the back door. Her partner, a grizzled veteran, is skeptical.

Page 2: Inside the warehouse, they discover a secret room filled with stolen artifacts. A shadowy figure watches them from above...

The AI will automatically generate panel prompts, camera angles, speech bubbles, and character placement for ${pageCount} page${pageCount !== 1 ? 's' : ''}.`}
              value={storyScript}
              onChange={e => setStoryScript(e.target.value)}
              spellCheck
            />
          </div>

          {/* ── Right: Settings + Generate ── */}
          <div className="w-80 shrink-0 flex flex-col bg-gray-900 overflow-y-auto">

            {/* API Keys */}
            <section className="p-4 border-b border-gray-800 space-y-3">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                API Keys
              </label>

              {/* OpenAI */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500 block">OpenAI (GPT Image, DALL-E, script)</label>
                <input
                  type="password"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200
                    focus:outline-none focus:border-purple-500 transition-colors font-mono"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  autoComplete="off"
                />
              </div>

              {/* Google */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500 block">
                  Google (Imagen 4, Imagen 3)
                  {isGoogle && <span className="ml-1 text-yellow-500">*required</span>}
                </label>
                <input
                  type="password"
                  className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-sm text-gray-200
                    focus:outline-none transition-colors font-mono
                    ${isGoogle && !geminiApiKey ? 'border-yellow-700 focus:border-yellow-500' : 'border-gray-700 focus:border-purple-500'}`}
                  placeholder="AIza..."
                  value={geminiApiKey}
                  onChange={e => setGeminiApiKey(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                Keys are stored only in your browser. Never proxied.
              </p>
            </section>

            {/* Text model */}
            <section className="p-4 border-b border-gray-800 space-y-2">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Script Model <span className="normal-case text-gray-600 font-normal">(text)</span>
              </label>
              <div className="space-y-1">
                {TEXT_MODELS.map(m => (
                  <label
                    key={m.value}
                    className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${
                      textModel === m.value ? 'bg-purple-950/40 border border-purple-700' : 'border border-transparent hover:bg-gray-800'
                    }`}
                  >
                    <input
                      type="radio"
                      className="mt-0.5 accent-purple-500 shrink-0"
                      checked={textModel === m.value}
                      onChange={() => setTextModel(m.value)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-gray-200">{m.label}</span>
                        {m.badge && (
                          <span className="text-xs px-1.5 py-0 rounded bg-purple-700 text-purple-100 font-medium leading-4">{m.badge}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{m.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            {/* Image model */}
            <section className="p-4 border-b border-gray-800 space-y-2">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Image Model <span className="normal-case text-gray-600 font-normal">(panels)</span>
              </label>
              <div className="space-y-1">
                {IMAGE_MODELS.map(m => (
                  <label
                    key={m.value}
                    className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${
                      imageModel === m.value ? 'bg-purple-950/40 border border-purple-700' : 'border border-transparent hover:bg-gray-800'
                    }`}
                  >
                    <input
                      type="radio"
                      className="mt-0.5 accent-purple-500 shrink-0"
                      checked={imageModel === m.value}
                      onChange={() => setImageModel(m.value)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-gray-200">{m.label}</span>
                        {m.provider === 'google' && (
                          <span className="text-xs px-1.5 py-0 rounded bg-blue-900 text-blue-300 font-medium leading-4">Google</span>
                        )}
                        {m.badge && (
                          <span className="text-xs px-1.5 py-0 rounded bg-green-800 text-green-200 font-medium leading-4">{m.badge}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{m.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Image quality */}
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">Quality</label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200
                    focus:outline-none focus:border-purple-500 transition-colors"
                  value={imageQuality}
                  onChange={e => setImageQuality(e.target.value)}
                >
                  {IMAGE_QUALITIES.map(q => (
                    <option key={q.value} value={q.value}>{q.label}</option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                Image generation runs per-panel after the script is created.
                {isGoogle && ' Google Imagen models ignore the Quality slider.'}
              </p>
            </section>

            {/* Structure */}
            <section className="p-4 border-b border-gray-800 space-y-3">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Comic Structure
              </label>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Pages to generate: <strong className="text-gray-300">{pageCount}</strong></label>
                <input
                  type="range" min={1} max={12} step={1}
                  className="w-full accent-purple-500"
                  value={pageCount}
                  onChange={e => setPageCount(Number(e.target.value))}
                />
                <div className="flex justify-between text-xs text-gray-700 mt-0.5">
                  <span>1</span><span>12</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Panels per page: <strong className="text-gray-300">{panelsPerPage}</strong></label>
                <input
                  type="range" min={1} max={9} step={1}
                  className="w-full accent-purple-500"
                  value={panelsPerPage}
                  onChange={e => setPanelsPerPage(Number(e.target.value))}
                />
                <div className="flex justify-between text-xs text-gray-700 mt-0.5">
                  <span>1</span><span>9</span>
                </div>
              </div>

              <p className="text-xs text-gray-600">
                Total panels: <strong className="text-gray-400">{pageCount * panelsPerPage}</strong>
              </p>
            </section>

            {/* Merge mode */}
            <section className="p-4 border-b border-gray-800 space-y-2">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Apply Mode
              </label>
              <div className="flex flex-col gap-1.5">
                {[
                  { value: 'replace', label: 'Replace all pages', desc: 'Discard existing pages' },
                  { value: 'append',  label: 'Append to existing', desc: 'Add new pages at the end' },
                ].map(opt => (
                  <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      className="mt-0.5 accent-purple-500"
                      checked={mergeMode === opt.value}
                      onChange={() => setMergeMode(opt.value)}
                    />
                    <div>
                      <span className="text-xs text-gray-300">{opt.label}</span>
                      <p className="text-xs text-gray-600">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            {/* Generate button + status */}
            <div className="p-4 mt-auto">
              <button
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
                  generating
                    ? 'bg-purple-800 text-purple-300 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/40'
                }`}
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? '⏳ Generating…' : '✨ Generate Comic'}
              </button>

              <StatusBadge status={status} error={error} />

              {!apiKey && (
                <p className="text-xs text-yellow-600 mt-2 text-center leading-relaxed">
                  Add your OpenAI API key above to enable generation.
                </p>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
