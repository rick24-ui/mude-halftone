import { create } from "zustand";
import { DEFAULT_PARAMS, PointillismParams, Preset } from "@/lib/types";
import { imageToSource, SourceData } from "@/lib/engine";

export interface SavedStyle {
  id: string;
  name: string;
  createdAt: number;
  params: PointillismParams;
}

const LIB_KEY = "mude-pontilhismo-lib";

function loadLibrary(): SavedStyle[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LIB_KEY) || "[]");
  } catch {
    return [];
  }
}

function persistLibrary(lib: SavedStyle[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(lib));
  } catch {
    /* quota */
  }
}

interface AppState {
  params: PointillismParams;
  image: HTMLImageElement | null;
  source: SourceData | null;
  fileName: string;
  presetId: string | null;
  showOriginal: boolean;
  library: SavedStyle[];

  setParam: <K extends keyof PointillismParams>(key: K, value: PointillismParams[K]) => void;
  setParams: (patch: Partial<PointillismParams>) => void;
  applyPreset: (preset: Preset) => void;
  setImage: (img: HTMLImageElement, fileName: string) => void;
  setSource: (source: SourceData, fileName: string) => void;
  clearImage: () => void;
  reset: () => void;
  setShowOriginal: (v: boolean) => void;

  saveStyle: (name: string) => void;
  loadStyle: (id: string) => void;
  deleteStyle: (id: string) => void;
  hydrateLibrary: () => void;
}

export const useStore = create<AppState>((set) => ({
  params: { ...DEFAULT_PARAMS },
  image: null,
  source: null,
  fileName: "",
  presetId: null,
  showOriginal: false,
  library: [],

  setParam: (key, value) =>
    set((s) => ({ params: { ...s.params, [key]: value }, presetId: null })),

  setParams: (patch) =>
    set((s) => ({ params: { ...s.params, ...patch }, presetId: null })),

  applyPreset: (preset) =>
    set((s) => ({ params: { ...s.params, ...preset.params }, presetId: preset.id })),

  setImage: (img, fileName) =>
    set({ image: img, source: imageToSource(img), fileName }),

  setSource: (source, fileName) => set({ source, image: null, fileName }),

  clearImage: () => set({ image: null, source: null, fileName: "" }),

  reset: () => set({ params: { ...DEFAULT_PARAMS }, presetId: null }),

  setShowOriginal: (v) => set({ showOriginal: v }),

  saveStyle: (name) =>
    set((s) => {
      const entry: SavedStyle = {
        id: `s_${Date.now()}`,
        name: name.trim() || `Estilo ${s.library.length + 1}`,
        createdAt: Date.now(),
        params: { ...s.params },
      };
      const library = [entry, ...s.library];
      persistLibrary(library);
      return { library };
    }),

  loadStyle: (id) =>
    set((s) => {
      const entry = s.library.find((e) => e.id === id);
      if (!entry) return {};
      return { params: { ...entry.params }, presetId: null };
    }),

  deleteStyle: (id) =>
    set((s) => {
      const library = s.library.filter((e) => e.id !== id);
      persistLibrary(library);
      return { library };
    }),

  hydrateLibrary: () => set({ library: loadLibrary() }),
}));
