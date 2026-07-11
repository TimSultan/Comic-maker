import React, { useState } from 'react'
import useComicStore from '../../store/useComicStore'
import StoredImage from '../StoredImage'
import { collectProjectImages, ReferenceImagePicker } from '../RightSidebar/PropertiesPanel'
import { generatePanelImage, getDefaultLookPrompt, getDefaultCharacterPortraitPrompt } from '../../utils/imageGen'
import { resolveImageUrl } from '../../utils/imageStore'
import { downloadDataUrlImage } from '../../utils/downloadImage'
import { MAX_REFERENCE_IMAGES } from '../../utils/defaults'

// ═══════════════════════════════════════════════════════════════
//  Generic generatable-image card — used for both the character's
//  base reference portrait and each saved look. Always exposes an
//  upload option, a reference-image picker, and a prompt + generate
//  button together, regardless of whether an image already exists.
// ═══════════════════════════════════════════════════════════════

function GeneratableImageCard({
  imageUrl,
  prompt,
  defaultPrompt,
  referenceImageIds = [],
  assetImages,
  globalStyle,
  imageModel,
  imageQuality,
  extraCharacters = [],
  filenameSlug,
  onUpdate,
  badge = null,
  headerLeft = null,
  onRemoveCard = null,
  imageHeightClass = 'h-36',
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

  const referenceImages = assetImages.filter(img => referenceImageIds.includes(img.id))

  const toggleReference = (imageId) => {
    if (referenceImageIds.includes(imageId)) {
      onUpdate({ referenceImageIds: referenceImageIds.filter(id => id !== imageId) })
      return
    }
    if (referenceImageIds.length >= MAX_REFERENCE_IMAGES) return
    onUpdate({ referenceImageIds: [...referenceImageIds, imageId] })
  }

  const handleUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => onUpdate({ imageUrl: ev.target.result })
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleGenerate = async () => {
    const apiKey = localStorage.getItem('comic-oai-key') ?? ''
    const geminiApiKey = localStorage.getItem('comic-gemini-key') ?? ''
    setGenerating(true)
    setError('')
    try {
      const resolvedRefs = (await Promise.all(referenceImages.map(async img => ({
        url: await resolveImageUrl(img.url, img.assetId),
        name: `${img.source} reference: ${img.label}`,
        type: 'selected',
      })))).filter(ref => ref.url)

      const finalPrompt = prompt?.trim() || defaultPrompt
      const { imageUrl: generatedUrl } = await generatePanelImage({
        prompt: finalPrompt,
        globalStyle,
        characters: extraCharacters,
        imageReferences: resolvedRefs,
        apiKey,
        geminiApiKey,
        imageModel,
        quality: imageQuality,
        size: '3:4',
      })
      onUpdate({ imageUrl: generatedUrl })
      if (useComicStore.getState().autoSaveImages) {
        downloadDataUrlImage(generatedUrl, `${filenameSlug}-${Date.now()}.png`)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden flex flex-col">
      <div className={`relative group ${imageHeightClass}`}>
        {imageUrl ? (
          <>
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
            <button
              className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-red-700/80
                hover:bg-red-600 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onUpdate({ imageUrl: null })}
              title="Clear image"
            >
              ×
            </button>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center border-b border-dashed border-gray-700 bg-gray-900/40">
            <p className="text-xs text-gray-600 px-4 text-center leading-relaxed">No image yet</p>
          </div>
        )}
        {badge && (
          <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-900/80 text-purple-200">
            {badge}
          </span>
        )}
      </div>

      <div className="p-2.5 space-y-2 flex-1 flex flex-col">
        {(headerLeft || onRemoveCard) && (
          <div className="flex items-center gap-2">
            {headerLeft}
            {onRemoveCard && (
              <button
                className="text-gray-600 hover:text-red-400 transition-colors text-base leading-none"
                onClick={onRemoveCard}
                title="Delete this look"
              >
                ×
              </button>
            )}
          </div>
        )}

        <textarea
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300
            resize-none focus:outline-none focus:border-purple-500 transition-colors"
          rows={3}
          placeholder={defaultPrompt}
          value={prompt ?? ''}
          onChange={e => onUpdate({ prompt: e.target.value })}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              className="text-xs px-2 py-1 rounded-md bg-gray-900 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
              onClick={() => setPickerOpen(true)}
            >
              + Reference images
            </button>
            <label className="text-xs px-2 py-1 rounded-md bg-gray-900 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors cursor-pointer">
              📷 Upload
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </label>
          </div>
          <span className="text-xs text-gray-500 shrink-0">{referenceImageIds.length}/{MAX_REFERENCE_IMAGES}</span>
        </div>

        {referenceImages.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {referenceImages.map(img => (
              <button
                key={img.id}
                className="relative w-10 h-10 rounded-md overflow-hidden border border-gray-700 shrink-0"
                title={`Remove ${img.label}`}
                onClick={() => toggleReference(img.id)}
              >
                <StoredImage src={img.url} assetId={img.assetId} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <button
          className={`w-full py-1.5 text-xs font-semibold rounded-lg transition-colors mt-auto ${
            generating
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : imageUrl
              ? 'bg-indigo-700 hover:bg-indigo-600 text-white'
              : 'bg-green-700 hover:bg-green-600 text-white'
          }`}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? '⏳ Generating…' : imageUrl ? '✏️ Regenerate' : '🎨 Generate'}
        </button>

        {error && <p className="text-xs text-red-400 leading-relaxed">{error}</p>}
      </div>

      <ReferenceImagePicker
        open={pickerOpen}
        images={assetImages}
        selectedIds={referenceImageIds}
        onToggle={toggleReference}
        onClose={() => setPickerOpen(false)}
        maxSelected={MAX_REFERENCE_IMAGES}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Main modal
// ═══════════════════════════════════════════════════════════════

export default function CharacterStudioModal() {
  const open = useComicStore(s => s.characterManagerOpen)
  const characterId = useComicStore(s => s.characterManagerCharacterId)
  const characters = useComicStore(s => s.characters)
  const pages = useComicStore(s => s.pages)
  const styleReferences = useComicStore(s => s.styleReferences)
  const projectImages = useComicStore(s => s.projectImages)
  const globalStyle = useComicStore(s => s.globalStyle)
  const imageModel = useComicStore(s => s.imageModel)
  const imageQuality = useComicStore(s => s.imageQuality)
  const {
    closeCharacterManager,
    setCharacterManagerCharacterId,
    addCharacter,
    removeCharacter,
    updateCharacter,
    addCharacterLook,
    updateCharacterLook,
    removeCharacterLook,
  } = useComicStore()

  if (!open) return null

  const character = characters.find(c => c.id === characterId) ?? characters[0] ?? null
  const assetImages = collectProjectImages({ pages, characters, styleReferences, projectImages })

  const handleAddCharacter = () => {
    addCharacter()
    const created = useComicStore.getState().characters.at(-1)
    if (created) setCharacterManagerCharacterId(created.id)
  }

  const handleDeleteCharacter = () => {
    if (!character) return
    removeCharacter(character.id)
    const remaining = useComicStore.getState().characters
    setCharacterManagerCharacterId(remaining[0]?.id ?? null)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) closeCharacterManager() }}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '96vw', maxWidth: 1160, height: '94vh' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">Character Studio</h2>
            <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">Manage your cast and their saved looks/presets.</p>
          </div>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white text-xl transition-colors"
            onClick={closeCharacterManager}
          >
            X
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* ── Left: character roster ── */}
          <div className="w-full md:w-56 h-40 md:h-auto shrink-0 border-b md:border-b-0 md:border-r border-gray-700 flex flex-col bg-gray-950/40 overflow-hidden">
            <div className="p-3 border-b border-gray-700 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Characters</span>
              <button
                className="text-xs px-2 py-1 rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors"
                onClick={handleAddCharacter}
              >
                + Add
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {characters.length === 0 ? (
                <p className="text-xs text-gray-600 text-center py-6 leading-relaxed">No characters yet.</p>
              ) : (
                characters.map(c => (
                  <button
                    key={c.id}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors border ${
                      c.id === character?.id
                        ? 'bg-purple-950/50 border-purple-600'
                        : 'border-transparent hover:bg-gray-800'
                    }`}
                    onClick={() => setCharacterManagerCharacterId(c.id)}
                  >
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="w-7 h-7 rounded-full shrink-0 inline-block" style={{ background: c.color ?? '#8b5cf6' }} />
                    )}
                    <span className="text-xs text-gray-200 truncate flex-1">{c.name || 'Unnamed'}</span>
                    {(c.looks?.length ?? 0) > 0 && (
                      <span className="text-xs text-gray-600 shrink-0">{c.looks.length}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── Right: character detail + looks ── */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {character ? (
              <>
                <div className="p-4 border-b border-gray-700 shrink-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="w-6 h-6 rounded-full border-0 cursor-pointer shrink-0 p-0 bg-transparent"
                      value={character.color ?? '#8b5cf6'}
                      onChange={e => updateCharacter(character.id, { color: e.target.value })}
                      title="Character color"
                    />
                    <input
                      className="flex-1 bg-transparent text-sm text-gray-100 font-semibold outline-none
                        border-b border-transparent focus:border-purple-500 transition-colors"
                      value={character.name}
                      placeholder="Character name"
                      onChange={e => updateCharacter(character.id, { name: e.target.value })}
                    />
                    <button
                      className="text-xs text-red-400 hover:text-red-300 transition-colors shrink-0"
                      onClick={handleDeleteCharacter}
                    >
                      Delete character
                    </button>
                  </div>
                  <textarea
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-400
                      resize-none focus:outline-none focus:border-purple-500 transition-colors"
                    rows={2}
                    placeholder="Description, traits, appearance…"
                    value={character.description ?? ''}
                    onChange={e => updateCharacter(character.id, { description: e.target.value })}
                  />
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Looks &amp; Presets</h3>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                        The reference portrait anchors this character's identity. Add alternate outfits/appearances as
                        additional looks — pick one per panel in the Panel tab's character picker.
                      </p>
                    </div>
                    <button
                      className="text-xs px-2.5 py-1.5 rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors shrink-0"
                      onClick={() => addCharacterLook(character.id, { prompt: getDefaultLookPrompt(globalStyle) })}
                    >
                      + Add Look
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Always-present base reference portrait */}
                    <GeneratableImageCard
                      imageUrl={character.imageUrl}
                      prompt={character.prompt}
                      defaultPrompt={getDefaultCharacterPortraitPrompt(character)}
                      referenceImageIds={character.referenceImageIds ?? []}
                      assetImages={assetImages}
                      globalStyle={globalStyle}
                      imageModel={imageModel}
                      imageQuality={imageQuality}
                      filenameSlug={`${character.name || 'character'}-portrait`.replace(/\s+/g, '-').toLowerCase()}
                      onUpdate={u => updateCharacter(character.id, u)}
                      badge="Reference"
                      headerLeft={<span className="flex-1 text-sm text-gray-100 font-semibold">Reference Portrait</span>}
                    />

                    {(character.looks ?? []).map(look => (
                      <GeneratableImageCard
                        key={look.id}
                        imageUrl={look.imageUrl}
                        prompt={look.prompt}
                        defaultPrompt={getDefaultLookPrompt(globalStyle)}
                        referenceImageIds={look.referenceImageIds ?? []}
                        assetImages={assetImages}
                        globalStyle={globalStyle}
                        imageModel={imageModel}
                        imageQuality={imageQuality}
                        extraCharacters={[character]}
                        filenameSlug={`${character.name || 'character'}-${look.name || 'look'}`.replace(/\s+/g, '-').toLowerCase()}
                        onUpdate={u => updateCharacterLook(character.id, look.id, u)}
                        onRemoveCard={() => removeCharacterLook(character.id, look.id)}
                        headerLeft={
                          <input
                            className="flex-1 bg-transparent text-sm text-gray-100 font-semibold outline-none
                              border-b border-transparent focus:border-purple-500 transition-colors"
                            value={look.name}
                            placeholder="Look name (e.g. Battle Armor)"
                            onChange={e => updateCharacterLook(character.id, look.id, { name: e.target.value })}
                          />
                        }
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <button
                  className="text-xs px-3 py-1.5 rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors"
                  onClick={handleAddCharacter}
                >
                  + Add your first character
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
