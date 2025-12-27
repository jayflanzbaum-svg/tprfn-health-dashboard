import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MapPin, RefreshCw, Edit2, Check, X, Loader2 } from 'lucide-react';
import { StationLocation, useStationLocations } from '@/hooks/useStationLocations';
import { toast } from '@/hooks/use-toast';

interface StationLocationsManagerProps {
  callsigns: string[];
}

export function StationLocationsManager({ callsigns }: StationLocationsManagerProps) {
  const { locations, loading, lookupCallsigns, updateLocation } = useStationLocations();
  const [isOpen, setIsOpen] = useState(false);
  const [editingCallsign, setEditingCallsign] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ grid_square: '', latitude: '', longitude: '' });

  const handleLookupAll = async () => {
    try {
      await lookupCallsigns(callsigns);
      toast({
        title: 'Locations updated',
        description: `Looked up ${callsigns.length} callsigns from HamQTH`,
      });
    } catch (err) {
      toast({
        title: 'Lookup failed',
        description: 'Failed to fetch some callsign locations',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (callsign: string) => {
    const loc = locations.get(callsign.toUpperCase());
    setEditingCallsign(callsign);
    setEditForm({
      grid_square: loc?.grid_square || '',
      latitude: loc?.latitude?.toString() || '',
      longitude: loc?.longitude?.toString() || '',
    });
  };

  const handleSave = async () => {
    if (!editingCallsign) return;
    
    try {
      await updateLocation(editingCallsign, {
        grid_square: editForm.grid_square || null,
        latitude: editForm.latitude ? parseFloat(editForm.latitude) : null,
        longitude: editForm.longitude ? parseFloat(editForm.longitude) : null,
      });
      setEditingCallsign(null);
      toast({
        title: 'Location saved',
        description: `Updated location for ${editingCallsign}`,
      });
    } catch (err) {
      toast({
        title: 'Save failed',
        description: 'Failed to save location',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    setEditingCallsign(null);
    setEditForm({ grid_square: '', latitude: '', longitude: '' });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <MapPin className="h-4 w-4" />
          Station Locations
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Station Locations</DialogTitle>
          <DialogDescription>
            Manage station locations for distance calculations. Locations are fetched from HamQTH or can be manually entered.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex justify-end mb-4">
          <Button onClick={handleLookupAll} disabled={loading} size="sm" className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Fetch All from HamQTH
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Callsign</TableHead>
              <TableHead>Grid Square</TableHead>
              <TableHead>Lat/Long</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {callsigns.map(callsign => {
              const loc = locations.get(callsign.toUpperCase());
              const isEditing = editingCallsign === callsign;
              
              return (
                <TableRow key={callsign}>
                  <TableCell className="font-mono font-medium">{callsign}</TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        value={editForm.grid_square}
                        onChange={e => setEditForm(f => ({ ...f, grid_square: e.target.value }))}
                        placeholder="e.g., FN42ab"
                        className="w-24 h-8"
                      />
                    ) : (
                      loc?.grid_square || <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Input
                          value={editForm.latitude}
                          onChange={e => setEditForm(f => ({ ...f, latitude: e.target.value }))}
                          placeholder="Lat"
                          className="w-20 h-8"
                          type="number"
                          step="0.0001"
                        />
                        <Input
                          value={editForm.longitude}
                          onChange={e => setEditForm(f => ({ ...f, longitude: e.target.value }))}
                          placeholder="Long"
                          className="w-20 h-8"
                          type="number"
                          step="0.0001"
                        />
                      </div>
                    ) : loc?.latitude && loc?.longitude ? (
                      <span className="text-xs">
                        {loc.latitude.toFixed(2)}, {loc.longitude.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {[loc?.city, loc?.state, loc?.country].filter(Boolean).join(', ') || '—'}
                  </TableCell>
                  <TableCell>
                    {loc?.is_manual_override ? (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Manual</span>
                    ) : loc?.source ? (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded">{loc.source}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave}>
                          <Check className="h-4 w-4 text-green-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(callsign)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
