import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus, Lock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { SupportForm } from '@/components/SupportForm';

interface CallsignManagerProps {
  callsigns: string[];
  onChange: (callsigns: string[]) => void;
}

export function CallsignManager({ callsigns, onChange }: CallsignManagerProps) {
  const { user } = useAuth();
  const [newCallsign, setNewCallsign] = useState('');

  const handleAdd = () => {
    const callsign = newCallsign.toUpperCase().trim();
    
    if (!callsign) {
      toast({ title: 'Please enter a callsign', variant: 'destructive' });
      return;
    }
    
    if (!/^[A-Z0-9]{3,7}$/.test(callsign)) {
      toast({ 
        title: 'Invalid callsign format', 
        description: 'Callsign should be 3-7 alphanumeric characters',
        variant: 'destructive' 
      });
      return;
    }
    
    if (callsigns.includes(callsign)) {
      toast({ title: 'Callsign already in list', variant: 'destructive' });
      return;
    }
    
    onChange([...callsigns, callsign].sort());
    setNewCallsign('');
    toast({ title: `Added ${callsign}` });
  };

  const handleRemove = (callsign: string) => {
    onChange(callsigns.filter(c => c !== callsign));
    toast({ title: `Removed ${callsign}` });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="chart-card">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Hub Callsigns</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {user ? (
            <>Add or remove hub station callsigns ({callsigns.length} active)</>
          ) : (
            <>Active hub station callsigns ({callsigns.length}). Contact support to request changes.</>
          )}
        </p>
      </div>
      
      {/* Add callsign input - only for authenticated users */}
      {user ? (
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Enter callsign (e.g., W1ABC)"
            value={newCallsign}
            onChange={(e) => setNewCallsign(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            className="flex-1 font-mono uppercase"
            maxLength={7}
          />
          <Button onClick={handleAdd} size="sm" className="gap-1">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      ) : (
        <div className="mb-4">
          <SupportForm
            defaultType="hub_callsign"
            trigger={
              <Button variant="outline" size="sm" className="gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Request Callsign Change
              </Button>
            }
          />
        </div>
      )}
      
      {/* Callsign list */}
      <div className="flex flex-wrap gap-2">
        {callsigns.map((callsign) => (
          <div
            key={callsign}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary border border-border text-sm font-mono"
          >
            <span>{callsign}</span>
            {user && (
              <button
                onClick={() => handleRemove(callsign)}
                className="p-0.5 rounded-full hover:bg-destructive/20 hover:text-destructive transition-colors"
                title={`Remove ${callsign}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      
      {callsigns.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No callsigns configured. Add some callsigns to filter the data.
        </p>
      )}
    </div>
  );
}
