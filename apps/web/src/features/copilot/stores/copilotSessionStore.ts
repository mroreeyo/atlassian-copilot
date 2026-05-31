import { create } from 'zustand';
import type { ChatMessage, CopilotRunView } from '@akc/shared';

interface CopilotSessionState {
  messages: ChatMessage[];
  runViewsByMessageId: Record<string, CopilotRunView>;
  activeAssistantMessageId: string | null;
  isStreaming: boolean;
  setMessages: (updater: (current: ChatMessage[]) => ChatMessage[]) => void;
  setRunViewsByMessageId: (updater: (current: Record<string, CopilotRunView>) => Record<string, CopilotRunView>) => void;
  setActiveAssistantMessageId: (id: string | null) => void;
  setIsStreaming: (value: boolean) => void;
  resetSession: () => void;
}

export const useCopilotSessionStore = create<CopilotSessionState>((set) => ({
  messages: [],
  runViewsByMessageId: {},
  activeAssistantMessageId: null,
  isStreaming: false,
  setMessages: (updater) => set((state) => ({ messages: updater(state.messages) })),
  setRunViewsByMessageId: (updater) => set((state) => ({ runViewsByMessageId: updater(state.runViewsByMessageId) })),
  setActiveAssistantMessageId: (id) => set({ activeAssistantMessageId: id }),
  setIsStreaming: (value) => set({ isStreaming: value }),
  resetSession: () => set({ messages: [], runViewsByMessageId: {}, activeAssistantMessageId: null, isStreaming: false })
}));
