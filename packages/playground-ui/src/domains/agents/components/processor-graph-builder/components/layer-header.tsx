import { GripVertical, Trash2 } from 'lucide-react';
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { Badge } from '@/ds/components/Badge';
import { IconButton } from '@/ds/components/IconButton';
import { useProcessorGraphBuilderContext } from './processor-graph-builder-context';
import type { BuilderLayer, BuilderLayerType } from '../types';

const LAYER_TYPE_LABELS: Record<BuilderLayerType, string> = {
  step: 'Step',
  parallel: 'Parallel',
  conditional: 'Conditional',
};

interface LayerHeaderProps {
  layer: BuilderLayer;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
}

export function LayerHeader({ layer, dragHandleProps }: LayerHeaderProps) {
  const { builder, readOnly } = useProcessorGraphBuilderContext();

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border1 bg-surface3">
      {!readOnly && (
        <div {...dragHandleProps} className="cursor-grab text-neutral3 hover:text-neutral5">
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      <Badge>{LAYER_TYPE_LABELS[layer.entry.type]}</Badge>

      {!readOnly && (
        <div className="flex items-center gap-1 ml-auto">
          <select
            value={layer.entry.type}
            onChange={e => builder.setLayerType(layer.id, e.target.value as BuilderLayerType)}
            className="text-ui-sm bg-surface4 border border-border1 rounded px-2 py-1 text-neutral5"
          >
            <option value="step">Step</option>
            <option value="parallel">Parallel</option>
            <option value="conditional">Conditional</option>
          </select>

          <IconButton
            variant="ghost"
            size="sm"
            tooltip="Remove layer"
            onClick={() => builder.removeLayer(layer.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      )}
    </div>
  );
}
