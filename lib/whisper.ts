const SONIOX_API_KEY = process.env.EXPO_PUBLIC_SONIOX_API_KEY;
const SONIOX_BASE_URL = 'https://api.soniox.com';

/**
 * Helper for Soniox API requests with Bearer auth
 */
async function apiFetch<T>(
  endpoint: string,
  options: { method?: string; body?: BodyInit; headers?: Record<string, string> } = {}
): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const response = await fetch(`${SONIOX_BASE_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${SONIOX_API_KEY}`,
      ...headers,
    },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Soniox API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Upload audio file to Soniox
 * Returns the file ID
 */
async function uploadAudio(audioUri: string): Promise<string> {
  // Fetch the audio file as blob
  const audioResponse = await fetch(audioUri);
  const audioBlob = await audioResponse.blob();

  // Create form data
  const formData = new FormData();
  formData.append('file', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  } as any);

  const result = await apiFetch<{ id: string }>('/v1/files', {
    method: 'POST',
    body: formData,
  });

  return result.id;
}

/**
 * Create a transcription job for an uploaded file
 * Returns the transcription ID
 */
async function createTranscription(fileId: string): Promise<string> {
  const result = await apiFetch<{ id: string }>('/v1/transcriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_id: fileId,
      model: 'stt-async-preview',
      language_hints: ['en'],
    }),
  });

  return result.id;
}

/**
 * Poll until transcription is completed
 */
async function waitForCompletion(transcriptionId: string): Promise<void> {
  const maxAttempts = 60; // 60 seconds max
  let attempts = 0;

  while (attempts < maxAttempts) {
    const result = await apiFetch<{ status: string }>(`/v1/transcriptions/${transcriptionId}`);

    if (result.status === 'completed') {
      return;
    }

    if (result.status === 'error') {
      throw new Error('Transcription failed');
    }

    // Wait 1 second before polling again
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }

  throw new Error('Transcription timed out');
}

/**
 * Get the transcript text from a completed transcription
 */
async function getTranscript(transcriptionId: string): Promise<string> {
  const result = await apiFetch<{ text: string }>(`/v1/transcriptions/${transcriptionId}/transcript`);
  return result.text;
}

/**
 * Transcribe audio using Soniox async API
 * 1. Upload audio file
 * 2. Create transcription job
 * 3. Poll until completed
 * 4. Return transcript text
 */
export async function transcribeAudio(audioUri: string): Promise<string> {
  if (!SONIOX_API_KEY) {
    throw new Error('Soniox API key not configured. Set EXPO_PUBLIC_SONIOX_API_KEY in .env');
  }

  // Step 1: Upload audio
  const fileId = await uploadAudio(audioUri);

  // Step 2: Create transcription
  const transcriptionId = await createTranscription(fileId);

  // Step 3: Wait for completion
  await waitForCompletion(transcriptionId);

  // Step 4: Get transcript
  const text = await getTranscript(transcriptionId);

  return text;
}
