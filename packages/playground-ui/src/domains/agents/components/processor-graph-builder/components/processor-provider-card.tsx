import { Badge } from '@/ds/components/Badge';
import { cn } from '@/lib/utils';
import type { ProcessorProviderInfo } from '@mastra/client-js';

interface ProcessorProviderCardProps {
  provider: ProcessorProviderInfo;
  isDragging: boolean;
}

const PHASE_SHORT_LABELS: Record<string, string> = {
  processInput: 'input',
  processInputStep: 'inputStep',
  processOutputStream: 'outStream',
  processOutputResult: 'outResult',
  processOutputStep: 'outStep',
};

export function ProcessorProviderCard({ provider, isDragging }: ProcessorProviderCardProps) {
  return (
    <div
      className={cn(
        'rounded border border-border1 bg-surface3 p-2 cursor-grab transition-shadow',
        isDragging && 'shadow-md border-accent1/50',
      )}
    >
      <p className="text-ui-sm font-medium text-neutral5">{provider.name}</p>
      {provider.description && (
        <p className="text-ui-xs text-neutral3 mt-0.5 line-clamp-2">{provider.description}</p>
      )}
      {provider.availablePhases.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {provider.availablePhases.map(phase => (
            <Badge key={phase} variant="default">
              {PHASE_SHORT_LABELS[phase] ?? phase}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
