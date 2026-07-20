import type {Key} from "ink";
import {useCallback, useState} from "react";
import type {ModelChoice, RuntimeController} from "../../runtime/index.js";

export interface ModelPickerState {
  models: ModelChoice[];
  index: number;
  loading: boolean;
}

export function useModelPicker(deps: {
  runtimeRef: {current: RuntimeController | undefined};
  reportHostError: (error: unknown) => void;
  currentModel: string;
}): {
  modelPicker: ModelPickerState | undefined;
  openModelPicker: (activeModel: string) => void;
  handleModelPickerInput: (key: Key) => boolean;
} {
  const [modelPicker, setModelPicker] = useState<ModelPickerState | undefined>(
    undefined
  );

  const openModelPicker = useCallback(
    (activeModel: string): void => {
      setModelPicker({models: [], index: 0, loading: true});
      void (async () => {
        try {
          const models = (await deps.runtimeRef.current?.listModels()) ?? [];
          setModelPicker(picker =>
            picker
              ? {
                  models,
                  index: Math.max(
                    0,
                    models.findIndex(model => model.id === activeModel)
                  ),
                  loading: false
                }
              : picker
          );
        } catch (error) {
          setModelPicker(undefined);
          deps.reportHostError(error);
        }
      })();
    },
    [deps.runtimeRef, deps.reportHostError]
  );

  const handleModelPickerInput = (key: Key): boolean => {
    if (!modelPicker) return false;
    if (key.escape) {
      setModelPicker(undefined);
    } else if (key.upArrow) {
      setModelPicker(
        picker => picker && {...picker, index: Math.max(0, picker.index - 1)}
      );
    } else if (key.downArrow) {
      setModelPicker(
        picker =>
          picker && {
            ...picker,
            index: Math.min(
              Math.max(picker.models.length - 1, 0),
              picker.index + 1
            )
          }
      );
    } else if (key.return && !modelPicker.loading) {
      const choice = modelPicker.models[modelPicker.index];
      setModelPicker(undefined);
      if (choice && choice.id !== deps.currentModel) {
        void deps.runtimeRef.current
          ?.setModel(choice.id)
          .catch(deps.reportHostError);
      }
    }
    return true;
  };

  return {modelPicker, openModelPicker, handleModelPickerInput};
}
