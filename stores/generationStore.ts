import { create } from 'zustand';
import type { GenerationDoc, GenerationResult } from '@/lib/firestore';
import type { DetectedPerson } from '@/lib/detect';

type DetectionStatus = 'idle' | 'detecting' | 'ready' | 'failed';

interface GenerationState {
  selectedPhotoUri: string | null;
  // Base64 body of the selected photo (no data: prefix). Kept in-memory only,
  // never persisted — too large for AsyncStorage and we want it cleared on reload.
  selectedPhotoBase64: string | null;

  // People detection + per-person selection. When there are 0 or 1 people,
  // selection is irrelevant and the generate call omits selectedPeopleLabels.
  detectionStatus: DetectionStatus;
  detectedPeople: DetectedPerson[];
  // Set of person ids (1-indexed) currently selected for transformation.
  // When detection finds >1 people, this starts as all ids; the user can
  // deselect to narrow down.
  selectedPersonIds: number[];

  currentCategoryId: string | null;
  currentResults: GenerationResult[];
  currentGenerationId: string | null;
  loading: boolean;
  error: string | null;
  history: GenerationDoc[];

  setPhoto: (uri: string | null, base64?: string | null) => void;
  clearPhoto: () => void;

  setDetectionStatus: (status: DetectionStatus) => void;
  setDetectedPeople: (people: DetectedPerson[]) => void;
  togglePersonSelected: (id: number) => void;
  setAllPersonSelection: (selected: boolean) => void;

  setCategory: (id: string | null) => void;
  setResults: (id: string, results: GenerationResult[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHistory: (history: GenerationDoc[]) => void;
  reset: () => void;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  selectedPhotoUri: null,
  selectedPhotoBase64: null,

  detectionStatus: 'idle',
  detectedPeople: [],
  selectedPersonIds: [],

  currentCategoryId: null,
  currentResults: [],
  currentGenerationId: null,
  loading: false,
  error: null,
  history: [],

  setPhoto: (uri, base64) => {
    // If the same photo is being re-set (a common pattern across screen
    // transitions), do NOT wipe detection state. An earlier bug routed
    // through here and silently cleared detectedPeople between the home
    // screen and generate screen, which made multi-person transforms
    // collapse back to single-subject behaviour on the server.
    const prev = get().selectedPhotoUri;
    if (uri && prev === uri) {
      set({ selectedPhotoBase64: base64 ?? get().selectedPhotoBase64 });
      return;
    }
    set({
      selectedPhotoUri: uri,
      selectedPhotoBase64: base64 ?? null,
      // Genuinely new photo (or cleared) invalidates prior detection.
      detectionStatus: 'idle',
      detectedPeople: [],
      selectedPersonIds: [],
    });
  },
  clearPhoto: () =>
    set({
      selectedPhotoUri: null,
      selectedPhotoBase64: null,
      detectionStatus: 'idle',
      detectedPeople: [],
      selectedPersonIds: [],
    }),

  setDetectionStatus: (detectionStatus) => set({ detectionStatus }),
  setDetectedPeople: (detectedPeople) =>
    set({
      detectedPeople,
      // Default everyone selected; user deselects to narrow.
      selectedPersonIds: detectedPeople.map((p) => p.id),
    }),
  togglePersonSelected: (id) => {
    const { selectedPersonIds } = get();
    const has = selectedPersonIds.includes(id);
    set({
      selectedPersonIds: has
        ? selectedPersonIds.filter((x) => x !== id)
        : [...selectedPersonIds, id].sort((a, b) => a - b),
    });
  },
  setAllPersonSelection: (selected) => {
    const { detectedPeople } = get();
    set({ selectedPersonIds: selected ? detectedPeople.map((p) => p.id) : [] });
  },

  setCategory: (currentCategoryId) => set({ currentCategoryId }),
  setResults: (currentGenerationId, currentResults) => set({ currentGenerationId, currentResults }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setHistory: (history) => set({ history }),
  reset: () =>
    set({
      selectedPhotoUri: null,
      selectedPhotoBase64: null,
      detectionStatus: 'idle',
      detectedPeople: [],
      selectedPersonIds: [],
      currentCategoryId: null,
      currentResults: [],
      currentGenerationId: null,
      loading: false,
      error: null,
    }),
}));
