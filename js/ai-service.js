// AI Service - Audio transcription & summarization via OpenAI
// Follows R1 Creations SDK pattern (similar to aiCAD's ai-service.js)
class AudioAIService {
    constructor() {
        this.whisperEndpoint = 'https://api.openai.com/v1/audio/transcriptions';
        this.chatEndpoint = 'https://api.openai.com/v1/chat/completions';
        this.apiKey = null;
        this.model = 'gpt-4o-mini'; // Cost-effective default
        this.whisperModel = 'whisper-1';

        // Load persisted key
        this._loadKey();
    }

    _loadKey() {
        try {
            const saved = localStorage.getItem('r1_openai_key');
            if (saved) {
                this.apiKey = saved;
            }
        } catch (e) {
            console.warn('Could not load API key from localStorage');
        }
    }

    setAPIKey(key) {
        this.apiKey = key;
        try {
            localStorage.setItem('r1_openai_key', key);
        } catch (e) { /* storage full or blocked */ }
        console.log('AI Service: OpenAI key saved');
    }

    clearAPIKey() {
        this.apiKey = null;
        try {
            localStorage.removeItem('r1_openai_key');
        } catch (e) {}
    }

    isConfigured() {
        return !!this.apiKey;
    }

    getStatus() {
        return this.isConfigured()
            ? 'Connected to OpenAI'
            : 'No API key — tap ⚙ to configure';
    }

    getMaskedKey() {
        if (!this.apiKey) return '';
        if (this.apiKey.length <= 8) return '••••••••';
        return this.apiKey.slice(0, 3) + '•••' + this.apiKey.slice(-4);
    }

    // -------------------------------------------------------
    // Step 1: Transcribe audio blob via Whisper
    // -------------------------------------------------------
    async transcribe(audioBlob) {
        if (!this.isConfigured()) throw new Error('API key not set');

        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.wav');
        formData.append('model', this.whisperModel);
        formData.append('response_format', 'verbose_json');

        const res = await fetch(this.whisperEndpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.apiKey}` },
            body: formData
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Whisper API error ${res.status}: ${err}`);
        }

        const data = await res.json();
        return {
            text: data.text,
            language: data.language || 'en',
            duration: data.duration || null,
            segments: data.segments || []
        };
    }

    // -------------------------------------------------------
    // Step 2: Summarise transcription text via Chat
    // -------------------------------------------------------
    async summarize(transcriptionText) {
        if (!this.isConfigured()) throw new Error('API key not set');

        const systemPrompt = `You are a concise audio note summarizer for a pocket recorder device (Rabbit R1) with a tiny 240×282px screen.

RULES:
- Output a SHORT summary (2-4 sentences max)
- Pull out key points as bullet items (max 5)
- Use plain language, no markdown headers
- If the audio is very short or trivial, just give a one-line description
- Format: first line is the summary paragraph, then a blank line, then bullet points starting with •`;

        const res = await fetch(this.chatEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Summarize this audio transcription:\n\n"${transcriptionText}"` }
                ],
                max_tokens: 300,
                temperature: 0.3
            })
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Chat API error ${res.status}: ${err}`);
        }

        const data = await res.json();
        return data.choices[0].message.content.trim();
    }

    // -------------------------------------------------------
    // Full pipeline: Audio Blob → Transcription → Summary
    // -------------------------------------------------------
    async processRecording(audioBlob, onProgress) {
        if (onProgress) onProgress('Transcribing…');

        const transcription = await this.transcribe(audioBlob);

        if (!transcription.text || transcription.text.trim().length === 0) {
            return {
                transcription: '(no speech detected)',
                summary: 'No speech was detected in this recording.'
            };
        }

        if (onProgress) onProgress('Summarizing…');

        const summary = await this.summarize(transcription.text);

        return {
            transcription: transcription.text,
            summary: summary,
            language: transcription.language,
            duration: transcription.duration
        };
    }
}

// Global instance (matches aiCAD pattern)
window.aiService = new AudioAIService();
