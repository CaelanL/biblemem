const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

export async function transcribeAudio(audioUri: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured. Set EXPO_PUBLIC_OPENAI_API_KEY in .env');
  }

  // Create form data with the audio file
  const formData = new FormData();

  // Get the file and append it
  const response = await fetch(audioUri);
  const blob = await response.blob();

  formData.append('file', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  } as any);
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');

  const apiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!apiResponse.ok) {
    const error = await apiResponse.text();
    throw new Error(`Whisper API error: ${error}`);
  }

  const result = await apiResponse.json();
  return result.text;
}
