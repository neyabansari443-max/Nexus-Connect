import { create } from 'zustand';

interface CampaignState {
  isEngineRunning: boolean;
  setEngineRunning: (status: boolean) => void;
}

export const useCampaignStore = create<CampaignState>((set) => ({
  isEngineRunning: false,
  setEngineRunning: (status) => set({ isEngineRunning: status }),
}));