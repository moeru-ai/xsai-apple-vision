<script setup lang="ts">
import type { AppleVisionAvailability } from '@xsai-apple-vision/vision'

import type { VisualContext } from './libs/apple-vision'

import { generateObject } from '@xsai/generate-object'
import { streamText } from '@xsai/stream-text'
import { computed, onMounted, ref, shallowRef } from 'vue'

import { acceptedImageTypes, airiImagePrompt, appleVisionProvider, readImage, visualContextSchema } from './libs/apple-vision'

const availability = shallowRef<AppleVisionAvailability>()
const languages = ref<string[]>([])
const systemLanguage = navigator.language
const systemLanguageSupported = ref<boolean>()

const image = ref<string>()
const question = ref('What is on this screen?')
const useAiriPrompt = ref(true)
const answer = ref('')
const visualContext = shallowRef<VisualContext>()
const stats = ref('')
const error = ref('')
const running = shallowRef<AbortController>()

const canAsk = computed(() => availability.value?.available === true && image.value != null && running.value == null)

onMounted(async () => {
  try {
    availability.value = await appleVisionProvider.isAvailable()
    languages.value = await appleVisionProvider.supportedLanguages()
    systemLanguageSupported.value = await appleVisionProvider.supportsLanguage(systemLanguage)
  }
  catch (cause) {
    error.value = String(cause)
  }
})

async function chooseImage(file: File | undefined) {
  if (file == null)
    return
  if (!acceptedImageTypes.includes(file.type)) {
    error.value = `${file.type || 'This file'} is not a PNG, JPEG, HEIC, or WebP image.`
    return
  }
  error.value = ''
  image.value = await readImage(file)
}

function onPaste(event: ClipboardEvent) {
  void chooseImage([...event.clipboardData?.files ?? []][0])
}

function onDrop(event: DragEvent) {
  void chooseImage([...event.dataTransfer?.files ?? []][0])
}

function messages() {
  return [{
    content: [
      { text: useAiriPrompt.value ? airiImagePrompt(question.value) : question.value, type: 'text' as const },
      { image_url: { url: image.value! }, type: 'image_url' as const },
    ],
    role: 'user' as const,
  }]
}

/**
 * Shows the message of a chat-completions error response. A guardrail rejection
 * is a decision of the Apple model, so it says that the app still works.
 */
function describeError(cause: unknown) {
  const body = (cause as { responseBody?: string }).responseBody
  try {
    const { error } = JSON.parse(body ?? '') as { error: { code: string, message: string } }
    if (error.code === 'content_policy_violation')
      return 'The Apple model declined this image or question with its safety filter. The app works: another image or another wording can pass.'
    return `${error.message} (${error.code})`
  }
  catch {
    return String(cause)
  }
}

/** Runs one request, and shows its time and error. `stop()` aborts it. */
async function run(request: (signal: AbortSignal) => Promise<string>) {
  const controller = new AbortController()
  running.value = controller
  answer.value = ''
  visualContext.value = undefined
  stats.value = ''
  error.value = ''
  const started = performance.now()
  try {
    const usage = await request(controller.signal)
    stats.value = `${Math.round(performance.now() - started)} ms · ${usage}`
  }
  catch (cause) {
    error.value = controller.signal.aborted ? 'Stopped. The on-device session was cancelled.' : describeError(cause)
  }
  finally {
    running.value = undefined
  }
}

/** Streams a text answer. */
function ask() {
  void run(async (abortSignal) => {
    const result = streamText({
      ...appleVisionProvider.chat(),
      abortSignal,
      messages: messages(),
      streamOptions: { includeUsage: true },
    })
    for await (const delta of result.textStream)
      answer.value += delta
    const usage = await result.usage
    return `${usage?.inputTokens ?? '?'} input tokens, ${usage?.outputTokens ?? '?'} output tokens`
  })
}

/** Asks for a structured Visual Context that matches the schema. */
function describe() {
  void run(async (abortSignal) => {
    const result = await generateObject({
      ...appleVisionProvider.chat(),
      abortSignal,
      messages: messages(),
      schema: visualContextSchema,
    })
    visualContext.value = result.object
    return `${result.usage?.inputTokens ?? '?'} input tokens, ${result.usage?.outputTokens ?? '?'} output tokens`
  })
}

function stop() {
  running.value?.abort()
}
</script>

<template>
  <main class="page" @paste="onPaste">
    <header class="header">
      <h1>xsAI Apple Vision</h1>
      <span v-if="availability == null" class="chip">Checking…</span>
      <span v-else-if="availability.available" class="chip ok">Available</span>
      <span v-else class="chip warn" :title="availability.reason.message">{{ availability.reason.code }}</span>
      <span v-if="systemLanguageSupported != null" class="chip" :class="systemLanguageSupported ? 'ok' : 'warn'">
        {{ systemLanguage }} {{ systemLanguageSupported ? 'supported' : 'not supported' }}
      </span>
      <details class="languages">
        <summary>{{ languages.length }} languages</summary>
        <p>{{ languages.join(', ') }}</p>
      </details>
    </header>

    <section class="columns">
      <div class="panel">
        <label class="drop" @dragover.prevent @drop.prevent="onDrop">
          <img v-if="image" :src="image" alt="The selected image">
          <span v-else>Drop, paste, or choose an image</span>
          <input type="file" :accept="acceptedImageTypes.join(',')" @change="chooseImage(($event.target as HTMLInputElement).files?.[0])">
        </label>
        <textarea v-model="question" rows="3" placeholder="Ask about the image" />
        <label class="option">
          <input v-model="useAiriPrompt" type="checkbox">
          Use the AIRI image prompt
        </label>
        <div class="actions">
          <button :disabled="!canAsk" @click="ask">
            Ask
          </button>
          <button :disabled="!canAsk" @click="describe">
            Describe as JSON
          </button>
          <button :disabled="running == null" @click="stop">
            Stop
          </button>
        </div>
        <p class="hint">
          The main process turns on the OCR and barcode tools, and prepares the OCR models in the background.
        </p>
      </div>

      <div class="panel output">
        <p v-if="error" class="error">
          {{ error }}
        </p>
        <pre v-if="visualContext">{{ JSON.stringify(visualContext, null, 2) }}</pre>
        <p v-else-if="answer" class="answer">
          {{ answer }}
        </p>
        <p v-else-if="running" class="hint">
          Waiting for the first text…
        </p>
        <p v-if="stats" class="hint">
          {{ stats }}
        </p>
      </div>
    </section>
  </main>
</template>
