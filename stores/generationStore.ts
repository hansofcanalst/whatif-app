import { create } from 'zustand';
import type { GenerationDoc, GenerationResult } from '@/lib/firestore';
import type { DetectedPerson } from '@/lib/detect';
import {
  appendLocalGeneration,
  listLocalGallery,
  type AppendLocalGenerationArgs,
  type LocalGenerationDoc,
} from '@/lib/localGallery';

type DetectionStatus = 'idle' | 'detecting' | 'ready' | 'failed';

/**
 * A single in-flight or recently-completed result tile. The streaming
 * generate endpoint emits events that move each slot through
 * pending → complete (or → failed). The /generate/results screen
 * renders directly from this list while the stream is running, showing
 * a skeleton for pending slots and the image for complete ones.
 *
 * Order is stable: the server preserves the caller's subcategoryIds order
 * by emitting `{index}` matching its position in the request.
 */
export interface GenerationSlot {
  index: number;
  subcategoryId: string;
  label: string;
  status: 'pending' | 'complete' | 'failed';
  result?: GenerationResult;
  error?: string;
}

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

  // Progressive generation state. `generationSlots` drives the
  // /generate/results screen while a stream is in flight; each slot moves
  // pending → complete|failed as the server emits per-result events.
  // `generationInFlight` lets the UI distinguish "still streaming" from
  // "stream completed (with possible failures)" — a user-facing retry
  // affordance should only appear on the latter.
  generationSlots: GenerationSlot[];
  generationInFlight: boolean;

  // AsyncStorage-backed gallery for dev (where the local /api/generate
  // route skips Firestore writes) and as a resilient fallback for
  // production. Hydrated once at app startup via `hydrateLocalGallery`
  // and kept in sync via `appendLocalGeneration`. Gallery + Result
  // screens read from this in addition to Firestore and dedupe by id.
  localGallery: LocalGenerationDoc[];
  localGalleryHydrated: boolean;

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

  // Slot streaming actions. initSlots is called when the user kicks off
  // a generation (synchronously — so the UI can navigate to /results
  // and immediately show skeletons). resolveSlot / failSlot are called
  // by the stream consumer as events arrive. finishStream flips the
  // in-flight flag off; clearSlots wipes the list when the user starts
  // a new run or navigates away.
  initSlots: (slots: GenerationSlot[]) => void;
  resolveSlot: (index: number, result: GenerationResult) => void;
  failSlot: (index: number, error: string) => void;
  finishStream: () => void;
  clearSlots: () => void;

  hydrateLocalGallery: () => Promise<void>;
  appendLocalGeneration: (args: AppendLocalGenerationArgs) => Promise<void>;

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

  localGallery: [],
  localGalleryHydrated: false,

  generationSlots: [],
  generationInFlight: false,

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

  initSlots: (generationSlots) =>
    set({ generationSlots, generationInFlight: true, currentResults: [] }),
  resolveSlot: (index, result) => {
    const { generationSlots } = get();
    set({
      generationSlots: generationSlots.map((s) =>
        s.index === index ? { ...s, status: 'complete' as const, result, error: undefined } : s,
      ),
    });
  },
  failSlot: (index, error) => {
    const { generationSlots } = get();
    set({
      generationSlots: generationSlots.map((s) =>
        s.index === index ? { ...s, status: 'failed' as const, error } : s,
      ),
    });
  },
  finishStream: () => set({ generationInFlight: false }),
  clearSlots: () => set({ generationSlots: [], generationInFlight: false }),

  // One-shot hydration called at app startup. Safe to call multiple times;
  // re-hydration is a read-only AsyncStorage op and does not clobber any
  // in-memory entries because we replace wholesale with the canonical
  // persisted list.
  hydrateLocalGallery: async () => {
    try {
      const docs = await listLocalGallery();
      set({ localGallery: docs, localGalleryHydrated: true });
    } catch (e) {
      console.warn('[generationStore] hydrateLocalGallery failed', e);
      // Mark hydrated anyway so the UI doesn't stall on first paint.
      set({ localGalleryHydrated: true });
    }
  },

  // Single write path: persist to AsyncStorage, then mirror the returned
  // trimmed list back into the store so subscribers re-render with the
  // new entry at the top. Callers should await this so the UI is
  // consistent by the time they navigate to the gallery.
  appendLocalGeneration: async (args) => {
    const next = await appendLocalGeneration(args);
    set({ localGallery: next, localGalleryHydrated: true });
  },

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
      generationSlots: [],
      generationInFlight: false,
    }),
}));
