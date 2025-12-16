import { GoogleGenAI } from "@google/genai";
import { AppMode } from '../types';

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });

const SYSTEM_INSTRUCTIONS: Record<string, string> = {
  default: "คุณคือผู้ช่วยธุรกิจอัจฉริยะสำหรับร้านค้า (Sabaidee POS) ให้ตอบเป็นภาษาไทยเสมอ แต่หากผู้ใช้ถามเกี่ยวกับการแปลภาษาลาว ให้ตอบเป็นภาษาลาวได้ มีความรู้เรื่องการขาย การตลาด และการจัดการสต็อก ให้คำแนะนำที่สุภาพและเป็นประโยชน์"
};

export const streamResponse = async (
  prompt: string, 
  mode: AppMode,
  history: { role: string, parts: { text: string }[] }[]
) => {
  try {
    const modelId = 'gemini-2.5-flash';
    
    // Only AI mode uses the chat interface in this new app structure
    if (mode === AppMode.AI) {
      const chat = ai.chats.create({
        model: modelId,
        config: {
          systemInstruction: SYSTEM_INSTRUCTIONS.default,
        },
        history: history
      });

      return await chat.sendMessageStream({ message: prompt });
    }
    
    return null;

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};