"use client";

import { createContext, useContext, type ReactNode } from "react";

// Whether Ask AdMate can answer (feature switched on and an API key set). While
// it can't, its buttons are hidden instead of opening an "unavailable" panel.
const AskAvailable = createContext(false);

export function AskAvailabilityProvider({ available, children }: { available: boolean; children: ReactNode }) {
  return <AskAvailable.Provider value={available}>{children}</AskAvailable.Provider>;
}

export const useAskAvailable = () => useContext(AskAvailable);
