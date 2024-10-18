import React, { useReducer, useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Draggable } from 'react-beautiful-dnd';
import { FileText, Maximize2, Minimize2, Plus, Play, GripVertical, Trash2, ChevronDown, Zap, Edit2, Settings, Eye } from 'lucide-react';
import { Operation, SchemaItem, SchemaType } from '@/app/types';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useToast } from "@/hooks/use-toast"
import { Skeleton } from "@/components/ui/skeleton"
import { debounce } from 'lodash';
import { Guardrails, OutputSchema, PromptInput } from './operations/args';
import createOperationComponent from './operations/components';
import { useWebSocket } from '@/contexts/WebSocketContext';

// Separate components
const OperationHeader: React.FC<{
  name: string;
  type: string;
  disabled: boolean;
  onEdit: (name: string) => void;
  onDelete: () => void;
  onRunOperation: () => void;
  onToggleSettings: () => void;
  onShowOutput: () => void;
}> = React.memo(({ name, type, disabled, onEdit, onDelete, onRunOperation, onToggleSettings, onShowOutput }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(name);

  const handleEditClick = () => {
    setIsEditing(true);
    setEditedName(name);
  };

  const handleEditComplete = () => {
    setIsEditing(false);
    onEdit(editedName);
  };

  return (
    <div className="relative flex items-center justify-between py-3 px-4">
      {/* Left side buttons */}
      <div className="flex space-x-1 absolute left-1">
        <Button variant="ghost" size="sm" className="p-0.25 h-6 w-6" onClick={onToggleSettings}>
          <Settings size={14} className="text-gray-500" />
        </Button>
        <Button variant="ghost" size="sm" className="p-0.25 h-6 w-6" disabled={true}>
          <Zap size={14} className="text-yellow-500" />
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="p-0.25 h-6 w-6" disabled={disabled} onClick={onShowOutput}>
                <Eye size={14} className="text-blue-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Show outputs</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* <Button variant="ghost" size="sm" className="p-0.25 h-6 w-6" onClick={onRunOperation}>
          <Play size={14} className="text-green-500" />
        </Button> */}
      </div>

      {/* Centered title */}
      <div className="flex-grow flex justify-center">
        {isEditing ? (
          <Input
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleEditComplete}
            onKeyPress={(e) => e.key === 'Enter' && handleEditComplete()}
            className="text-sm font-medium w-1/2 font-mono text-center"
            autoFocus
          />
        ) : (
          <span 
            className={`text-sm font-medium cursor-pointer ${type === 'LLM' ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-transparent bg-clip-text' : ''}`}
            onClick={handleEditClick}
          >
            {name} ({type})
          </span>
        )}
      </div>

      {/* Right side delete button */}
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={onDelete}
        className="hover:bg-red-100 absolute right-1 p-1 h-7 w-7"
      >
        <Trash2 size={15} className="text-red-500" />
      </Button>
    </div>
  );
});

