import { GoogleGenAI } from '@google/genai'

let cached: GoogleGenAI | null = null

export function getGemini(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null
  if (!cached) cached = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  return cached
}

export const GEMINI_MODEL = 'gemini-2.5-flash'

export function __resetGeminiForTests() {
  cached = null
}
