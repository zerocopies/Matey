import React, { createContext, useContext, useState, ReactNode } from 'react';
import { UserPersona, MonthlyTarget } from '../types/persona';

interface PersonaContextType {
  persona: UserPersona;
  setPersona: (persona: UserPersona) => void;
  addTarget: (target: MonthlyTarget) => void;
  updateTargetStatus: (id: string, status: MonthlyTarget['status']) => void;
}

const defaultPersona: UserPersona = {
  name: 'Alexander',
  customTitle: 'Executive Director',
  profession: 'Renewable Energy Strategist',
  monthlyTargets: [
    { id: '1', title: 'Q3 Solar Expansion Pitch', deadline: '2026-08-30', status: 'in-progress' },
    { id: '2', title: 'Grid Storage Efficiency Audit', deadline: '2026-08-25', status: 'pending' },
  ],
};

const PersonaContext = createContext<PersonaContextType | undefined>(undefined);

export const PersonaProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [persona, setPersona] = useState<UserPersona>(defaultPersona);

  const addTarget = (target: MonthlyTarget) => {
    setPersona((prev) => ({
      ...prev,
      monthlyTargets: [...prev.monthlyTargets, target],
    }));
  };

  const updateTargetStatus = (id: string, status: MonthlyTarget['status']) => {
    setPersona((prev) => ({
      ...prev,
      monthlyTargets: prev.monthlyTargets.map((t) =>
        t.id === id ? { ...t, status } : t
      ),
    }));
  };

  return (
    <PersonaContext.Provider value={{ persona, setPersona, addTarget, updateTargetStatus }}>
      {children}
    </PersonaContext.Provider>
  );
};

export const usePersona = () => {
  const context = useContext(PersonaContext);
  if (!context) {
    throw new Error('usePersona must be used within a PersonaProvider');
  }
  return context;
};