const SettingsModal: React.FC<{
  opName: string;
  opType: string;
  isOpen: boolean;
  onClose: () => void;
  otherKwargs: Record<string, string>;
  onSettingsSave: (newSettings: Record<string, string>) => void;
}> = React.memo(({ opName, opType, isOpen, onClose, otherKwargs, onSettingsSave }) => {
  const [localSettings, setLocalSettings] = React.useState<Array<{ id: number; key: string; value: string }>>(
    Object.entries(otherKwargs).map(([key, value], index) => ({ id: index, key, value }))
  );

  useEffect(() => {
    setLocalSettings(Object.entries(otherKwargs).map(([key, value], index) => ({ id: index, key, value })));
  }, [otherKwargs]);

  const handleSettingsChange = (id: number, newKey: string, newValue: string) => {
    setLocalSettings(prev => prev.map(setting => 
      setting.id === id ? { ...setting, key: newKey, value: newValue } : setting
    ));
  };

  const addSetting = () => {
    setLocalSettings(prev => [...prev, { id: prev.length, key: '', value: '' }]);
  };

  const removeSetting = (id: number) => {
    setLocalSettings(prev => prev.filter(setting => setting.id !== id));
  };

  const handleSave = () => {
    const newSettings = localSettings.reduce((acc, { key, value }) => {
      if (key !== '' && value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>);
    onSettingsSave(newSettings);
    onClose();
  };

  const isValidSettings = () => {
    const keys = localSettings.map(({ key }) => key);
    return localSettings.every(({ key, value }) => key !== '' && value !== '') &&
           new Set(keys).size === keys.length;
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{opName}</DialogTitle>
          <DialogDescription>
            Add or modify additional arguments for this {opType} operation.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {localSettings.map(({ id, key, value }) => (
            <div key={id} className="flex items-center gap-4">
              <Input
                className="flex-grow font-mono"
                value={key}
                onChange={(e) => handleSettingsChange(id, e.target.value, value)}
                placeholder="Key"
              />
              <Input
                className="flex-grow font-mono"
                value={value}
                onChange={(e) => handleSettingsChange(id, key, e.target.value)}
                placeholder="Value"
              />
              <Button variant="ghost" size="sm" onClick={() => removeSetting(id)}>
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
          <Button onClick={addSetting}>Add Setting</Button>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!isValidSettings()}>Save</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

// Action types
type Action =
  | { type: 'SET_OPERATION'; payload: Operation }
  | { type: 'UPDATE_NAME'; payload: string }
  | { type: 'UPDATE_PROMPT'; payload: string }
  | { type: 'UPDATE_SCHEMA'; payload: SchemaItem[] }
  | { type: 'UPDATE_GUARDRAILS'; payload: string[] }
  | { type: 'TOGGLE_EDITING' }
  | { type: 'TOGGLE_SCHEMA' }
  | { type: 'TOGGLE_GUARDRAILS' }
  | { type: 'TOGGLE_SETTINGS' }
  | { type: 'SET_RUN_INDEX'; payload: number }
  | { type: 'UPDATE_SETTINGS'; payload: Record<string, string> };

// State type
type State = {
  operation: Operation | undefined;
  isEditing: boolean;
  isSchemaExpanded: boolean;
  isGuardrailsExpanded: boolean;
  isSettingsOpen: boolean;
};

// Reducer function
function operationReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_OPERATION':
      return { ...state, operation: action.payload };
    case 'UPDATE_NAME':
      return state.operation ? { ...state, operation: { ...state.operation, name: action.payload } } : state;
    case 'UPDATE_PROMPT':
      return state.operation ? { ...state, operation: { ...state.operation, prompt: action.payload } } : state;
    case 'UPDATE_SCHEMA':
      return state.operation
        ? {
            ...state,
            operation: {
              ...state.operation,
              output: {
                ...state.operation.output,
                schema: action.payload
              }
            }
          }
        : state;
  
    case 'UPDATE_GUARDRAILS':
      return state.operation ? { ...state, operation: { ...state.operation, validate: action.payload } } : state;
    case 'TOGGLE_EDITING':
      return { ...state, isEditing: !state.isEditing };
    case 'TOGGLE_SCHEMA':
      return { ...state, isSchemaExpanded: !state.isSchemaExpanded };
    case 'TOGGLE_GUARDRAILS':
      return { ...state, isGuardrailsExpanded: !state.isGuardrailsExpanded };
    case 'TOGGLE_SETTINGS':
      return { ...state, isSettingsOpen: !state.isSettingsOpen };
    case 'UPDATE_SETTINGS':
      return state.operation ? { ...state, operation: { ...state.operation, otherKwargs: action.payload } } : state;
    case 'SET_RUN_INDEX':
      return state.operation ? { ...state, operation: { ...state.operation, runIndex: action.payload } } : state;
    default:
      return state;
  }
}

// Initial state
const initialState: State = {
  operation: undefined,
  isEditing: false,
  isSchemaExpanded: false,
  isGuardrailsExpanded: false,
  isSettingsOpen: false,
};

// Main component
export const OperationCard: React.FC<{ index: number }> = ({ index }) => {
  const [state, dispatch] = useReducer(operationReducer, initialState);
  const { operation, isEditing, isSchemaExpanded, isGuardrailsExpanded, isSettingsOpen } = state;

  const { output: pipelineOutput, setOutput, isLoadingOutputs, setIsLoadingOutputs, numOpRun, setNumOpRun, currentFile, operations, setOperations, pipelineName, sampleSize, setCost, defaultModel, setTerminalOutput } = usePipelineContext();
  const { toast } = useToast();

  const operationRef = useRef(operation);
  const { connect, sendMessage, lastMessage, readyState, disconnect } = useWebSocket();

  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'output') {
        setTerminalOutput(lastMessage.data);
      } else if (lastMessage.type === 'result') {
        const runCost = lastMessage.data.cost || 0;
        setCost(prevCost => prevCost + runCost);
        toast({
          title: "Operation Complete",
          description: `The operation cost $${runCost.toFixed(4)}`,
          duration: 3000,
        });
        
        // Close the WebSocket connection
        disconnect();

        setIsLoadingOutputs(false);
      } else if (lastMessage.type === 'error') {
        toast({
          title: "Error",
          description: lastMessage.data,
          variant: "destructive",
        });

        // Close the WebSocket connection
        disconnect();

        setIsLoadingOutputs(false);
      }
    }
  }, [lastMessage, setCost, setIsLoadingOutputs, setTerminalOutput]);

  useEffect(() => {
    operationRef.current = operation;
  }, [operation]);

  useEffect(() => {
    dispatch({ type: 'SET_OPERATION', payload: operations[index] });

    // Also dispatch the runIndex update
    if (operations[index].runIndex !== undefined) {
      dispatch({ type: 'SET_RUN_INDEX', payload: operations[index].runIndex });
    }

  }, [operations, index]);


  const debouncedUpdate = useCallback(
    debounce(() => {
      if (operationRef.current) {
        const updatedOperation = { ...operationRef.current };
        setOperations(prev => prev.map(op => op.id === updatedOperation.id ? updatedOperation : op));
      }
    }, 500),
    [setOperations]
  );

  const handleOperationUpdate = useCallback((updatedOperation: Operation) => {
    dispatch({ type: 'SET_OPERATION', payload: updatedOperation });
    debouncedUpdate();
  }, [debouncedUpdate]);

  const handleRunOperation = useCallback(async () => {
    if (!operation) return;
    setIsLoadingOutputs(true);
    setNumOpRun(prevNum => {
      const newNum = prevNum + 1;
      dispatch({ type: 'SET_RUN_INDEX', payload: newNum });
      return newNum;
    });

    setTerminalOutput('');

    try {
      const response = await fetch('/api/writePipelineConfig', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          default_model: defaultModel,
          data: { path: currentFile?.path || '' },
          operations,
          operation_id: operation.id,
          name: pipelineName,
          sample_size: sampleSize
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to write pipeline config');
      }

      const { filePath, inputPath, outputPath } = await response.json();

      setOutput({
        operationId: operation.id,
        path: outputPath,
        inputPath: inputPath
      });

      // Ensure the WebSocket is connected before sending the message
      await connect();

      sendMessage({
        yaml_config: filePath
      });
    } catch (error) {
      console.error('Error writing pipeline config:', error);
      toast({
        title: "Error",
        description: "Failed to write pipeline configuration",
        variant: "destructive",
      });
      // Close the WebSocket connection
      disconnect();
      setIsLoadingOutputs(false);
    }
  }, [operation, currentFile, operations, setIsLoadingOutputs, setNumOpRun, sendMessage, readyState, defaultModel, pipelineName, sampleSize]);


  const handleSettingsSave = useCallback((newSettings: Record<string, string>) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: newSettings });
    if (operation) {
      const updatedOperation = { ...operation, otherKwargs: newSettings };
      setOperations(prev => prev.map(op => op.id === updatedOperation.id ? updatedOperation : op));
    }
  }, [operation, setOperations]);

  const handleSchemaUpdate = (newSchema: SchemaItem[]) => {
    dispatch({ type: 'UPDATE_SCHEMA', payload: newSchema });
    debouncedUpdate();
  };

  const onShowOutput = useCallback(async () => {
    if (!operation) return;

    try {
      const response = await fetch('/api/getInputOutput', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          default_model: defaultModel,
          data: { path: currentFile?.path || '' },
          operations,
          operation_id: operation.id,
          name: pipelineName,
          sample_size: sampleSize
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get input and output paths');
      }

      const { inputPath, outputPath } = await response.json();

      setOutput({
        operationId: operation.id,
        path: outputPath,
        inputPath: inputPath
      });
    } catch (error) {
      console.error('Error fetching input and output paths:', error);
      toast({
        title: "Error",
        description: "Failed to get input and output paths",
        variant: "destructive",
      });
    }
  }, [operation, defaultModel, currentFile, operations, pipelineName, sampleSize, setOutput, toast]);

  if (!operation) {
    return <SkeletonCard />;
  }

  return (
    <div className="flex items-start w-full">
      <div className="mr-1 w-8 h-8 flex-shrink-0 flex items-center justify-center bg-gray-100 text-gray-600 font-mono text-xs rounded-sm shadow-sm">
      {isLoadingOutputs ? (
          <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-gray-900"></div>
        ) : operation.runIndex ? (
          <>[{operation.runIndex}]</>
        ) : (
          <>[ ]</>
        )}
      </div>
    <Draggable draggableId={operation.id} index={index}>
      {(provided) => (
        <Card ref={provided.innerRef} {...provided.draggableProps} className="mb-2 relative rounded-sm bg-white shadow-sm w-full">
          <div {...provided.dragHandleProps} className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center cursor-move hover:bg-gray-100">
            <GripVertical size={14} />
          </div>
          <div className="ml-5">
          <OperationHeader
            name={operation.name}
            type={operation.type}
            disabled={isLoadingOutputs || pipelineOutput === undefined}
            onEdit={(name) => {
              dispatch({ type: 'UPDATE_NAME', payload: name });
              debouncedUpdate();
            }}
            onDelete={() => setOperations(prev => prev.filter(op => op.id !== operation.id))}
            onRunOperation={handleRunOperation}
            onToggleSettings={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
            onShowOutput={onShowOutput}
          />
            <CardContent className="py-2 px-3">
              {createOperationComponent(operation, handleOperationUpdate,isSchemaExpanded, () => dispatch({ type: 'TOGGLE_SCHEMA' }))}
{/*               
              {operation.llmType === 'LLM' && (
                <>
                  <PromptInput
                    prompt={operation.prompt || ''}
                    onChange={handlePromptChange}
                />
                  <OutputSchema
                    schema={schemaItems}
                    onUpdate={handleSchemaUpdate}
                    isExpanded={isSchemaExpanded}
                    onToggle={() => dispatch({ type: 'TOGGLE_SCHEMA' })}
                  />
                </>
              )} */}
            </CardContent>
            {operation.llmType === 'LLM' && (
              <Guardrails
                guardrails={operation.validate || []}
                onUpdate={(newGuardrails) => dispatch({ type: 'UPDATE_GUARDRAILS', payload: newGuardrails })}
                isExpanded={isGuardrailsExpanded}
                onToggle={() => dispatch({ type: 'TOGGLE_GUARDRAILS' })}
              />
            )}
            <SettingsModal
              opName={operation.name}
              opType={operation.type}
              isOpen={isSettingsOpen}
              onClose={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
              otherKwargs={operation.otherKwargs || {}}
              onSettingsSave={handleSettingsSave}
            />
          </div>
        </Card>
      )}
    </Draggable>
    </div>
  );
};

const SkeletonCard: React.FC = () => (
  <div className="flex items-start w-full">
    <div className="mr-1 w-8 h-8 flex-shrink-0 flex items-center justify-center bg-gray-200 rounded-sm">
      <Skeleton className="h-3 w-3" />
    </div>
    <Card className="mb-2 relative rounded-sm bg-white shadow-sm w-full">
      <CardHeader className="flex justify-between items-center py-2 px-3">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-16 w-full mb-1" />
        <Skeleton className="h-3 w-2/3" />
      </CardContent>
    </Card>
  </div>
);

export default OperationCard;