/**
 * AI Service for generating mood reports
 * Gracefully handles missing API key by returning template-based reports
 */

class AIService {
    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY;
        this.enabled = !!this.apiKey && this.apiKey.length > 10;
        this.openai = null;

        if (this.enabled) {
            try {
                const OpenAI = require('openai');
                this.openai = new OpenAI({ apiKey: this.apiKey });
                // AI Service initialized
            } catch (e) {
                console.warn('⚠️ OpenAI package not installed, AI features disabled');
                this.enabled = false;
            }
        } else {
            // Template mode
        }
    }

    isEnabled() {
        return this.enabled;
    }

    async generateReport(aggregatedData, reportType = 'weekly') {
        // If AI is not enabled, return template-based report
        if (!this.enabled) {
            return this.generateTemplateReport(aggregatedData, reportType);
        }

        try {
            const prompt = this.buildPrompt(aggregatedData, reportType);

            const response = await this.openai.chat.completions.create({
                model: process.env.AI_MODEL || 'gpt-4',
                messages: [
                    { role: 'system', content: this.getSystemPrompt() },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 2000
            });

            return this.parseResponse(response.choices[0].message.content);
        } catch (error) {
            console.error('AI generation failed, falling back to template:', error.message);
            return this.generateTemplateReport(aggregatedData, reportType);
        }
    }

    getSystemPrompt() {
        return `Jesteś empatycznym, wspierającym asystentem do analizy nastroju i dobrostanu psychicznego.

KRYTYCZNE ZASADY:
1. NIGDY nie diagnozuj chorób psychicznych ani zaburzeń
2. NIGDY nie sugeruj, że użytkownik ma depresję, lęk ani inne zaburzenia
3. ZAWSZE zachęcaj do kontaktu z profesjonalistą przy poważnych problemach
4. Używaj wspierającego, ciepłego języka po polsku
5. Koncentruj się na pozytywnych aspektach i możliwościach rozwoju
6. Unikaj oceniania, krytykowania lub pouczania

Odpowiedz TYLKO w formacie JSON z następującą strukturą:
{
  "summary": "2-3 zdania podsumowujące okres",
  "patterns": [{"title": "...", "description": "...", "type": "positive/neutral/concern"}],
  "strengths": ["mocna strona 1", "mocna strona 2"],
  "suggestions": [{"title": "...", "description": "...", "category": "..."}],
  "affirmation": "pozytywna afirmacja na zakończenie"
}`;
    }

    buildPrompt(data, reportType) {
        const periodLabel = reportType === 'weekly' ? 'tygodnia' : 'miesiąca';

        return `Przeanalizuj dane o nastroju użytkownika z ostatniego ${periodLabel} i przygotuj wspierający raport.

DANE DO ANALIZY:
- Liczba wpisów nastroju: ${data.totalMoodEntries}
- Średnia intensywność emocji: ${data.averageIntensity}/10
- Najczęstszy nastrój: ${data.mostCommonMood}
- Najczęstszy powód: ${data.mostCommonReason}
- Trend nastroju: ${data.moodTrend}
- Rozkład nastrojów: ${JSON.stringify(data.moodDistribution)}

- Liczba ocen dni: ${data.totalRatings}
- Średnia ocena dnia: ${data.averageRating}/5
- Najlepszy dzień: ${data.bestDay || 'brak danych'}
- Najgorszy dzień: ${data.worstDay || 'brak danych'}

- Liczba małych zwycięstw: ${data.totalVictories}
- Kategorie zwycięstw: ${JSON.stringify(data.victoriesByCategory)}

WZORCE TYGODNIOWE:
${JSON.stringify(data.weekdayAverages)}

${data.recentNotes.length > 0 ? `OSTATNIE NOTATKI:\n${data.recentNotes.join('\n')}` : ''}

${data.recentVictories.length > 0 ? `OSTATNIE ZWYCIĘSTWA:\n${data.recentVictories.join('\n')}` : ''}

Przygotuj wspierający, pozytywny raport. Odpowiedz TYLKO w formacie JSON.`;
    }

    parseResponse(content) {
        try {
            // Extract JSON from response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    summary: parsed.summary || '',
                    patterns: parsed.patterns || [],
                    strengths: parsed.strengths || [],
                    suggestions: parsed.suggestions || [],
                    affirmation: parsed.affirmation || ''
                };
            }
        } catch (e) {
            console.error('Failed to parse AI response:', e);
        }

        // Fallback
        return {
            summary: content.substring(0, 500),
            patterns: [],
            strengths: [],
            suggestions: [],
            affirmation: ''
        };
    }

    /**
     * Template-based report generation when AI is not available
     */
    generateTemplateReport(data, reportType) {
        const periodLabel = reportType === 'weekly' ? 'tym tygodniu' : 'tym miesiącu';

        // Build summary
        let summary = `W ${periodLabel} zarejestrowałeś ${data.totalMoodEntries} wpisów nastroju`;
        if (data.averageIntensity > 0) {
            summary += ` ze średnią intensywnością ${data.averageIntensity}/10`;
        }
        if (data.totalRatings > 0) {
            summary += ` i ${data.totalRatings} ocen dni (średnia: ${data.averageRating}/5)`;
        }
        summary += '.';

        if (data.moodTrend === 'poprawa') {
            summary += ' Widać pozytywny trend w Twoim nastroju!';
        } else if (data.moodTrend === 'stabilny') {
            summary += ' Twój nastrój jest stabilny.';
        }

        // Build patterns
        const patterns = [];

        if (data.mostCommonMood && data.mostCommonMood !== 'unknown') {
            patterns.push({
                title: 'Dominujący nastrój',
                description: `Najczęściej czułeś się "${data.mostCommonMood}"`,
                type: 'neutral'
            });
        }

        if (data.mostCommonReason && data.mostCommonReason !== 'unknown') {
            patterns.push({
                title: 'Główny wpływ',
                description: `Najczęstszym powodem był: "${data.mostCommonReason}"`,
                type: 'neutral'
            });
        }

        if (data.bestDay) {
            patterns.push({
                title: 'Najlepszy dzień',
                description: `Twój najlepiej oceniony dzień to ${data.bestDay}`,
                type: 'positive'
            });
        }

        // Build strengths
        const strengths = ['Regularnie śledzisz swój nastrój'];

        if (data.totalVictories > 0) {
            strengths.push(`Zauważyłeś ${data.totalVictories} małych zwycięstw`);
        }
        if (data.totalMoodEntries >= 5) {
            strengths.push('Dbasz o świadomość emocjonalną');
        }
        if (data.totalRatings >= 3) {
            strengths.push('Regularnie oceniasz swoje dni');
        }

        // Build suggestions
        const suggestions = [];

        if (data.totalMoodEntries < 3) {
            suggestions.push({
                title: 'Więcej wpisów',
                description: 'Spróbuj zapisywać nastrój częściej, aby lepiej zrozumić swoje wzorce',
                category: 'rozwój'
            });
        }

        if (data.totalVictories === 0) {
            suggestions.push({
                title: 'Małe zwycięstwa',
                description: 'Zacznij zapisywać codzienne sukcesy, nawet te małe',
                category: 'rozwój'
            });
        }

        suggestions.push({
            title: 'Kontynuuj pracę',
            description: 'Dalej monitoruj swój nastrój i szukaj wzorców',
            category: 'rozwój'
        });

        // Affirmations pool
        const affirmations = [
            'Każdy dzień jest nową szansą. Jesteś silniejszy niż myślisz.',
            'Twoje emocje są ważne. Dziękuję, że o siebie dbasz.',
            'Masz prawo czuć to, co czujesz. Jesteś na dobrej drodze.',
            'Małe kroki prowadzą do wielkich zmian. Idź dalej.',
            'Świadomość emocji to pierwszy krok do dobrostanu.',
            'Doceniaj swoje postępy, nawet te małe.',
            'Każdy wysiłek się liczy. Jesteś wspaniały.'
        ];
        const affirmation = affirmations[Math.floor(Math.random() * affirmations.length)];

        return {
            summary,
            patterns,
            strengths,
            suggestions,
            affirmation
        };
    }
}

module.exports = new AIService();
