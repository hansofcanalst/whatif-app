import { create } from 'zustand';
import type { GenerationDoc, GenerationResult } from '@/lib/firestore';

interface GenerationState {
  selectedPhotoUri: string | null;
  currentCategoryId: string | null;
  currentResults: GenerationResult[];
  currentGenerationId: string | null;
  loading: boolean;
  error: string | null;
  history: GenerationDoc[];
  setPhoto: (uri: string | null) => void;
  setCategory: (id: string | null) => void;
  setResults: (id: string, results: GenerationResult[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHistory: (history: GenerationDoc[]) => void;
  reset: () => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  selectedPhotoUri: null,
  currentCategoryId: null,
  currentResults: [],
  currentGenerationId: null,
  loading: false,
  error: null,
  history: [],
  setPhoto: (uri) => set({ selectedPhotoUri: uri }),
  setCategory: (currentCategoryId) => set({ currentCategoryId }),
  setResults: (currentGenerationId, currentResults) => set({ currentGenerationId, currentResults }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setHistory: (history) => set({ history }),
  reset: () =>
    set({
      selectedPhotoUri: null,
      currentCategoryId: null,
      currentResults: [],
      currentGenerationId: null,
      loading: false,
      error: null,
    }),
}));
