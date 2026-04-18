import { createContext, useCallback, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { JsonModal } from './json-modal';

interface ModalEntry {
  id: string;
  title: string;
  data: unknown;
  position: { x: number; y: number };
}

interface JsonModalContextType {
  openModal: (title: string, data: unknown) => void;
}

const JsonModalContext = createContext<JsonModalContextType>({ openModal: () => {} });

export function useJsonModal() {
  return useContext(JsonModalContext);
}

let modalCounter = 0;

export function JsonModalProvider({ children }: { children: React.ReactNode }) {
  const [modals, setModals] = useState<ModalEntry[]>([]);

  const openModal = useCallback((title: string, data: unknown) => {
    const id = `modal-${++modalCounter}`;
    // Cascade new modals so they don't stack exactly on top of each other
    const offset = (modals.length % 5) * 30;
    setModals((prev) => [...prev, {
      id,
      title,
      data,
      position: { x: 120 + offset, y: 80 + offset },
    }]);
  }, [modals.length]);

  const closeModal = useCallback((id: string) => {
    setModals((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return (
    <JsonModalContext.Provider value={{ openModal }}>
      {children}
      {createPortal(
        <>
          {modals.map((m) => (
            <JsonModal
              key={m.id}
              title={m.title}
              data={m.data}
              initialPosition={m.position}
              onClose={() => closeModal(m.id)}
            />
          ))}
        </>,
        document.body,
      )}
    </JsonModalContext.Provider>
  );
}
