import { create } from 'zustand';
import type { GenerationDoc, GenerationResult } from '@/lib/firestore';

interface GenerationState {
  selectedPhotoUri: string | null;
  // Base64 body of the selected photo (no data: prefix). Kept in-memory only,
  // never persisted — too large for AsyncStorage and we want it cleared on reload.
  selectedPhotoBase64: string | null;
  currentCategoryId: string | null;
  currentResults: GenerationResult[];
  currentGenerationId: string | null;
  loading: boolean;
  error: string | null;
  history: GenerationDoc[];
  setPhoto: (uri: string | null, base64?: string | null) => void;
  clearPhoto: () => void;
  setCategory: (id: string | null) => void;
  setResults: (id: string, results: GenerationResult[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHistory: (history: GenerationDoc[]) => void;
  reset: () => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  selectedPhotoUri: null,
  selectedPhotoBase64: null,
  currentCategoryId: null,
  currentResults: [],
  currentGenerationId: null,
  loading: false,
  error: null,
  history: [],
  setPhoto: (uri, base64) =>
    set({ selectedPhotoUri: uri, selectedPhotoBase64: base64 ?? null }),
  clearPhoto: () => set({ selectedPhotoUri: null, selectedPhotoBase64: null }),
  setCategory: (currentCategoryId) => set({ currentCategoryId }),
  setResults: (currentGenerationId, currentResults) => set({ currentGenerationId, currentResults }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setHistory: (history) => set({ history }),
  reset: () =>
    set({
      selectedPhotoUri: null,
      selectedPhotoBase64: null,
      currentCategoryId: null,
      currentResults: [],
      currentGenerationId: null,
      loading: false,
      error: null,
    }),
}));
